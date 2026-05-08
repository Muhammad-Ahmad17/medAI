import { randomUUID } from 'crypto'
import { redis } from '../infra/redis.js'
import { db } from '../infra/postgres.js'

const JOB_TTL = 86400 * 7 // time-to-live 7 days

export async function createJob(jobData) {
  const jobId = randomUUID()
  const now = new Date().toISOString()

  const jobRecord = {
    jobId,
    ...jobData,
    status: 'received',
    createdAt: now,
    updatedAt: now
  }

  // Store in Redis for fast access
  await redis.setex(  // SET with EXpiration
    `job:${jobId}`,
    JOB_TTL,
    JSON.stringify(jobRecord)
  )

  // Store in PostgreSQL for persistence
  try {
    await db.query(
      `INSERT INTO jobs (job_id, filename, filesize, object_key, mimetype, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [jobId, jobData.filename, jobData.filesize, jobData.objectKey, jobData.mimetype, 'received', now, now]
    )
  } catch (err) {
    console.error('[DB] Failed to store job:', err.message)
  }

  console.log(`[JOB] Created ${jobId}`)
  return jobId
}

export async function getJob(jobId) {
  // Try Redis first
  const cached = await redis.get(`job:${jobId}`)
  if (cached) {
    return JSON.parse(cached)
  }

  // Fallback to PostgreSQL
  try {
    const result = await db.query(
      `SELECT * FROM jobs WHERE job_id = $1`,
      [jobId]
    )
    if (result.rows.length === 0) return null

    const row = result.rows[0]
    return {
      jobId: row.job_id,
      filename: row.filename,
      filesize: row.filesize,
      objectKey: row.object_key,
      mimetype: row.mimetype,
      status: row.status,
      result: row.result ? JSON.parse(row.result) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  } catch (err) {
    console.error(' [DB] Failed to fetch job:', err.message)
    return null
  }
}

export async function updateJobStatus(jobId, status, updates = {}) {
  const now = new Date().toISOString()
  const jobRecord = await getJob(jobId) || {}

  const updated = {
    ...jobRecord,
    status,
    ...updates,
    updatedAt: now
  }

  // Update Redis
  await redis.setex(
    `job:${jobId}`,
    JOB_TTL,
    JSON.stringify(updated)
  )

  // Update PostgreSQL
  try {
    const resultJson = updates.result ? JSON.stringify(updates.result) : null
    await db.query(
      `UPDATE jobs SET status = $1, result = $2, updated_at = $3 WHERE job_id = $4`,
      [status, resultJson, now, jobId]
    )
  } catch (err) {
    console.error('[DB] Failed to update job:', err.message)
  }

  return updated
}

