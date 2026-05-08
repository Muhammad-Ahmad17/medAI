import { createJob, getJob } from '../services/jobService.js'
import { publishEvent } from '../infra/kafka.js'
import { uploadToOCI } from '../infra/oci.js'
import { env } from '../config/env.js'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/tiff', 'application/octet-stream']

export async function uploadRoutes(fastify) {
  fastify.post('/api/upload', async (req, reply) => {
    try {
      const data = await req.file()
      if (!data) {
        return reply.status(400).send({ error: 'No file provided' })
      }

      const { filename, mimetype, encoding } = data // mimetype=imagestype
      const buffer = await data.toBuffer()

      // Validate file
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(413).send({ 
          error: `File too large: ${buffer.length} > ${MAX_FILE_SIZE}` 
        })
      }

      if (!ALLOWED_TYPES.includes(mimetype)) {
        return reply.status(415).send({ 
          error: `Invalid file type: ${mimetype}. Allowed: ${ALLOWED_TYPES.join(', ')}` 
        })
      }

      console.log(`[UPLOAD] ${filename} (${buffer.length} bytes)`)

      // Upload to OCI
      const objectKey = await uploadToOCI(buffer, filename, mimetype)
      console.log(`[OCI] Stored at ${objectKey}`)

      // Create job
      const jobId = await createJob({
        filename,
        filesize: buffer.length,
        objectKey,
        mimetype,
        status: 'received'
      })
      console.log(`[JOB] Created ${jobId}`)

      // Publish event
      await publishEvent(
        env.KAFKA_TOPIC_IMAGE_UPLOADS, 
        {
          job_id: jobId,
          object_key: objectKey,
          filename,
          filesize: buffer.length,
          mimetype,
          timestamp: new Date().toISOString(),
        }
      )
      console.log(`[KAFKA] Published upload event for ${jobId}`)

      return reply.status(202).send({
        jobId,
        status: 'queued',
        message: 'Image received and queued for processing'
      })
    } catch (err) {
      console.error('[UPLOAD] Error:', err.message)
      return reply.status(500).send({ error: err.message })
    }
  })
}

