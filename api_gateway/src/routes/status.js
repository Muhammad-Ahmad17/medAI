import { getJob } from '../services/jobService.js'
import { presignJobResult } from '../services/presignResult.js'

export async function statusRoutes(fastify) {
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

      console.log(`📊 [STATUS] Job ${jobId}: ${job.status}`)

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
      console.error('❌ [STATUS] Error:', err.message)
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
      console.error('❌ [RESULTS] Error:', err.message)
      return reply.status(500).send({ error: err.message })
    }
  })
}

