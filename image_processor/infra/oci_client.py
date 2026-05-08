import os

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
    """Fetch the original uploaded image bytes from OCI."""
    response = s3.get_object(Bucket=settings.OCI_BUCKET, Key=object_key)
    return response["Body"].read()


def upload_variant(job_id: str, variant_name: str, image_bytes: bytes, filename: str) -> str:
    """Upload one processed variant and return a URL-style reference."""
    base = os.path.basename(filename) or "image.jpg"
    object_key = f"processed/{job_id}/{variant_name}-{base}"

    s3.put_object(
        Bucket=settings.OCI_BUCKET,
        Key=object_key,
        Body=image_bytes,
        ContentType="image/jpeg",
    )

    endpoint = settings.OCI_ENDPOINT.rstrip("/") # remove slash from the end 
    return f"{endpoint}/{settings.OCI_BUCKET}/{object_key}"
