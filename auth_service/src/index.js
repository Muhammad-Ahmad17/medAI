import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import { env } from './config/env.js'
import { initializeDatabase, pool } from './infra/postgres.js'
import { authRoutes } from './routes/auth.js'

const app = Fastify({ logger: true })

await app.register(jwt, { secret: env.JWT_SECRET })

app.decorate('jwtExpiresIn', env.JWT_EXPIRES_IN)

app.decorate('authenticate', async function (req, reply) {
  try {
    await req.jwtVerify()
  } catch {
    reply.status(401).send({ error: 'Unauthorized' })
  }
})

app.register(authRoutes)

app.get('/health', async () => ({
  status: 'ok',
  service: 'auth-service',
  timestamp: new Date().toISOString(),
}))

async function start() {
  try {
    console.log('[STARTUP] Initializing Auth Service...')
    await initializeDatabase()
    await app.listen({ host: '0.0.0.0', port: env.PORT })
    console.log(`[STARTUP] Auth Service running on port ${env.PORT}`)
  } catch (err) {
    console.error('[STARTUP] Failed:', err.message)
    process.exit(1)
  }
}

async function shutdown() {
  console.log('[SHUTDOWN] Gracefully shutting down...')
  try {
    await app.close()
    await pool.end()
    process.exit(0)
  } catch (err) {
    console.error('[SHUTDOWN] Error:', err.message)
    process.exit(1)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

start()
