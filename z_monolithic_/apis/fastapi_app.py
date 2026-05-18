import os
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import tensorflow as tf
from PIL import Image
from io import BytesIO
import uvicorn
import cv2
import base64

# Initialize FastAPI app
app = FastAPI(title="Brain Tumor Classifier", version="1.0.0")

# Model path
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'brain_tumor_classifier.keras')

# Load model
try:
    model = tf.keras.models.load_model(MODEL_PATH)
    print(f"Model loaded successfully from {MODEL_PATH}")
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

# Class labels
CLASS_LABELS = {
    0: "No Tumor",
    1: "Tumor Present"
}

def preprocess_image(image_data: bytes, target_size: tuple = (128, 128)) -> np.ndarray:
    """
    Preprocess image for model prediction
    
    Args:
        image_data: Raw image bytes
        target_size: Target image size (height, width) - must match model input
    
    Returns:
        Preprocessed image as numpy array
    """
    try:
        # Open image
        img = Image.open(BytesIO(image_data)).convert('RGB')
        
        # Resize
        img = img.resize(target_size)
        
        # Convert to array
        img_array = np.array(img, dtype=np.float32)
        
        # Normalize (model was trained with values normalized to 0-1 range)
        img_array = img_array / 255.0
        
        # Add batch dimension
        img_array = np.expand_dims(img_array, axis=0)
        
        return img_array
    except Exception as e:
        raise ValueError(f"Error preprocessing image: {str(e)}")


# ==================== IMAGE PROCESSING FUNCTIONS ====================

def image_to_base64(image: np.ndarray) -> str:
    """Convert numpy array image to base64 string"""
    _, buffer = cv2.imencode('.jpg', image)
    return base64.b64encode(buffer).decode('utf-8')


def get_heatmap_image(image_array: np.ndarray):
    """Returns original, grayscale, and heatmap images."""
    img = cv2.cvtColor((image_array * 255).astype(np.uint8), cv2.COLOR_RGB2BGR) if image_array.max() <= 1 else image_array
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    heatmap = cv2.applyColorMap(gray, cv2.COLORMAP_JET)
    heatmap_rgb = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
    return img_rgb, gray, heatmap_rgb


def get_canny_edges(image_array: np.ndarray, threshold1=100, threshold2=200):
    """Apply Canny edge detection."""
    img = cv2.cvtColor((image_array * 255).astype(np.uint8), cv2.COLOR_RGB2BGR) if image_array.max() <= 1 else image_array
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, threshold1, threshold2)
    edges_rgb = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
    return edges_rgb


def get_clahe_enhanced(image_array: np.ndarray, clipLimit=2.0, tileGridSize=(8, 8)):
    """Apply CLAHE enhancement."""
    img = cv2.cvtColor((image_array * 255).astype(np.uint8), cv2.COLOR_RGB2BGR) if image_array.max() <= 1 else image_array
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=clipLimit, tileGridSize=tileGridSize)
    enhanced = clahe.apply(gray)
    enhanced_rgb = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2RGB)
    return enhanced_rgb


def get_morphological_result(image_array: np.ndarray, operation='open'):
    """Apply morphological operations."""
    img = cv2.cvtColor((image_array * 255).astype(np.uint8), cv2.COLOR_RGB2BGR) if image_array.max() <= 1 else image_array
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    
    if operation == 'open':
        result = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    elif operation == 'close':
        result = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    elif operation == 'dilate':
        result = cv2.dilate(thresh, kernel, iterations=1)
    elif operation == 'erode':
        result = cv2.erode(thresh, kernel, iterations=1)
    else:
        result = thresh
    
    result_rgb = cv2.cvtColor(result, cv2.COLOR_GRAY2RGB)
    return result_rgb


def get_contours(image_array: np.ndarray, min_area=100, exclude_largest=True):
    """Detect and analyze contours."""
    img = cv2.cvtColor((image_array * 255).astype(np.uint8), cv2.COLOR_RGB2BGR) if image_array.max() <= 1 else image_array
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 210, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    # Sort contours by area
    contours_sorted = sorted(contours, key=cv2.contourArea, reverse=True)
    
    # Filter contours
    if exclude_largest and len(contours_sorted) > 0:
        filtered_contours = [c for c in contours_sorted[1:] if cv2.contourArea(c) > min_area]
        contour_count = len(filtered_contours)
    else:
        filtered_contours = [c for c in contours_sorted if cv2.contourArea(c) > min_area]
        contour_count = len(filtered_contours)
    
    # Draw contours
    img_with_contours = img_rgb.copy()
    cv2.drawContours(img_with_contours, filtered_contours, -1, (0, 255, 0), 2)
    
    return img_rgb, img_with_contours, contour_count


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Brain Tumor Classifier API",
        "version": "1.0.0",
        "endpoints": {
            "predict": "/predict (POST) - Classify if tumor present",
            "process_images": "/process-images (POST) - Get all processed images",
            "health": "/health (GET) - Health check"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    if model is None:
        return JSONResponse(
            status_code=503,
            content={"status": "Model not loaded", "healthy": False}
        )
    return {"status": "healthy", "model_loaded": True}


@app.post("/process-images")
async def process_images(file: UploadFile = File(...)):
    """
    Process image and return all processed versions as base64 strings
    
    Args:
        file: Image file (JPEG, PNG, etc.)
    
    Returns:
        JSON with all processed images as base64 strings
    """
    try:
        # Read uploaded file
        contents = await file.read()
        
        # Load image with PIL to get RGB
        img_pil = Image.open(BytesIO(contents)).convert('RGB')
        img_array = np.array(img_pil, dtype=np.float32) / 255.0  # Normalize
        
        # Process images
        original, gray, heatmap = get_heatmap_image(img_array)
        edges = get_canny_edges(img_array, 100, 200)
        enhanced = get_clahe_enhanced(img_array, clipLimit=2.0, tileGridSize=(8, 8))
        morphed = get_morphological_result(img_array, operation='dilate')
        original_contour, contours_img, contour_count = get_contours(img_array, min_area=100, exclude_largest=False)
        
        # Convert all images to base64
        return {
            "filename": file.filename,
            "status": "success",
            "processed_images": {
                "original": image_to_base64(original),
                "grayscale": image_to_base64(cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)),
                "heatmap": image_to_base64(heatmap),
                "canny_edges": image_to_base64(edges),
                "clahe_enhanced": image_to_base64(enhanced),
                "morphological_dilate": image_to_base64(morphed),
                "contours_detected": image_to_base64(contours_img),
            },
            "metadata": {
                "total_contours": contour_count,
                "image_width": original.shape[1],
                "image_height": original.shape[0]
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Predict if a brain scan contains a tumor
    
    Args:
        file: Image file (JPEG, PNG, etc.)
    
    Returns:
        Prediction result with confidence
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Read uploaded file
        contents = await file.read()
        
        # Preprocess image
        processed_image = preprocess_image(contents)
        
        # Make prediction
        prediction = model.predict(processed_image, verbose=0)
        confidence = float(prediction[0][0])
        
        # Determine class
        predicted_class = 1 if confidence > 0.5 else 0
        class_label = CLASS_LABELS[predicted_class]
        
        return {
            "filename": file.filename,
            "prediction": class_label,
            "predicted_class": predicted_class,
            "confidence": confidence,
            "has_tumor": predicted_class == 1
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
