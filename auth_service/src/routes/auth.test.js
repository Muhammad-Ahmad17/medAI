/**
 * Auth route tests — no real database.
 * Builds a Fastify instance with an in-memory user store
 * and tests all three endpoints via Fastify's inject().
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import jwt from '@fastify/jwt'

// ─── In-memory user store ─────────────────────────────────────────────────────
const users = new Map()
let uidCounter = 1

async function buildApp() {
  const app = Fastify({ logger: false })

  await app.register(jwt, { secret: 'test-secret-1234' })

  app.decorate('jwtExpiresIn', '1h')
  app.decorate('authenticate', async function (req, reply) {
    try {
      await req.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  // Register routes inline with mocked service (no DB)
  app.post('/auth/register', async (req, reply) => {
    const { email, password, name } = req.body ?? {}
    if (!email || !password) return reply.status(400).send({ error: 'Email and password are required' })
    if (password.length < 6) return reply.status(400).send({ error: 'Password must be at least 6 characters' })
    if (users.has(email)) return reply.status(409).send({ error: 'Email already registered' })

    const user = { id: String(uidCounter++), email, name: name ?? null }
    users.set(email, { ...user, password })

    const token = app.jwt.sign({ userId: user.id, email }, { expiresIn: '1h' })
    return reply.status(201).send({ token, user })
  })

  app.post('/auth/login', async (req, reply) => {
    const { email, password } = req.body ?? {}
    if (!email || !password) return reply.status(400).send({ error: 'Email and password are required' })

    const stored = users.get(email)
    if (!stored || stored.password !== password) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const token = app.jwt.sign({ userId: stored.id, email }, { expiresIn: '1h' })
    return reply.send({ token, user: { id: stored.id, email, name: stored.name } })
  })

  app.get('/auth/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    return reply.send({ user: req.user })
  })

  await app.ready()
  return app
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  test('creates a new user and returns token', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'alice@test.com', password: 'secret1', name: 'Alice' },
    })
    assert.equal(res.statusCode, 201)
    const body = res.json()
    assert.ok(body.token, 'should have token')
    assert.equal(body.user.email, 'alice@test.com')
    assert.equal(body.user.name, 'Alice')
    await app.close()
  })

  test('rejects duplicate email with 409', async () => {
    const app = await buildApp()
    await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'dup@test.com', password: 'secret1' },
    })
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'dup@test.com', password: 'secret2' },
    })
    assert.equal(res.statusCode, 409)
    assert.match(res.json().error, /already registered/)
    await app.close()
  })

  test('rejects password shorter than 6 characters', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'short@test.com', password: 'abc' },
    })
    assert.equal(res.statusCode, 400)
    await app.close()
  })

  test('rejects missing email', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { password: 'secret1' },
    })
    assert.equal(res.statusCode, 400)
    await app.close()
  })
})

describe('POST /auth/login', () => {
  test('returns token for valid credentials', async () => {
    const app = await buildApp()
    await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'bob@test.com', password: 'mypassword' },
    })
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'bob@test.com', password: 'mypassword' },
    })
    assert.equal(res.statusCode, 200)
    assert.ok(res.json().token)
    await app.close()
  })

  test('rejects wrong password with 401', async () => {
    const app = await buildApp()
    await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'carol@test.com', password: 'rightpass' },
    })
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'carol@test.com', password: 'wrongpass' },
    })
    assert.equal(res.statusCode, 401)
    await app.close()
  })

  test('rejects unknown email with 401', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'nobody@test.com', password: 'pass123' },
    })
    assert.equal(res.statusCode, 401)
    await app.close()
  })

  test('rejects missing body fields with 400', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'x@test.com' },
    })
    assert.equal(res.statusCode, 400)
    await app.close()
  })
})

describe('GET /auth/me', () => {
  test('returns user when valid token provided', async () => {
    const app = await buildApp()
    const reg = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'dave@test.com', password: 'pass999', name: 'Dave' },
    })
    const { token } = reg.json()

    const res = await app.inject({
      method: 'GET', url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().user.email, 'dave@test.com')
    await app.close()
  })

  test('rejects request without token with 401', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/auth/me' })
    assert.equal(res.statusCode, 401)
    await app.close()
  })

  test('rejects request with tampered token with 401', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET', url: '/auth/me',
      headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.fake.sig' },
    })
    assert.equal(res.statusCode, 401)
    await app.close()
  })
})
