import pg from 'pg'
import { env } from '../config/env.js'

let db = null

export async function initializeDatabase() {
  try {
    db = new pg.Pool({
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB
    })

    const conn = await db.connect()
    conn.release()
    console.log('[DB] Connected to PostgreSQL')

    // Create tables if they don't exist
    await createTables()
  } catch (err) {
    console.error('[DB] Connection failed:', err.message)
    throw err
  }
}

async function createTables() {
  const queries = [
    // Jobs table
    `CREATE TABLE IF NOT EXISTS jobs (
      job_id UUID PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      filesize INTEGER NOT NULL,
      object_key VARCHAR(500) NOT NULL,
      mimetype VARCHAR(100),
      status VARCHAR(50) DEFAULT 'received',
      result JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Predictions table
    `CREATE TABLE IF NOT EXISTS predictions (
      id UUID PRIMARY KEY,
      job_id UUID REFERENCES jobs(job_id) ON DELETE CASCADE,
      stage VARCHAR(50),
      prediction JSONB,
      confidence FLOAT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Results table (aggregated)
    `CREATE TABLE IF NOT EXISTS results (
      id UUID PRIMARY KEY,
      job_id UUID REFERENCES jobs(job_id) ON DELETE CASCADE,
      prediction JSONB,
      confidence FLOAT,
      aggregated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Indexes for performance
    `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
    `CREATE INDEX IF NOT EXISTS idx_predictions_job_id ON predictions(job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_results_job_id ON results(job_id)`
  ]

  for (const query of queries) {
    try {
      await db.query(query)
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.error('[DB] Schema creation failed:', err.message)
      }
    }
  }

  console.log('[DB] Tables initialized')
}

export { db }
