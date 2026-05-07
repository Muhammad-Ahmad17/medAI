# Image Processor Service

## Overview
The Image Processor is a Python-based microservice that consumes image upload events from Kafka, performs image preprocessing and analysis, and orchestrates the ML pipeline. It handles image validation, transformation, and parallel processing for optimal performance.

## Technology Stack
- **Language**: Python 3
- **Message Queue**: Kafka (for event-driven processing)
- **Image Libraries**: OpenCV, Pillow, NumPy (for image manipulation)
- **Cloud Storage**: Oracle Cloud Infrastructure (OCI) with S3-compatible API
- **AWS SDK**: boto3 (for S3 interaction)

## Directory Structure

```
image_processor/
├── main.py              # Application entry point
├── config/
│   └── settings.py      # Configuration management and constants
├── infra/               # Infrastructure and external service integration
│   ├── kafka_consumer.py   # Kafka consumer setup for image events
│   ├── kafka_producer.py   # Kafka producer for downstream messaging
│   └── oci_client.py       # Oracle Cloud Storage client
├── services/            # Core business logic
│   ├── image_handler.py    # Image I/O and retrieval
│   ├── parallel_upload.py  # Parallel upload orchestration
│   └── processor.py        # Image processing and transformation
├── Dockerfile           # Container configuration
└── requirements.txt     # Python dependencies
```

## Key Features

### 1. **Event-Driven Processing**
- Consumes image upload events from Kafka topics
- Processes images asynchronously without blocking the API Gateway
- Supports parallel processing for multiple images

### 2. **Image Processing Pipeline**
- **Validation**: Verifies image format, size, and integrity
- **Normalization**: Standardizes image dimensions and color space
- **Augmentation**: Applies transformations for ML model compatibility
- **Optimization**: Prepares images for neural network analysis

### 3. **Cloud Storage Integration**
- Retrieves original images from OCI Object Storage
- Stores processed images back to storage
- Manages file paths and metadata

### 4. **Parallel Processing**
- Handles multiple images concurrently
- Optimizes CPU/GPU utilization
- Manages resource pools efficiently

## Dependencies

| Package | Purpose |
|---------|---------|
| `confluent-kafka` | Kafka client for message consumption |
| `oci` | Oracle Cloud SDK for authentication and services |
| `opencv-python` | Image processing and computer vision |
| `Pillow` | Image manipulation and format conversion |
| `numpy` | Numerical computing and array operations |
| `boto3` / `botocore` | AWS/S3-compatible API for OCI storage |

## Processing Workflow

```
Kafka Event (Image Upload)
    ↓
Consumer Receives Event
    ↓
Retrieve Image from OCI Storage
    ↓
Validate & Preprocess Image
    ↓
Parallel Processing (if multiple images)
    ↓
Store Processed Images
    ↓
Publish Event to ML Service (Kafka)
    ↓
Update Status in Result Aggregator
```

## Key Modules

### `services/processor.py`
Core image processing logic including:
- Image resizing and normalization
- Color space conversions (RGB, grayscale, etc.)
- Noise filtering and enhancement
- Feature extraction preparation

### `services/image_handler.py`
Handles image I/O operations:
- Downloads from OCI storage
- Uploads processed results
- Manages temporary file storage
- Handles format conversions

### `services/parallel_upload.py`
Orchestrates concurrent processing:
- Manages thread/process pools
- Coordinates multiple image uploads
- Tracks processing completion
- Aggregates results

### `infra/oci_client.py`
Cloud storage integration:
- Authenticates with OCI
- Lists and retrieves objects
- Uploads processed images
- Manages bucket operations

### `infra/kafka_consumer.py` & `infra/kafka_producer.py`
Message queue integration:
- Subscribes to image upload topics
- Publishes processing completion events
- Handles message serialization
- Ensures fault tolerance

## Environment Variables
Configuration is defined in `config/settings.py`:
- `KAFKA_BROKERS` - Kafka broker addresses
- `OCI_CONFIG_PATH` - Path to OCI credentials
- `COMPARTMENT_ID` - Oracle Cloud compartment ID
- `BUCKET_NAME` - Object storage bucket name
- `MAX_WORKERS` - Thread pool size for parallel processing
- `IMAGE_MAX_SIZE` - Maximum accepted image dimensions

## Running the Service

```bash
# Install dependencies
pip install -r requirements.txt

# Run the processor
python main.py
```

## Integration Points

- **Receives events from**: API Gateway (via Kafka - upload topic)
- **Retrieves files from**: OCI Object Storage
- **Sends events to**: ML Service (via Kafka - processed-images topic)
- **Stores results in**: OCI Object Storage

## Error Handling & Resilience

- Implements retry logic for failed image retrievals
- Validates image integrity before processing
- Logs detailed error information for debugging
- Implements circuit breaker pattern for external service calls
- Graceful degradation for partial batch failures

## Performance Considerations

- Uses parallel processing for multiple images
- Implements caching for frequently accessed metadata
- Optimizes image compression for storage efficiency
- Monitors memory usage during large batch operations
