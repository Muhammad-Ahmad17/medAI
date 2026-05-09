import { getJob, listJobsByUser } from '../services/jobService.js'
import { presignJobResult } from '../services/presignResult.js'

export async function statusRoutes(fastify) {

  // Returns all jobs for the authenticated user, with presigned imageUrls in completed results
  fastify.get('/api/jobs', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    try {
      const jobs = await listJobsByUser(req.user.userId)

      const signed = await Promise.all(
        jobs.map(async (job) => {
          if (!job.result) return job
          const result = await presignJobResult(job.result)
          return { ...job, result }
        }),
      )

      return reply.send({ jobs: signed })
    } catch (err) {
      console.error('[JOBS] Error:', err.message)
      return reply.status(500).send({ error: err.message })
    }
  })

  fastify.get('/api/status/:jobId', async (req, reply) => {
    try {
      const { jobId } = req.params
      const job = await getJob(jobId)

      if (!job) {
        return reply.status(404).send({
          error: 'Job not found',
          jobId
        })
      }

      console.log(`[STATUS] Job ${jobId}: ${job.status}`)

      const result =
        job.result != null ? await presignJobResult(job.result) : null

      return reply.send({
        jobId,
        status: job.status,
        filename: job.filename,
        filesize: job.filesize,
        result,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      })
    } catch (err) {
      console.error('[STATUS] Error:', err.message)
      return reply.status(500).send({ error: err.message })
    }
  })

  fastify.get('/api/results/:jobId', async (req, reply) => {
    try {
      const { jobId } = req.params
      const job = await getJob(jobId)

      if (!job) {
        return reply.status(404).send({
          error: 'Job not found',
          jobId
        })
      }

      if (job.status !== 'completed') {
        return reply.status(202).send({
          jobId,
          status: job.status,
          message: 'Results not yet available'
        })
      }

      const signed = await presignJobResult(job.result)
      return reply.send(signed)
    } catch (err) {
      console.error('[RESULTS] Error:', err.message)
      return reply.status(500).send({ error: err.message })
    }
  })
}

