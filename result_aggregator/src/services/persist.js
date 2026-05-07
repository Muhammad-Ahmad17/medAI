import { pool } from '../infra/db.js'

function coalesceCreatedAt(job) {
  return job.createdAt ?? job.created_at ?? new Date().toISOString()
}

/**
 * Persists the completed job result to PostgreSQL (fire-and-forget from aggregator).
 *
 * @param {string} job_id
 * @param {object} job - Parsed Redis job document from the API gateway
 */
export async function persistResult(job_id, job) {
  const query = `
    INSERT INTO job_results
      (job_id, filename, prediction, confidence, image_urls, created_at, completed_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
    ON CONFLICT (job_id) DO NOTHING
  `

  const prediction =
    job.prediction === undefined || job.prediction === null
      ? null
      : String(job.prediction)

  const confidence =
    job.confidence === undefined || job.confidence === null
      ? null
      : Number(job.confidence)

  const imageUrls = Array.isArray(job.imageUrls) ? job.imageUrls : []

  const values = [
    job_id,
    job.filename ?? null,
    prediction,
    confidence,
    JSON.stringify(imageUrls),
    coalesceCreatedAt(job),
  ]

  await pool.query(query, values)
}
