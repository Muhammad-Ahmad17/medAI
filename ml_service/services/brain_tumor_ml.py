"""Brain tumor classifier ported from monolithic/apis/fastapi_app.py."""

from __future__ import annotations

import logging
import os
from io import BytesIO

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

CLASS_LABELS = {
    0: "No Tumor",
    1: "Tumor Present",
}

model = None


def try_load_model(model_path: str) -> None:
    """Load Keras model from disk; failures leave ``model`` as None."""
    global model
    model = None
    if not model_path or not os.path.isfile(model_path):
        logger.warning("MODEL_PATH missing or not a file: %s", model_path)
        return
    try:
        import tensorflow as tf

        model = tf.keras.models.load_model(model_path, compile=False, safe_mode=False)
        logger.info("Loaded Keras model from %s", model_path)
    except Exception as e:
        logger.error("Failed to load model: %s", e)
        model = None


def preprocess_image(
    image_data: bytes, target_size: tuple[int, int] = (128, 128)
) -> np.ndarray:
    img = Image.open(BytesIO(image_data)).convert("RGB")
    img = img.resize(target_size)
    img_array = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(img_array, axis=0)


def run_inference(preprocessed_batch: np.ndarray) -> tuple[str, float]:
    if model is None:
        return ("model_not_loaded", 0.0)

    prediction = model.predict(preprocessed_batch, verbose=0)
    confidence = float(prediction[0][0])
    predicted_class = 1 if confidence > 0.5 else 0
    label = CLASS_LABELS[predicted_class]
    return label, confidence
