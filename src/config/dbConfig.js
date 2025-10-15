import dotenv from "dotenv";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pkg from "pg";
import { PrismaClient } from "@prisma/client";
import { prismaContext } from "./prismaContext.js";
import { reverseGetAllAgencies } from "../config/utils.js";

const { Pool } = pkg;

dotenv.config();

const PgStore = connectPgSimple(session);

const connectionString = process.env.DATABASE_URL

let sessionStore;
let pool;

try {
  pool = new Pool({ connectionString });

  // Optional: test connection before using it
  await pool.query("SELECT 1"); // simple test query

  sessionStore = new PgStore({
    pool,
    tableName: "session",
    createTableIfMissing: true,
  });

  console.log("✅ Connected to PostgreSQL session store");
} catch (error) {
  console.warn("⚠️ PostgreSQL not available, using MemoryStore for sessions");

  // Use MemoryStore only in development
  sessionStore = undefined; // fallback will use default MemoryStore
}

// Initialize Prisma Client
const prisma = new PrismaClient();

function safeParse(json, fallback = null) {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

async function createMessage(log, options = {}) {
  if (!log.action) return '';

  const { isForOwner = false, affectedUserName = null } = options;

  const oldObj = safeParse(log.oldValue, null);
  const newObj = safeParse(log.newValue, null);

  const table = (log.table || '').toLowerCase();
  const action = (log.action || '').toLowerCase();

  const isCreate = action.includes('create');
  const isUpdate = action.includes('update');
  const isDelete = action.includes('delete');

  const userId = log.userId;
  const personalInfo = await prisma.personalInfo.findUnique({ where: { userId } });
  const legalName = personalInfo?.legalName || '(Administrator User)';

  let message = '';
  let actionVerb = '';

  if (isCreate) actionVerb = 'created';
  else if (isUpdate) actionVerb = 'updated';
  else if (isDelete) actionVerb = 'deleted';

  // Base emoji depending on action
  const emoji = isCreate ? '🟢' : isUpdate ? '🔵' : '🔴';

  // Determine target label (table and entity name)
  let targetLabel = table;
  if (table.includes('carriers')) {
    const carrierObj = Array.isArray(newObj) ? newObj[0] : newObj || {};
    const company = carrierObj?.company ?? '(unknown carrier)';
    targetLabel = `carrier ${company}`;
  } else if (table.includes('user')) {
    targetLabel = 'user';
  }

  // If notification is for the affected user
  if (!isForOwner) {
    message = `${emoji} ${legalName} ${actionVerb} a ${targetLabel}.`;
  }
  // If notification is for owners or higher hierarchy
  else {
    const affectedPart = affectedUserName ? ` in ${affectedUserName}` : '';
    message = `${emoji} ${legalName} ${actionVerb} ${targetLabel}${affectedPart}.`;
  }

  return message;
}


prisma.$use(async (params, next) => {
  if (params.model === 'Logs') return next(params);

  const writeActions = [
    'create', 'update', 'delete',
    'upsert', 'createMany', 'updateMany', 'deleteMany'
  ];

  if (!writeActions.includes(params.action)) return next(params);

  const store = prismaContext.getStore();
  const actorUserId = store?.userId || "unknown";
  const affectedUserIds = store?.affectedUserIds || [];

  let oldValue = null;
  let newValue = null;
  let actionType = params.action;

  // Handle UPSERT separately
  if (params.action === 'upsert') {
    try {
      oldValue = await prisma[params.model].findUnique({
        where: params.args.where,
      });
      actionType = oldValue ? 'update' : 'create';
    } catch (err) {
      console.warn("Failed to determine upsert type:", err.message);
    }
  }

  // Handle pre-fetching OLD VALUE
  if (['update', 'delete', 'updateMany', 'deleteMany'].includes(params.action)) {
    try {
      if (params.action.endsWith('Many')) {
        oldValue = await prisma[params.model].findMany({
          where: params.args.where || {},
        });
      } else if (params.args.where) {
        oldValue = await prisma[params.model].findUnique({
          where: params.args.where,
        });
      }
    } catch (err) {
      console.warn("Failed to fetch oldValue:", err.message);
    }
  }

  const result = await next(params);

  if ((params.action === 'updateMany' || params.action === 'deleteMany') && result.count === 0) {
    return result;
  }

  // Fetch NEW VALUE
  try {
    if (params.action === 'create') {
      newValue = result || params.args?.data || null;
    } else if (params.action === 'createMany') {
      newValue = params.args.data || [];
    } else if (params.action === 'update') {
      if (params.args.where) {
        newValue = await prisma[params.model].findUnique({
          where: params.args.where,
        });
      }
    } else if (params.action === 'updateMany') {
      const updatedIds = oldValue?.map(item => item.id) || [];
      if (updatedIds.length > 0) {
        newValue = await prisma[params.model].findMany({
          where: { id: { in: updatedIds } },
        });
      }
    } else if (params.action === 'upsert') {
      if (params.args.where) {
        newValue = await prisma[params.model].findUnique({
          where: params.args.where,
        });
      }
    }
  } catch (err) {
    console.warn("Failed to fetch newValue:", err.message);
  }

  const oldStr = oldValue ? JSON.stringify(oldValue) : null;
  const newStr = newValue ? JSON.stringify(newValue) : null;

  if (oldStr !== newStr) {
    try {
      await prisma.logs.create({
        data: {
          userId: actorUserId,
          action: `[${params.model}] ${actionType}`,
          table: params.model,
          oldValue: oldStr,
          newValue: newStr,
        },
      });
    } catch (err) {
      console.warn("Failed to save log:", err.message);
    }
  }

  try {
    const log = {
      userId: actorUserId,
      action: `[${params.model}] ${actionType}`,
      table: params.model,
      oldValue: oldStr,
      newValue: newStr,
    };

    console.log("Log entry:", log);

    // Notify affected users
    for (const targetUserId of affectedUserIds) {
      console.log(`Creating notification for user: ${targetUserId}`);
      // Create notification for the affected user
      const message = await createMessage(log, { isForOwner: false });

      if (message) {
        await prisma.notificacion.create({
          data: {
            userId: targetUserId,
            message,
            createdBy: actorUserId,
          },
        });
      }

      // Notify owners up the hierarchy
      const personalInfo = await prisma.personalInfo.findUnique({
        where: { userId: targetUserId },
        select: { agency: true, franchise: true, legalName: true },
      });

      if (!personalInfo) continue;

      const hierarchy = await reverseGetAllAgencies(personalInfo.agency, personalInfo.franchise);

      for (const level of hierarchy) {
        if (level.isAgency) {
          const agency = await prisma.agency.findUnique({
            where: { id: level.id },
            select: { owner: true },
          });

          if (agency?.owner && agency.owner !== actorUserId) {
            const ownerMessage = await createMessage(log, {
              isForOwner: true,
              affectedUserName: personalInfo.legalName,
            });

            await prisma.notificacion.create({
              data: {
                userId: agency.owner,
                message: `👤 ${ownerMessage}`,
                createdBy: actorUserId,
              },
            });
          }
        }
      }
    }

  } catch (notifErr) {
    console.warn("Failed to create notification:", notifErr.message);
  }

  return result;
});

export { pool, prisma, sessionStore };
