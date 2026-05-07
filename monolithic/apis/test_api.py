"""
Test script for the Brain Tumor Classifier FastAPI endpoint
Tests with both mock-generated images and real test images from the dataset
"""

import requests
import numpy as np
from PIL import Image, ImageDraw
import io
import os
import json
import time
from pathlib import Path

# API endpoint
API_URL = "http://localhost:8000"
PREDICT_ENDPOINT = f"{API_URL}/predict"
HEALTH_ENDPOINT = f"{API_URL}/health"

# Test data directories
BASE_DIR = Path(__file__).parent
TEST_IMAGES_DIR = BASE_DIR / "model_training" / "test_images"
NO_TUMOR_DIR = TEST_IMAGES_DIR / "no"
TUMOR_DIR = TEST_IMAGES_DIR / "yes"


def create_mock_image(width: int = 128, height: int = 128, image_type: str = "random") -> io.BytesIO:
    """
    Create a mock image for testing
    
    Args:
        width: Image width
        height: Image height
        image_type: Type of mock image ('random', 'solid_gray', 'gradient', 'circle')
    
    Returns:
        BytesIO object containing the image
    """
    if image_type == "random":
        # Random noise image
        img_array = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
        img = Image.fromarray(img_array, 'RGB')
    
    elif image_type == "solid_gray":
        # Solid gray image
        img_array = np.full((height, width, 3), 128, dtype=np.uint8)
        img = Image.fromarray(img_array, 'RGB')
    
    elif image_type == "gradient":
        # Gradient image
        img_array = np.zeros((height, width, 3), dtype=np.uint8)
        for i in range(width):
            img_array[:, i, :] = int(255 * (i / width))
        img = Image.fromarray(img_array, 'RGB')
    
    elif image_type == "circle":
        # Image with a circle drawn
        img = Image.new('RGB', (width, height), color='gray')
        draw = ImageDraw.Draw(img)
        center_x, center_y = width // 2, height // 2
        radius = min(width, height) // 4
        draw.ellipse(
            [center_x - radius, center_y - radius, center_x + radius, center_y + radius],
            fill='white'
        )
    
    else:
        raise ValueError(f"Unknown image type: {image_type}")
    
    # Convert to bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    img_bytes.seek(0)
    return img_bytes


def test_health_check():
    """Test the health check endpoint"""
    print("\n" + "="*60)
    print("Testing Health Check Endpoint")
    print("="*60)
    try:
        response = requests.get(HEALTH_ENDPOINT, timeout=5)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to API. Is the server running?")
        print(f"   Try running: python fastapi_app.py")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_mock_images():
    """Test the predict endpoint with mock images"""
    print("\n" + "="*60)
    print("Testing with Mock Images")
    print("="*60)
    
    mock_types = ["random", "solid_gray", "gradient", "circle"]
    results = []
    
    for mock_type in mock_types:
        print(f"\n📸 Testing with {mock_type.upper()} image...")
        try:
            # Create mock image
            mock_image = create_mock_image(image_type=mock_type)
            
            # Send request
            files = {'file': ('mock_' + mock_type + '.png', mock_image, 'image/png')}
            response = requests.post(PREDICT_ENDPOINT, files=files, timeout=10)
            
            # Check response
            if response.status_code == 200:
                result = response.json()
                results.append(result)
                print(f"   ✅ Status: {response.status_code}")
                print(f"   Prediction: {result['prediction']}")
                print(f"   Confidence: {result['confidence']:.4f}")
                print(f"   Has Tumor: {result['has_tumor']}")
            else:
                print(f"   ❌ Status: {response.status_code}")
                print(f"   Error: {response.text}")
        
        except Exception as e:
            print(f"   ❌ Error: {e}")
    
    return results


