import { redis } from '../infra/redis.js'
import { persistResult } from './persist.js'

const JOB_TTL_SEC = 86400 * 7

async function mergeJob(jobId, updater) {
  const key = `job:${jobId}`

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await redis.watch(key)
    const raw = await redis.get(key)
    if (!raw) {
      await redis.unwatch()
      console.warn(`[aggregator] missing Redis job ${jobId}`)
      return null
    }

    const job = JSON.parse(raw)
    updater(job)
    job.updatedAt = new Date().toISOString()

    let finalized = false
    if (job.mlDone && job.imageDone && job.status !== 'completed') {
      job.status = 'completed'
      job.result = {
        prediction: job.prediction ?? null,
        confidence: job.confidence ?? null,
        imageUrls: job.imageUrls ?? [],
      }
      finalized = true
    }

    const multi = redis.multi()
    multi.set(key, JSON.stringify(job), 'EX', JOB_TTL_SEC)
    const execResult = await multi.exec()

    if (execResult === null) {
      continue
    }

    if (finalized) {
      persistResult(jobId, job).catch((err) =>
        console.error('[aggregator] persist failed', jobId, err),
      )
    }
    return job
  }

  console.error(`[aggregator] merge retries exhausted for ${jobId}`)
  return null
}

/**
 * Called when the Kafka consumer receives an "ml_result_ready" event.
 */
export async function handleMLResult(event) {
  const jobId = event.job_id
  if (!jobId) return

  await mergeJob(jobId, (job) => {
    job.prediction = event.prediction
    job.confidence = event.confidence
    job.mlDone = true
  })
}

/**
 * Called when the Kafka consumer receives an "image_processing_done" event.
 */
export async function handleImageDone(event) {
  const jobId = event.job_id
  if (!jobId) return

  await mergeJob(jobId, (job) => {
    job.imageUrls = event.image_urls ?? []
    job.imageDone = true
  })
}
