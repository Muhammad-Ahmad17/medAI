function requireEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function parsePort(name, fallback) {
  const raw = process.env[name] ?? String(fallback)
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) throw new Error(`Invalid numeric environment variable: ${name}`)
  return parsed
}

export const env = Object.freeze({
  PORT: parsePort('AUTH_PORT', 4000),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
  POSTGRES_HOST: requireEnv('POSTGRES_HOST'),
  POSTGRES_PORT: parsePort('POSTGRES_PORT', 5432),
  POSTGRES_DB: requireEnv('POSTGRES_DB'),
  POSTGRES_USER: requireEnv('POSTGRES_USER'),
  POSTGRES_PASSWORD: requireEnv('POSTGRES_PASSWORD'),
})
