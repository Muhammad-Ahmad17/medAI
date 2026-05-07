import { Kafka } from 'kafkajs'
import { env } from '../config/env.js'

const kafka = new Kafka({
  clientId: 'api-gateway',
  brokers: env.KAFKA_BROKER.split(',').map((broker) => broker.trim()),
})

export const producer = kafka.producer()

let isConnected = false

export async function connectProducer() {
  if (isConnected) return
  await producer.connect()
  isConnected = true
}

export async function disconnectProducer() {
  if (!isConnected) return
  await producer.disconnect()
  isConnected = false
}

export async function publishEvent(topic, payload) {
  if (!isConnected) {
    await connectProducer()
  }

  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(payload) }],
  })
}
