import dotenv from "dotenv";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pkg from "pg";
import { PrismaClient } from "@prisma/client";
import { prismaContext } from "./prismaContext.js";
import { reverseGetAllAgencies, createMessage, getAgencyOwnerIds } from "../config/utils.js";

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

prisma.$use(async (params, next) => {
  const skipModels = ['Logs', 'Notificacion'];
  if (skipModels.includes(params.model)) return next(params);

  const writeActions = [
    'create', 'update', 'delete',
    'upsert', 'createMany', 'updateMany', 'deleteMany'
  ];
  if (!writeActions.includes(params.action)) return next(params);

  const store = prismaContext.getStore();
  const actorUserId = store?.userId || store?.requesterId || "unknown";
  const affectedUserIds = store?.affectedUserIds || [];

  let oldValue = null;
  let newValue = null;
  let actionType = params.action;

  // Handle UPSERT separately
  if (params.action === 'upsert') {
    try {
      oldValue = await prisma[params.model].findUnique({ where: params.args.where });
      actionType = oldValue ? 'update' : 'create';
    } catch (err) {
      console.warn("Failed to determine upsert type:", err.message);
    }
  }

  // Fetch OLD value for update/delete actions
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

  // Skip if nothing updated/deleted
  if ((params.action === 'updateMany' || params.action === 'deleteMany') && result.count === 0) {
    return result;
  }

  // Fetch NEW value
  try {
    if (params.action === 'create') {
      newValue = result || params.args?.data || null;
    } else if (params.action === 'createMany') {
      newValue = params.args.data || [];
    } else if (params.action === 'update' && params.args.where) {
      newValue = await prisma[params.model].findUnique({ where: params.args.where });
    } else if (params.action === 'updateMany') {
      const updatedIds = oldValue?.map(item => item.id) || [];
      if (updatedIds.length > 0) {
        newValue = await prisma[params.model].findMany({ where: { id: { in: updatedIds } } });
      }
    } else if (params.action === 'upsert' && params.args.where) {
      newValue = await prisma[params.model].findUnique({ where: params.args.where });
    }
  } catch (err) {
    console.warn("Failed to fetch newValue:", err.message);
  }

  const oldStr = oldValue ? JSON.stringify(oldValue) : null;
  const newStr = newValue ? JSON.stringify(newValue) : null;

  // Save log if something changed
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

  // Fetch only existing users for notifications
  const existingUsers = await prisma.user.findMany({
    where: { user_id: { in: affectedUserIds } },
    select: { user_id: true, personalInfo: true },
  });

  for (const user of existingUsers) {
    try {
      const log = {
        userId: actorUserId,
        action: `[${params.model}] ${actionType}`,
        table: params.model,
        oldValue: oldStr,
        newValue: newStr,
      };

      // Notify the affected user
      const message = await createMessage(log, { isForOwner: false });
      if (message) {
        await prisma.notificacion.create({
          data: {
            userId: user.user_id,
            message,
            createdBy: actorUserId,
          },
        });
      }

      // Notify hierarchy/owners
      const personalInfo = await prisma.personalInfo.findUnique({
        where: { userId: user.user_id },
        select: { agency: true, franchise: true, legalName: true },
      });

      if (!personalInfo) continue;

      const hierarchy = await reverseGetAllAgencies(personalInfo.agency, personalInfo.franchise);
      const notifiedOwners = new Set();

      for (const level of hierarchy) {
        if (level.isAgency) {
          const ownerIds = await getAgencyOwnerIds(level.id);
          const ownerMessage = await createMessage(log, {
            isForOwner: true,
            affectedUserName: personalInfo.legalName,
          });

          for (const ownerId of ownerIds) {
            if (ownerId !== actorUserId && !notifiedOwners.has(ownerId)) {
              notifiedOwners.add(ownerId);
              await prisma.notificacion.create({
                data: {
                  userId: ownerId,
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
  }

  return result;
});

export { pool, prisma, sessionStore };
