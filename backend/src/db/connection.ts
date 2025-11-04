import { Pool } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
logger.info(`Connecting to database: ${dbUrl ? 'URL is set' : 'URL is NOT set!'}`);

if (!dbUrl) {
  logger.error('DATABASE_URL environment variable is not set!');
}

export const pool = new Pool({
  connectionString: dbUrl,
});

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database error', error);
    throw error;
  }
}

export async function getClient() {
  return pool.connect();
}
