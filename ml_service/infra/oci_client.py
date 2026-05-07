import boto3
from botocore.config import Config

from config.settings import settings

s3 = boto3.client(
    "s3",
    endpoint_url=settings.OCI_ENDPOINT,
    aws_access_key_id=settings.OCI_ACCESS_KEY,
    aws_secret_access_key=settings.OCI_SECRET_KEY,
    region_name=settings.OCI_REGION,
    config=Config(signature_version="s3v4"),
)


def download_image(object_key: str) -> bytes:
    """Fetch the uploaded image bytes from OCI."""
    response = s3.get_object(Bucket=settings.OCI_BUCKET, Key=object_key)
    return response["Body"].read()
