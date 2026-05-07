import json
from collections.abc import Mapping

from confluent_kafka import Producer

from config.settings import settings


producer = Producer(
    {
        "bootstrap.servers": settings.KAFKA_BROKER,
        "client.id": "ml-service",
    }
)


async def publish_event(topic: str, payload: Mapping) -> None:
    producer.produce(topic, value=json.dumps(payload).encode("utf-8"))
    producer.poll(0)
    producer.flush(5)
