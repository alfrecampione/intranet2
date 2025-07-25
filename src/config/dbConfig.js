import dotenv from "dotenv";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pkg from "pg";
import { PrismaClient } from "@prisma/client";
import { prismaContext } from "./prismaContext.js";

const { Pool } = pkg;

dotenv.config();

const PgStore = connectPgSimple(session);

const connectionString = `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;

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
  if (params.model === 'Logs') return next(params);

  const writeActions = [
    'create',
    'update',
    'delete',
    'upsert',
    'createMany',
    'updateMany',
    'deleteMany'
  ];

  if (!writeActions.includes(params.action)) return next(params);

  const store = prismaContext.getStore();
  const actorUserId = store?.userId || "unknown";

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

  // Handle pre-fetching OLD VALUE for update/delete actions
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

  // Execute the actual action
  const result = await next(params);

  // If updateMany or deleteMany affected 0 rows, skip logging
  if ((params.action === 'updateMany' || params.action === 'deleteMany') && result.count === 0) {
    return result;
  }

  // Fetch NEW VALUE for create/update actions
  try {
    if (params.action === 'create') {
      newValue = result || params.args?.data || null;
    }

    if (params.action === 'createMany') {
      newValue = params.args.data || [];
    }

    if (params.action === 'update') {
      if (params.args.where) {
        newValue = await prisma[params.model].findUnique({
          where: params.args.where,
        });
      }
    }

    if (params.action === 'updateMany') {
      const updatedIds = oldValue?.map(item => item.id) || [];
      if (updatedIds.length > 0) {
        newValue = await prisma[params.model].findMany({
          where: { id: { in: updatedIds } },
        });
      }
    }

    if (params.action === 'upsert') {
      if (params.args.where) {
        newValue = await prisma[params.model].findUnique({
          where: params.args.where,
        });
      }
    }
    // For delete & deleteMany, newValue remains null
  } catch (err) {
    console.warn("Failed to fetch newValue:", err.message);
  }

  // Compare oldValue and newValue to avoid duplicate logs
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

  return result;
});

export { pool, prisma, sessionStore };
