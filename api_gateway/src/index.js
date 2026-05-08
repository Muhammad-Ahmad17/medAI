import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { env } from './config/env.js'
import { uploadRoutes } from './routes/upload.js'
import { statusRoutes } from './routes/status.js'
import { connectProducer, disconnectProducer } from './infra/kafka.js'
import { initRedis, redis } from './infra/redis.js'
import { initializeDatabase, db } from './infra/postgres.js'

const app = Fastify({ logger: true })

app.register(multipart)
app.register(uploadRoutes)
app.register(statusRoutes)

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  service: 'api-gateway'
}))

async function start() {
  try {
    console.log('[STARTUP] Initializing API Gateway...')
    await initRedis()
    await initializeDatabase()
    await connectProducer()
    await app.listen({ host: '0.0.0.0', port: env.PORT })
    console.log(`[STARTUP] API Gateway running on port ${env.PORT}`)
  } catch (err) {
    console.error('[STARTUP] Failed:', err.message)
    process.exit(1)
  }
}

async function shutdown() {
  console.log('[SHUTDOWN] Gracefully shutting down...')
  try {
    await disconnectProducer()
    await redis.quit()
    if (db) await db.end()
    await app.close()
    console.log('[SHUTDOWN] Complete')
    process.exit(0)
  } catch (err) {
    console.error('[SHUTDOWN] Error:', err.message)
    process.exit(1)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

start()

