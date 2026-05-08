import pg from 'pg'
import { env } from '../config/env.js'

const { Pool } = pg

export const pool = new Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  database: env.POSTGRES_DB,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
})

export async function initializeDatabase() {
  try {
    const conn = await pool.connect()
    conn.release()
    console.log('[DB] Connected to PostgreSQL')

    await createTables()
  } catch (err) {
    console.error('[DB] Connection failed:', err.message)
    throw err
  }
}

async function createTables() {
  const queries = [
    // Job results table — stores completed scan records (written by aggregator)
    `CREATE TABLE IF NOT EXISTS job_results (
      id SERIAL PRIMARY KEY,
      job_id UUID NOT NULL UNIQUE,
      filename TEXT,
      prediction TEXT,
      confidence NUMERIC(5, 4),
      image_urls JSONB,
      created_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Index for job_id lookups
    `CREATE INDEX IF NOT EXISTS idx_job_results_job_id ON job_results(job_id)`,
  ]

  for (const query of queries) {
    try {
      await pool.query(query)
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.error('[DB] Schema creation failed:', err.message)
      }
    }
  }

  console.log('[DB] Tables initialized')
}
