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

const findUserDisplayName = async (userId, prisma, pool) => {
  if (!userId) return null;

  const cleanId = normalizeUserId(userId);

  const prismaUser = await prisma.user.findUnique({
    where: { user_id: cleanId },
    select: { display_name: true },
  });

  if (prismaUser) return prismaUser.display_name;

  const { rows } = await pool.query(
    `SELECT display_name FROM entra.users 
     WHERE split_part(user_id, '.', 1) = $1
     LIMIT 1`,
    [cleanId]
  );

  return rows[0]?.display_name || null;
};

function safeParse(json, fallback = null) {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

async function createMessage(log, options = {}, prisma, pool) {
  if (!log.action) return '';

  const { isForOwner = false, affectedUserName = null } = options;

  const oldObj = safeParse(log.oldValue);
  const newObj = safeParse(log.newValue);

  const table = (log.table || '').toLowerCase();
  const action = (log.action || '').toLowerCase();

  const isCreate = action.includes('create');
  const isUpdate = action.includes('update');
  const isDelete = action.includes('delete');

  const legalName =
    (await findUserDisplayName(log.userId, prisma, pool)) || '(Administrator User)';

  let actionVerb = isCreate ? 'created' : isUpdate ? 'updated' : isDelete ? 'deleted' : '';
  const emoji = isCreate ? '🟢' : isUpdate ? '🔵' : '🔴';

  let targetLabel = table;
  if (table.includes('carriers')) {
    const carrierObj = Array.isArray(newObj) ? newObj[0] : newObj || {};
    targetLabel = `carrier ${carrierObj?.company ?? '(unknown carrier)'}`;
  } else if (table.includes('user')) {
    targetLabel = 'user';
  }

  if (!isForOwner) {
    return `${emoji} ${legalName} ${actionVerb} a ${targetLabel}.`;
  } else {
    const affectedPart = affectedUserName ? ` in ${affectedUserName}` : '';
    return `${emoji} ${legalName} ${actionVerb} ${targetLabel}${affectedPart}.`;
  }
}


prisma.$use(async (params, next) => {
  const skipModels = ['Logs', 'Notificacion'];
  if (skipModels.includes(params.model)) return next(params);

  const writeActions = [
    'create', 'update', 'delete', 'upsert',
    'createMany', 'updateMany', 'deleteMany'
  ];

  if (!writeActions.includes(params.action)) return next(params);

  const store = prismaContext.getStore();
  const actorUserId = store?.userId || "unknown";
  const affectedUserIds = store?.affectedUserIds || [];

  let oldValue = null;
  let newValue = null;
  let actionType = params.action;

  if (params.action === 'upsert') {
    try {
      oldValue = await prisma[params.model].findUnique({ where: params.args.where });
      actionType = oldValue ? 'update' : 'create';
    } catch (err) {
      console.warn("Failed to determine upsert type:", err.message);
    }
  }

  if (['update', 'delete', 'updateMany', 'deleteMany'].includes(params.action)) {
    try {
      if (params.action.endsWith('Many')) {
        oldValue = await prisma[params.model].findMany({ where: params.args.where || {} });
      } else if (params.args.where) {
        oldValue = await prisma[params.model].findUnique({ where: params.args.where });
      }
    } catch (err) {
      console.warn("Failed to fetch oldValue:", err.message);
    }
  }

  const result = await next(params);

  if ((params.action === 'updateMany' || params.action === 'deleteMany') && result.count === 0)
    return result;

  try {
    if (params.action === 'create') {
      newValue = result || params.args?.data || null;
    } else if (params.action === 'createMany') {
      newValue = params.args.data || [];
    } else if (['update', 'upsert'].includes(params.action) && params.args.where) {
      newValue = await prisma[params.model].findUnique({ where: params.args.where });
    } else if (params.action === 'updateMany') {
      const updatedIds = oldValue?.map(i => i.id) || [];
      if (updatedIds.length > 0) {
        newValue = await prisma[params.model].findMany({ where: { id: { in: updatedIds } } });
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
    const log = { userId: actorUserId, action: `[${params.model}] ${actionType}`, table: params.model, oldValue: oldStr, newValue: newStr };

    for (const targetUserId of affectedUserIds) {
      const message = await createMessage(log, { isForOwner: false }, prisma, pool);
      if (message) {
        await prisma.notificacion.create({
          data: { userId: targetUserId, message, createdBy: actorUserId },
        });
      }

      const personalInfo = await prisma.personalInfo.findUnique({
        where: { userId: targetUserId },
        select: { agency: true, franchise: true, legalName: true },
      });
      if (!personalInfo) continue;

      const hierarchy = await reverseGetAllAgencies(personalInfo.agency, personalInfo.franchise);
      for (const level of hierarchy) {
        if (!level.isAgency) continue;

        const agency = await prisma.agency.findUnique({
          where: { id: level.id },
          select: { owner: true },
        });

        if (agency?.owner && agency.owner !== actorUserId) {
          const ownerMessage = await createMessage(
            log,
            { isForOwner: true, affectedUserName: personalInfo.legalName },
            prisma,
            pool
          );

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
  } catch (notifErr) {
    console.warn("Failed to create notification:", notifErr.message);
  }

  return result;
});

export { pool, prisma, sessionStore };
