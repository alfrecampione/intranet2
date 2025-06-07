import dotenv from "dotenv";
import pkg from "pg";
import session from "express-session";
import connectPgSimple  from 'connect-pg-simple';

const {Pool} = pkg;

dotenv.config();
const PgStore = connectPgSimple(session);

const isProduction = process.env.NODE_ENV === 'production';

const connectionString = `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;

const pool = new Pool({
    connectionString: isProduction ? process.env.DATABASE_URL : connectionString
});

const sessionStore = new PgStore({
    conString: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`,
    tableName: 'session',
    createTableIfMissing: true,
  });

export {pool, sessionStore};
