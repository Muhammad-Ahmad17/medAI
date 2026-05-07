#!/usr/bin/env python3
"""
Test script for the brain tumor image processing API
Run this after starting the FastAPI server with: python fastapi_app.py
"""

import requests
import json
import base64
from PIL import Image
from io import BytesIO
import time

# API endpoint
API_URL = "http://localhost:8000"

def test_health():
    """Test health check endpoint"""
    print("\n" + "="*60)
    print("Testing /health endpoint")
    print("="*60)
    try:
        response = requests.get(f"{API_URL}/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_root():
    """Test root endpoint"""
    print("\n" + "="*60)
    print("Testing / (root) endpoint")
    print("="*60)
    try:
        response = requests.get(f"{API_URL}/")
        print(f"Status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_process_images(image_path):
    """Test the new process-images endpoint"""
    print("\n" + "="*60)
    print("Testing /process-images endpoint")
    print("="*60)
    
    try:
        # Open and verify image exists
        with Image.open(image_path) as img:
            print(f"Image loaded: {img.size} ({img.mode})")
        
        # Upload file
        with open(image_path, 'rb') as f:
            files = {'file': f}
            print("Uploading image...")
            start_time = time.time()
            response = requests.post(f"{API_URL}/process-images", files=files)
            elapsed_time = time.time() - start_time
        
        print(f"Status: {response.status_code}")
        print(f"Processing time: {elapsed_time:.2f} seconds")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✓ Successfully processed image: {data['filename']}")
            print(f"✓ Metadata: Contours detected = {data['metadata']['total_contours']}")
            print(f"✓ Image dimensions: {data['metadata']['image_width']}x{data['metadata']['image_height']}")
            print(f"✓ Processed images returned:")
            for img_name in data['processed_images'].keys():
                print(f"   - {img_name}")
            
            # Save one example image
            sample_img_base64 = data['processed_images']['heatmap']
            img_data = base64.b64decode(sample_img_base64)
            img = Image.open(BytesIO(img_data))
            img.save("test_output_heatmap.jpg")
            print(f"\n✓ Sample image saved: test_output_heatmap.jpg")
            
            return True
        else:
            print(f"Error: {response.text}")
            return False
            
    except FileNotFoundError:
        print(f"Error: Image file not found: {image_path}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_predict(image_path):
    """Test the existing predict endpoint"""
    print("\n" + "="*60)
    print("Testing /predict endpoint")
    print("="*60)
    
    try:
        with open(image_path, 'rb') as f:
            files = {'file': f}
            print("Uploading image for classification...")
            response = requests.post(f"{API_URL}/predict", files=files)
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            return True
        else:
            print(f"Error: {response.text}")
            return False
            
    except FileNotFoundError:
        print(f"Error: Image file not found: {image_path}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False


if __name__ == "__main__":
    print("\n")
    print("╔" + "="*58 + "╗")
    print("║" + " "*10 + "Brain Tumor API - Test Suite" + " "*20 + "║")
    print("╚" + "="*58 + "╝")
    
    # Check if server is running
    print("\n⏳ Checking if API server is running...")
    try:
        requests.get(f"{API_URL}/", timeout=2)
        print("✓ API server is running!")
    except:
        print("✗ API server is not running!")
        print("  Start it with: python fastapi_app.py")
        exit(1)
    
    # Run tests
    results = []
    results.append(("Root endpoint", test_root()))
    results.append(("Health check", test_health()))
    
    # For process-images and predict tests, use a sample image
    image_path = "../model_training/brain_tumor_dataset/yes/Y1.jpg"
    
    # Check if test image exists
    import os
    if os.path.exists(image_path):
        results.append(("Process images", test_process_images(image_path)))
        results.append(("Predict", test_predict(image_path)))
    else:
        print(f"\n⚠ Test image not found at {image_path}")
        print("  Skipping process-images and predict tests")
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    for test_name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status:8} - {test_name}")
    
    passed_count = sum(1 for _, p in results if p)
    total_count = len(results)
    print(f"\nTotal: {passed_count}/{total_count} tests passed")
    
    if passed_count == total_count:
        print("\n✓ All tests passed! API is working correctly.")
    else:
        print("\n✗ Some tests failed. Check the output above.")
