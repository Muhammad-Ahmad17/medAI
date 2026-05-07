import { Kafka } from 'kafkajs'
import { env } from '../config/env.js'

const kafka = new Kafka({
  clientId: 'result-aggregator',
  brokers: env.KAFKA_BROKER.split(',').map((broker) => broker.trim()),
})

export const consumer = kafka.consumer({ groupId: env.KAFKA_GROUP_AGGREGATOR })

let isConnected = false

export async function runConsumers(handlers) {
  if (!isConnected) {
    await consumer.connect()
    isConnected = true
  }

  await consumer.subscribe({ topic: env.KAFKA_TOPIC_ML_RESULT, fromBeginning: true })
  await consumer.subscribe({ topic: env.KAFKA_TOPIC_IMAGE_DONE, fromBeginning: true })

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return

      const event = JSON.parse(message.value.toString())
      if (topic === env.KAFKA_TOPIC_ML_RESULT) {
        await handlers.onMLResult(event)
        return
      }
      if (topic === env.KAFKA_TOPIC_IMAGE_DONE) {
        await handlers.onImageDone(event)
      }
    },
  })
}

export async function disconnectConsumer() {
  if (!isConnected) return
  await consumer.disconnect()
  isConnected = false
}
