from config.settings import settings
from infra.kafka_producer import publish_event
from infra.oci_client import download_image
from services.brain_tumor_ml import preprocess_image, run_inference, try_load_model

try_load_model(settings.MODEL_PATH)


async def handle_image_uploaded(event: dict):
    """
    Called by the Kafka consumer for each ImageUploaded event.
    Orchestrates download -> preprocess -> inference -> publish.
    """
    job_id = event["job_id"]
    object_key = event["object_key"]

    image_bytes = download_image(object_key)
    preprocessed = preprocess_image(image_bytes)
    prediction, confidence = run_inference(preprocessed)

    await publish_event(
        settings.KAFKA_TOPIC_ML_RESULT,
        {
            "job_id": job_id,
            "prediction": prediction,
            "confidence": confidence,
        },
    )
