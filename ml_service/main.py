import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    force=True,
)

from infra.kafka_consumer import consume_forever
from services.ml_handler import handle_image_uploaded


def main() -> None:
    consume_forever(handle_image_uploaded)


if __name__ == "__main__":
    main()
