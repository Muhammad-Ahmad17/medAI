function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function parsePort(name, fallback) {
  const raw = process.env[name] ?? String(fallback)
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${name}`)
  }
  return parsed
}

function parseBoundedInt(name, min, max, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export const env = Object.freeze({
  PORT: parsePort('PORT', 3000),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  KAFKA_BROKER: requireEnv('KAFKA_BROKER'),
  KAFKA_TOPIC_IMAGE_UPLOADS: requireEnv('KAFKA_TOPIC_IMAGE_UPLOADS'),
  REDIS_URL: requireEnv('REDIS_URL'),
  POSTGRES_HOST: requireEnv('POSTGRES_HOST'),
  POSTGRES_PORT: parsePort('POSTGRES_PORT', 5432),
  POSTGRES_DB: requireEnv('POSTGRES_DB'),
  POSTGRES_USER: requireEnv('POSTGRES_USER'),
  POSTGRES_PASSWORD: requireEnv('POSTGRES_PASSWORD'),
  OCI_ENDPOINT: requireEnv('OCI_ENDPOINT'),
  OCI_BUCKET: requireEnv('OCI_BUCKET'),
  OCI_ACCESS_KEY: requireEnv('OCI_ACCESS_KEY'),
  OCI_SECRET_KEY: requireEnv('OCI_SECRET_KEY'),
  OCI_REGION: requireEnv('OCI_REGION'),
  OLLAMA_URL: process.env.OLLAMA_URL ?? 'http://ollama:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? 'llama3.2:3b',
  /** Presigned GET TTL for result imageUrls (seconds). AWS SigV4 allows up to 7 days for IAM users. */
  OCI_PRESIGN_EXPIRES_SECONDS: parseBoundedInt(
    'OCI_PRESIGN_EXPIRES_SECONDS',
    60,
    604800,
    3600,
  ),
})
