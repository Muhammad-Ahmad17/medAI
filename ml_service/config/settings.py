import os
from dataclasses import dataclass


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


@dataclass(frozen=True)
class Settings:
    KAFKA_BROKER: str
    KAFKA_GROUP_ML: str
    KAFKA_TOPIC_IMAGE_UPLOADS: str
    KAFKA_TOPIC_ML_RESULT: str
    OCI_ENDPOINT: str
    OCI_BUCKET: str
    OCI_ACCESS_KEY: str
    OCI_SECRET_KEY: str
    OCI_REGION: str
    MODEL_PATH: str


settings = Settings(
    KAFKA_BROKER=_require_env("KAFKA_BROKER"),
    KAFKA_GROUP_ML=_require_env("KAFKA_GROUP_ML"),
    KAFKA_TOPIC_IMAGE_UPLOADS=_require_env("KAFKA_TOPIC_IMAGE_UPLOADS"),
    KAFKA_TOPIC_ML_RESULT=_require_env("KAFKA_TOPIC_ML_RESULT"),
    OCI_ENDPOINT=_require_env("OCI_ENDPOINT"),
    OCI_BUCKET=_require_env("OCI_BUCKET"),
    OCI_ACCESS_KEY=_require_env("OCI_ACCESS_KEY"),
    OCI_SECRET_KEY=_require_env("OCI_SECRET_KEY"),
    OCI_REGION=_require_env("OCI_REGION"),
    MODEL_PATH=_require_env("MODEL_PATH"),
)
