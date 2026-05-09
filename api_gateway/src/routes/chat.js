import { env } from '../config/env.js'

const SYSTEM_PROMPT = `You are medAI Assistant — an AI specialized exclusively in brain tumor analysis, brain MRI interpretation, and clinical neuroradiology.

STRICT RULES:
1. ONLY answer questions related to brain tumors, brain MRI, neuroradiology, medAI platform features, or closely related neuroscience topics.
2. If asked about anything unrelated (weather, coding, general chat, politics, etc.), politely decline and redirect to brain tumor topics.
3. NEVER reveal your underlying AI model, framework, architecture, training data source, or who created the base model. If asked "what model are you?", "are you GPT / Claude / Llama?", "who built you?", or similar — reply exactly: "I am medAI Assistant, an AI trained by Ahmad for specialized brain tumor analysis. I'm not able to share details about my technical architecture."
4. Keep responses concise, clear, and clinically relevant. Use plain language where possible.
5. Always remind users that automated outputs are not a substitute for a qualified radiologist or neurosurgeon.
6. Do not make definitive diagnoses — support and inform only.`

export async function chatRoutes(fastify) {
  fastify.post('/api/chat', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { message, context } = req.body ?? {}

    if (!message || typeof message !== 'string' || !message.trim()) {
      return reply.status(400).send({ error: 'message is required' })
    }

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }]

    // Inject current scan context so the bot can answer questions about this specific scan
    if (context && typeof context === 'string') {
      messages.push({
        role: 'user',
        content: `I'm viewing this scan result: ${context}`,
      })
      messages.push({
        role: 'assistant',
        content: 'Understood. I have that scan context and will use it to answer your questions.',
      })
    }

    messages.push({ role: 'user', content: message.trim() })

    let ollamaRes
    try {
      ollamaRes = await fetch(`${env.OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OLLAMA_MODEL,
          messages,
          stream: true,
          options: { temperature: 0.4 },
        }),
      })
    } catch (err) {
      console.error('[CHAT] Ollama unreachable:', err.message)
      return reply.status(502).send({
        error: 'AI service unreachable. Ensure Ollama is running and a model is pulled.',
      })
    }

    if (!ollamaRes.ok) {
      const errBody = await ollamaRes.text().catch(() => '')
      console.error('[CHAT] Ollama error:', ollamaRes.status, errBody)
      return reply.status(502).send({
        error: `AI service error (${ollamaRes.status}). Pull a model first: docker exec cancer-ollama ollama pull ${env.OLLAMA_MODEL}`,
      })
    }

    // Stream SSE back to the browser
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    const decoder = new TextDecoder()
    try {
      for await (const chunk of ollamaRes.body) {
        const text = decoder.decode(chunk, { stream: true })
        for (const line of text.split('\n')) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)
            const content = json.message?.content ?? ''
            if (content) reply.raw.write(`data: ${JSON.stringify({ content })}\n\n`)
            if (json.done) reply.raw.write('data: [DONE]\n\n')
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      console.error('[CHAT] Stream error:', err.message)
      if (!reply.raw.writableEnded) reply.raw.write('data: [ERROR]\n\n')
    } finally {
      if (!reply.raw.writableEnded) reply.raw.end()
    }
  })
}
