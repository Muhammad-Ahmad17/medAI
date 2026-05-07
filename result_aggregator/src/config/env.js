function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function parseNumber(name, fallback) {
  const raw = process.env[name] ?? String(fallback)
  const value = Number.parseInt(raw, 10)
  if (Number.isNaN(value)) {
    throw new Error(`Invalid numeric environment variable: ${name}`)
  }
  return value
}

export const env = Object.freeze({
  KAFKA_BROKER: requireEnv('KAFKA_BROKER'),
  KAFKA_GROUP_AGGREGATOR: requireEnv('KAFKA_GROUP_AGGREGATOR'),
  KAFKA_TOPIC_ML_RESULT: requireEnv('KAFKA_TOPIC_ML_RESULT'),
  KAFKA_TOPIC_IMAGE_DONE: requireEnv('KAFKA_TOPIC_IMAGE_DONE'),
  REDIS_URL: requireEnv('REDIS_URL'),
  POSTGRES_HOST: requireEnv('POSTGRES_HOST'),
  POSTGRES_PORT: parseNumber('POSTGRES_PORT', 5432),
  POSTGRES_DB: requireEnv('POSTGRES_DB'),
  POSTGRES_USER: requireEnv('POSTGRES_USER'),
  POSTGRES_PASSWORD: requireEnv('POSTGRES_PASSWORD'),
})
