# API Gateway Service

## Overview
The API Gateway is the entry point for the cancer cell detection system. It's a Node.js/Fastify-based HTTP server that handles user requests, manages file uploads, and coordinates communication with other microservices via message queues.

## Technology Stack
- **Framework**: Fastify (lightweight, high-performance web framework)
- **Language**: JavaScript (Node.js)
- **Message Queue**: Kafka (for asynchronous communication)
- **Cache**: Redis (for job status tracking and caching)
- **Cloud Storage**: Oracle Cloud Infrastructure (OCI) S3-compatible storage

## Directory Structure

```
api_gateway/
├── src/
│   ├── config/          # Configuration management (environment variables)
│   ├── routes/          # API endpoint definitions
│   │   ├── upload.js    # File upload endpoint
│   │   └── status.js    # Job status checking endpoint
│   ├── infra/           # Infrastructure integrations
│   │   ├── kafka.js     # Kafka producer/consumer setup
│   │   ├── redis.js     # Redis client configuration
│   │   └── oci.js       # Oracle Cloud Storage integration
│   ├── services/        # Business logic layer
│   │   └── jobService.js # Job management and coordination
│   └── index.js         # Application entry point
├── Dockerfile           # Container configuration
└── package.json         # Node.js dependencies and scripts
```

## Key Features

### 1. **File Upload**
- Accepts multipart form data for image uploads
- Integrates with OCI object storage for file persistence
- Produces Kafka messages to trigger image processing pipeline

### 2. **Job Status Tracking**
- Exposes endpoint to check processing status
- Uses Redis for fast status lookups
- Returns real-time job state to clients

### 3. **Health Monitoring**
- `/health` endpoint for liveness/readiness probes
- Useful for container orchestration platforms

### 4. **Message Queue Integration**
- Publishes events to Kafka topics
- Coordinates with Image Processor and ML Service
- Enables asynchronous, scalable processing

## Dependencies

| Package | Purpose |
|---------|---------|
| `fastify` | Web server framework |
| `@fastify/multipart` | File upload handling |
| `kafkajs` | Kafka client for messaging |
| `ioredis` | Redis client for caching |
| `@aws-sdk/client-s3` | S3-compatible storage interaction (OCI uses S3 API) |

## API Endpoints

### Upload File
**POST** `/upload`
- Accepts multipart file uploads
- Triggers asynchronous processing pipeline
- Returns job ID for status tracking

### Check Status
**GET** `/status/:jobId`
- Returns current processing status of a job
- Polls Redis for cached status information

### Health Check
**GET** `/health`
- Returns service health status

## Environment Variables
Configuration is managed via environment variables (see `src/config/env.js`):
- `PORT` - Server listening port
- `KAFKA_BROKERS` - Kafka broker addresses
- `REDIS_URL` - Redis connection URL
- `OCI_*` - Oracle Cloud credentials and settings

## Running the Service

```bash
# Start the API Gateway
npm start
```

The service will:
1. Connect to Redis for caching
2. Initialize Kafka producer for messaging
3. Listen on specified port for incoming requests

## Integration Points

- **Receives uploads from**: Users/clients
- **Sends events to**: Image Processor (via Kafka)
- **Stores files in**: OCI Object Storage
- **Caches data in**: Redis
- **Reports results to**: ML Service, Result Aggregator

## Error Handling
- Graceful shutdown on SIGINT/SIGTERM signals
- Connection pooling and retries for external services
- Comprehensive logging via Fastify's built-in logger
