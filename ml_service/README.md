# ML Service

## Overview
The ML Service is a Python-based microservice that performs machine learning inference on processed cancer cell images. It runs deep learning models to detect and classify cancer cells, providing predictions that are aggregated and returned to end users.

## Technology Stack
- **Language**: Python 3
- **Message Queue**: Kafka (for event-driven processing)
- **Machine Learning**: TensorFlow/PyTorch (for neural networks)
- **Numerical Computing**: NumPy
- **Cloud Storage**: Oracle Cloud Infrastructure (OCI) with S3-compatible API
- **AWS SDK**: boto3 (for S3 interaction)

## Directory Structure

```
ml_service/
├── main.py              # Application entry point
├── config/
│   └── settings.py      # Configuration management, model paths, hyperparameters
├── infra/               # Infrastructure and external service integration
│   ├── kafka_consumer.py   # Kafka consumer for processed image events
│   ├── kafka_producer.py   # Kafka producer for ML results
│   └── oci_client.py       # Oracle Cloud Storage client
├── services/            # ML inference and analysis
│   └── ml_handler.py       # Model loading, inference, and prediction logic
├── Dockerfile           # Container configuration
└── requirements.txt     # Python dependencies
```

## Key Features

### 1. **Model Inference**
- Loads pre-trained cancer detection models
- Runs inference on processed images
- Generates predictions with confidence scores
- Supports multiple model architectures for ensemble predictions

### 2. **Event-Driven Processing**
- Consumes processed image events from Image Processor via Kafka
- Provides results asynchronously to Result Aggregator
- Supports batch inference for efficiency
- Scalable to process multiple images in parallel

### 3. **Cloud Storage Integration**
- Retrieves processed images from OCI Object Storage
- Stores model outputs and analysis results
- Manages prediction artifacts and metadata

### 4. **Result Aggregation Coordination**
- Publishes inference results with metadata (confidence, bounding boxes, etc.)
- Includes model version and timestamp information
- Enables result correlation across multiple analysis runs

## Dependencies

| Package | Purpose |
|---------|---------|
| `confluent-kafka` | Kafka client for message consumption/production |
| `oci` | Oracle Cloud SDK for authentication |
| `tensorflow` or `pytorch` | Deep learning framework (model specific) |
| `numpy` | Numerical computing and array operations |
| `boto3` / `botocore` | AWS/S3-compatible API for OCI storage |
| `opencv-python` | Image loading and preprocessing for inference |

## ML Inference Workflow

```
Kafka Event (Processed Image)
    ↓
Consumer Receives Event
    ↓
Retrieve Processed Image from OCI Storage
    ↓
Load ML Model (if not cached)
    ↓
Preprocess Image for Model Input
    ↓
Run Inference
    ↓
Post-process Results (format predictions)
    ↓
Publish Results to Kafka (aggregator topic)
    ↓
Store Results in OCI Storage
```

## Key Modules

### `services/ml_handler.py`
Core machine learning inference:
- Model initialization and loading
- Pre/post-processing for model input
- Running inference on images
- Generating confidence scores and class predictions
- Handling multi-scale or ensemble predictions
- Generating visualizations (bounding boxes, heatmaps)

### `infra/oci_client.py`
Cloud storage integration:
- Retrieves processed images from storage
- Downloads pre-trained model weights (if dynamic)
- Uploads inference results and visualizations
- Manages object metadata

### `infra/kafka_consumer.py`
Event consumption:
- Subscribes to processed-images topic from Image Processor
- Deserializes image metadata and paths
- Handles message batching for efficient processing
- Implements offset management

### `infra/kafka_producer.py`
Result publishing:
- Publishes predictions to aggregator topic
- Includes full prediction metadata
- Handles serialization and error cases

## Configuration

Key settings in `config/settings.py`:
- `MODEL_PATH` - Path to pre-trained model weights
- `MODEL_TYPE` - Architecture type (CNN, ResNet, etc.)
- `CONFIDENCE_THRESHOLD` - Minimum confidence for positive predictions
- `BATCH_SIZE` - Number of images to process in parallel
- `KAFKA_TOPICS` - Input/output topic names
- `OCI_*` - Oracle Cloud credentials and endpoints

## Running the Service

```bash
# Install dependencies
pip install -r requirements.txt

# Download/cache models (if needed)
python -c "from services.ml_handler import load_model; load_model()"

# Run the service
python main.py
```

## Model Details

The ML Service typically includes:

### Cancer Detection Model
- **Input**: Processed medical images (standardized dimensions)
- **Output**: Binary or multi-class predictions (cancer present/absent or cancer type)
- **Metrics**: Confidence scores, probability distributions

### Optional Segmentation Model
- Generates pixel-level predictions (bounding boxes)
- Identifies tumor regions
- Provides spatial information for result visualization

## Integration Points

- **Receives events from**: Image Processor (via Kafka - processed-images topic)
- **Retrieves images from**: OCI Object Storage
- **Sends results to**: Result Aggregator (via Kafka - ml-results topic)
- **Stores artifacts in**: OCI Object Storage

## Error Handling & Resilience

- Implements retry logic for message consumption failures
- Validates image format before inference
- Handles model loading failures gracefully
- Logs inference results and errors for audit trails
- Implements timeout mechanisms for long-running inferences

## Performance Optimization

- Model caching in memory (avoids reload per prediction)
- Batch inference for multiple images
- GPU acceleration (if available)
- Image preprocessing optimization
- Result serialization for efficient Kafka transport

## Monitoring & Observability

- Tracks inference latency
- Monitors model prediction confidence distributions
- Logs anomalous predictions for review
- Provides metrics for model performance tracking
- Handles cases where models fail or return uncertain predictions
