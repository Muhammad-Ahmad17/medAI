import pg from 'pg'
import bcrypt from 'bcrypt'
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
  const conn = await pool.connect()
  conn.release()
  console.log('[DB] Connected to PostgreSQL')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
  `)

  console.log('[DB] Tables initialized')
  await seedDemoUser()
}

async function seedDemoUser() {
  const res = await pool.query(`SELECT id FROM users WHERE email = $1`, ['demo@example.com'])
  if (res.rows.length > 0) return

  const hash = await bcrypt.hash('demo123', 10)
  await pool.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)`,
    ['demo@example.com', hash, 'Demo User'],
  )
  console.log('[DB] Demo user seeded  →  demo@example.com / demo123')
}
