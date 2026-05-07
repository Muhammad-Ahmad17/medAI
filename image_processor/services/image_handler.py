from config.settings import settings
from infra.kafka_producer import publish_event
from infra.oci_client import download_image
from services.parallel_upload import upload_variants_in_parallel
from services.processor import VARIANTS


async def handle_image_uploaded(event: dict) -> None:
    job_id = event["job_id"]
    object_key = event["object_key"]
    filename = event["filename"]

    image_bytes = download_image(object_key)
    variant_images = {
        variant_name: transform(image_bytes)
        for variant_name, transform in VARIANTS.items()
    }
    image_urls = upload_variants_in_parallel(job_id, filename, variant_images)

    await publish_event(
        settings.KAFKA_TOPIC_IMAGE_DONE,
        {
            "job_id": job_id,
            "image_urls": image_urls,
        },
    )
