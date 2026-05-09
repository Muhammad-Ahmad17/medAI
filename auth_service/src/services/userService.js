import bcrypt from 'bcrypt'
import { pool } from '../infra/postgres.js'

const SALT_ROUNDS = 10

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function createUser({ email, password, name }) {
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email])
  if (existing.rows.length > 0) {
    const err = new Error('Email already registered')
    err.statusCode = 409
    throw err
  }

  const hash = await hashPassword(password)
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, email, name, created_at`,
    [email, hash, name ?? null],
  )
  return result.rows[0]
}

export async function findByEmail(email) {
  const result = await pool.query(
    `SELECT id, email, password_hash, name, created_at FROM users WHERE email = $1`,
    [email],
  )
  return result.rows[0] ?? null
}

export async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash)
}
