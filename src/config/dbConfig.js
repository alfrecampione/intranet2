import dotenv from "dotenv";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pkg from "pg";
import { PrismaClient } from "@prisma/client";

const {Pool} = pkg;

dotenv.config();



const PgStore = connectPgSimple(session);

// const isProduction = process.env.ENV === "production";

const connectionString = `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;

const pool = new Pool({
    connectionString: connectionString
});

const sessionStore = new PgStore({
  conString: connectionString,
  tableName: "session",
  createTableIfMissing: true,
});

// Initialize Prisma Client
const prisma = new PrismaClient();

export { pool, prisma, sessionStore };