def test_real_images():
    """Test the predict endpoint with real test images from dataset"""
    print("\n" + "="*60)
    print("Testing with Real Dataset Images")
    print("="*60)
    
    results = {"no_tumor": [], "tumor": []}
    
    # Test images with no tumor
    if NO_TUMOR_DIR.exists():
        print(f"\n🔍 Testing images WITHOUT tumor (directory: {NO_TUMOR_DIR})")
        image_files = list(NO_TUMOR_DIR.glob('*.*'))[:3]  # Test first 3 images
        
        if not image_files:
            print("   ℹ️ No images found in 'no' directory")
        
        for img_path in image_files:
            try:
                print(f"\n   📸 Testing: {img_path.name}")
                with open(img_path, 'rb') as f:
                    files = {'file': (img_path.name, f, 'image/jpeg')}
                    response = requests.post(PREDICT_ENDPOINT, files=files, timeout=10)
                
                if response.status_code == 200:
                    result = response.json()
                    results["no_tumor"].append(result)
                    print(f"      ✅ Prediction: {result['prediction']}")
                    print(f"      Confidence: {result['confidence']:.4f}")
                else:
                    print(f"      ❌ Status: {response.status_code}")
            
            except Exception as e:
                print(f"      ❌ Error: {e}")
    else:
        print(f"   ℹ️ Directory not found: {NO_TUMOR_DIR}")
    
    # Test images with tumor
    if TUMOR_DIR.exists():
        print(f"\n🔍 Testing images WITH tumor (directory: {TUMOR_DIR})")
        image_files = list(TUMOR_DIR.glob('*.*'))[:3]  # Test first 3 images
        
        if not image_files:
            print("   ℹ️ No images found in 'yes' directory")
        
        for img_path in image_files:
            try:
                print(f"\n   📸 Testing: {img_path.name}")
                with open(img_path, 'rb') as f:
                    files = {'file': (img_path.name, f, 'image/jpeg')}
                    response = requests.post(PREDICT_ENDPOINT, files=files, timeout=10)
                
                if response.status_code == 200:
                    result = response.json()
                    results["tumor"].append(result)
                    print(f"      ✅ Prediction: {result['prediction']}")
                    print(f"      Confidence: {result['confidence']:.4f}")
                else:
                    print(f"      ❌ Status: {response.status_code}")
            
            except Exception as e:
                print(f"      ❌ Error: {e}")
    else:
        print(f"   ℹ️ Directory not found: {TUMOR_DIR}")
    
    return results


def print_summary(mock_results, real_results):
    """Print a summary of all test results"""
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    
    print(f"\n📊 Mock Images Tested: {len(mock_results)}")
    if mock_results:
        for result in mock_results:
            print(f"   - {result['filename']}: {result['prediction']} (confidence: {result['confidence']:.4f})")
    
    print(f"\n📊 Real Images Without Tumor: {len(real_results['no_tumor'])}")
    if real_results['no_tumor']:
        correct = sum(1 for r in real_results['no_tumor'] if r['prediction'] == 'No Tumor')
        print(f"   - Correctly identified as 'No Tumor': {correct}/{len(real_results['no_tumor'])}")
    
    print(f"\n📊 Real Images With Tumor: {len(real_results['tumor'])}")
    if real_results['tumor']:
        correct = sum(1 for r in real_results['tumor'] if r['prediction'] == 'Tumor Present')
        print(f"   - Correctly identified as 'Tumor Present': {correct}/{len(real_results['tumor'])}")
    
    print("\n" + "="*60)


def main():
    """Main test function"""
    print("\n🚀 Brain Tumor Classifier API - Test Suite")
    print("="*60)
    
    # Check if API is running
    if not test_health_check():
        print("\n⚠️  Waiting for API to start...")
        print("   Run the API with: python fastapi_app.py")
        print("   Then try this test script again.\n")
        return
    
    # Run tests
    mock_results = test_mock_images()
    real_results = test_real_images()
    
    # Print summary
    print_summary(mock_results, real_results)
    
    print("\n✅ Test suite completed!")
    print(f"   API URL: {API_URL}")
    print(f"   Interactive docs: {API_URL}/docs")
    print(f"   Alternative docs: {API_URL}/redoc")


if __name__ == "__main__":
    main()
