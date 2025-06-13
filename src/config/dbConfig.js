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

export { pool, prisma, sessionStore };