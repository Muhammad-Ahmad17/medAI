import { createUser, findByEmail, verifyPassword } from '../services/userService.js'

export async function authRoutes(fastify) {
  fastify.post('/auth/register', async (req, reply) => {
    const { email, password, name } = req.body ?? {}

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' })
    }
    if (typeof password !== 'string' || password.length < 6) {
      return reply.status(400).send({ error: 'Password must be at least 6 characters' })
    }

    try {
      const user = await createUser({ email, password, name })
      const token = fastify.jwt.sign(
        { userId: user.id, email: user.email },
        { expiresIn: fastify.jwtExpiresIn },
      )
      return reply.status(201).send({
        token,
        user: { id: user.id, email: user.email, name: user.name },
      })
    } catch (err) {
      if (err.statusCode === 409) return reply.status(409).send({ error: err.message })
      fastify.log.error(err)
      return reply.status(500).send({ error: 'Registration failed' })
    }
  })

  fastify.post('/auth/login', async (req, reply) => {
    const { email, password } = req.body ?? {}

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' })
    }

    const user = await findByEmail(email)
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const token = fastify.jwt.sign(
      { userId: user.id, email: user.email },
      { expiresIn: fastify.jwtExpiresIn },
    )
    return reply.send({
      token,
      user: { id: user.id, email: user.email, name: user.name },
    })
  })

  fastify.get('/auth/me', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    return reply.send({ user: req.user })
  })
}
