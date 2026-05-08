import { pool, initializeDatabase } from './infra/db.js'
import { runConsumers, disconnectConsumer } from './infra/kafka.js'
import { redis } from './infra/redis.js'
import { handleMLResult, handleImageDone } from './services/aggregator.js'

async function start() {
  await initializeDatabase()
  await runConsumers({
    onMLResult: handleMLResult,
    onImageDone: handleImageDone,
  })
}

async function shutdown() {
  await disconnectConsumer()
  await redis.quit()
  await pool.end()
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    try {
      await shutdown()
      process.exit(0)
    } catch (err) {
      console.error('shutdown failed', err)
      process.exit(1)
    }
  })
}

start().catch((err) => {
  console.error('startup failed', err)
  process.exit(1)
})
