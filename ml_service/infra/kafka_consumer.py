import asyncio
import json
from collections.abc import Awaitable, Callable

from confluent_kafka import Consumer, KafkaError

from config.settings import settings


def _create_consumer() -> Consumer:
    consumer = Consumer(
        {
            "bootstrap.servers": settings.KAFKA_BROKER,
            "group.id": settings.KAFKA_GROUP_ML,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": True,
        }
    )
    consumer.subscribe([settings.KAFKA_TOPIC_IMAGE_UPLOADS])
    return consumer


def consume_forever(message_handler: Callable[[dict], Awaitable[None]]) -> None:
    consumer = _create_consumer()
    try:
        while True:
            msg = consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                raise RuntimeError(f"Kafka consumer error: {msg.error()}")

            payload = json.loads(msg.value().decode("utf-8"))
            asyncio.run(message_handler(payload))
    finally:
        consumer.close()
