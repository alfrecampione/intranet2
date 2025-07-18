import dotenv from "dotenv";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pkg from "pg";
import { PrismaClient } from "@prisma/client";

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
  // Evitar recursion infinita al loggear el modelo Logs
  if (params.model === 'Logs') return next(params);

  const result = await next(params);

  const writeActions = ['create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany'];

  if (writeActions.includes(params.action)) {
    let userId = null;
    if (params.args) {
      if (params.args.userId) userId = params.args.userId;
      else if (params.args.data?.userId) userId = params.args.data.userId;
      else if (params.args.create?.userId) userId = params.args.create.userId;
      else if (params.args.where?.userId) userId = params.args.where.userId;
    }

    const log = {
      userId: userId || "unknown",
      action: params.action,
      description: `[${params.model}] ${params.action}`,
    };

    // Guardar log solo si hay userId válido
    if (userId) {
      try {
        await prisma.logs.create({ data: log });
      } catch (err) {
        console.warn("Failed to save log:", err.message);
      }
    }
  }

  return result;
});


export { pool, prisma, sessionStore };
