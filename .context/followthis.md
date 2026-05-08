# Cancer Cell Detection System - Agile Implementation Guide

## Overview
This guide breaks down the cancer cell detection system into **incremental stages** where you can build, test, and verify functionality at each step before moving forward. This prevents "big bang" failures and ensures the system works correctly piece-by-piece.

## ⚠️ Important: Container Names Reference
**Correct container names** (from docker-compose.yml):
- `cancer-zookeeper` (not cancer_cells_zookeeper)
- `cancer-kafka` (not cancer_cells_kafka)
- `cancer-postgres` (not cancer_cells_postgres)
- `cancer-redis` (not cancer_cells_redis)
- `cancer-api-gateway` (not cancer_cells_api_gateway)
- `cancer-image-processor` (not cancer_cells_image_processor)
- `cancer-ml-service` (not cancer_cells_ml_service)
- `cancer-result-aggregator` (not cancer_cells_result_aggregator)

**Correct database credentials** (from .env):
- Username: `admin` (not postgres)
- Password: `changeme`
- Database: `cancer_cells` (not cancer_cells_db)

Use `docker compose` (not `docker-compose`) for all commands.

---

## Stage 1: Infrastructure & Setup
**Goal**: Get Docker, services, and basic networking working  
**Estimated**: 1-2 hours  
**Success Criteria**: All containers running and healthy

### 1.1 Initialize Docker Environment
```bash
cd /home/muhammad-ahmad/cancer_cells

# Verify docker-compose.yml exists and is valid
docker-compose config

# Build all images
docker-compose build

# Start services
docker-compose up -d
```

### 1.2 Verify Basic Connectivity
```bash
# Check all containers running
docker-compose ps

# Test network connectivity between containers (once api_gateway is built in Stage 2)
# For now, just verify core infrastructure is running
docker compose ps
```

### 1.3 Test Database Connection
```bash
# Connect to PostgreSQL and verify it's accessible
docker exec -it cancer-postgres psql -U admin -d cancer_cells -c "SELECT 1;"

# Run init.sql to set up tables
docker exec -i cancer-postgres psql -U admin -d cancer_cells < postgres/init.sql

# Verify tables created
docker exec cancer-postgres psql -U admin -d cancer_cells -c "\dt"
```

### 1.4 Test Kafka Connection
```bash
# Verify Kafka broker is responsive
docker exec cancer-kafka kafka-broker-api-versions --bootstrap-server localhost:9092

# Create test topic
docker exec cancer-kafka kafka-topics --create --topic test-topic \
  --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1 2>/dev/null || true

# List topics
docker exec cancer-kafka kafka-topics --list --bootstrap-server localhost:9092
```

### 1.5 Test Redis Connection
```bash
# Verify Redis is responsive
docker exec cancer-redis redis-cli ping
```

### Testing Checklist
- [ ] All containers are running: `docker-compose ps` shows all healthy
- [ ] PostgreSQL: Can connect and query
- [ ] Kafka: Topics can be created and listed
- [ ] Redis: PING responds with PONG
- [ ] Networking: Services can ping each other

**If ALL pass → Continue to Stage 2**  
**If ANY fail → Debug and fix before proceeding**

---

## Stage 2: Basic API Gateway Setup
**Goal**: Get the API Gateway running with health check and basic structure  
**Estimated**: 1-2 hours  
**Success Criteria**: `/health` endpoint responds with 200

### 2.1 Implement API Gateway Entry Point
Update `api_gateway/src/index.js`:
```javascript
import Fastify from 'fastify'
import multipart from '@fastify/multipart'

const app = Fastify({ logger: true })

app.register(multipart)

// Health check endpoint (no dependencies)
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

const PORT = process.env.PORT || 3000

async function start() {
  try {
    await app.listen({ host: '0.0.0.0', port: PORT })
    console.log(`API Gateway listening on port ${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
```

### 2.2 Test Health Endpoint
```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2026-05-06T21:00:00.000Z"}
```

### 2.3 Add Environment Configuration
Create `api_gateway/src/config/env.js`:
```javascript
export const env = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  KAFKA_BROKERS: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
  REDIS_URL: process.env.REDIS_URL || 'redis://redis:6379',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
}
```

### 2.4 Graceful Shutdown
Update `api_gateway/src/index.js` to handle shutdown:
```javascript
// Add at end of file
async function shutdown() {
  console.log('Shutting down gracefully...')
  await app.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
```

### 2.5 Update docker-compose.yml
Ensure api_gateway service is properly configured:
```yaml
api_gateway:
  build: ./api_gateway
  container_name: cancer_cells_api_gateway
  ports:
    - "3000:3000"
  environment:
    - PORT=3000
    - KAFKA_BROKERS=kafka:9092
    - REDIS_URL=redis://redis:6379
  depends_on:
    - kafka
    - redis
  networks:
    - cancer_network
```

### Testing Checklist
- [ ] API Gateway container starts: `docker-compose logs api_gateway`
- [ ] Health endpoint responds: `curl http://localhost:3000/health` (200 OK)
- [ ] Container logs show "listening on port 3000"
- [ ] Graceful shutdown works: CTRL+C in container

**If ALL pass → Continue to Stage 3**

---

## Stage 3: File Upload Endpoint
**Goal**: Implement `/upload` endpoint that accepts files and validates them  
**Estimated**: 2-3 hours  
**Success Criteria**: Upload endpoint accepts files and returns job ID

### 3.1 Create Upload Route Handler
Create `api_gateway/src/routes/upload.js`:
```javascript
export async function uploadRoutes(app) {
  app.post('/upload', async (request, reply) => {
    const data = await request.file()
    
    if (!data) {
      return reply.status(400).send({ error: 'No file provided' })
    }

    const filename = data.filename
    const buffer = await data.file.toBuffer()

    // Generate job ID
    const jobId = generateJobId()

    // Store in-memory for now (will upgrade to database later)
    const job = {
      id: jobId,
      filename,
      size: buffer.length,
      status: 'received',
      timestamp: new Date().toISOString()
    }

    console.log(`[UPLOAD] Job ${jobId}: ${filename} (${buffer.length} bytes)`)

    return {
      jobId,
      status: 'queued',
      message: 'File received and queued for processing'
    }
  })
}

function generateJobId() {
  return 'job-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
}
```

### 3.2 Update Main Entry Point
Update `api_gateway/src/index.js`:
```javascript
import { uploadRoutes } from './routes/upload.js'

// Register routes
app.register(uploadRoutes)
```

### 3.3 Test File Upload
```bash
# Create test image file
echo "fake-image-data" > /tmp/test.txt

# Upload file
curl -X POST -F "file=@/tmp/test.txt" http://localhost:3000/upload

# Expected response:
# {"jobId":"job-1234567890-abc123","status":"queued","message":"..."}
```

### 3.4 Add Input Validation
Update upload route to validate files:
```javascript
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/tiff']

// In uploadRoutes handler:
if (buffer.length > MAX_FILE_SIZE) {
  return reply.status(413).send({ 
    error: `File too large. Max: ${MAX_FILE_SIZE} bytes` 
  })
}

if (!ALLOWED_TYPES.includes(data.mimetype)) {
  return reply.status(415).send({ 
    error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` 
  })
}
```

### Testing Checklist
- [ ] Health endpoint still works: `curl http://localhost:3000/health`
- [ ] File upload succeeds: `curl -F "file=@/tmp/test.txt" http://localhost:3000/upload`
- [ ] Returns jobId in response
- [ ] Validation works: Try uploading wrong file type → 415 error
- [ ] Validation works: Try uploading oversized file → 413 error
- [ ] Logs show upload events

**If ALL pass → Continue to Stage 4**

---

## Stage 4: Job Status Endpoint
**Goal**: Implement `/status/:jobId` endpoint to track job progress  
**Estimated**: 1-2 hours  
**Success Criteria**: Status endpoint returns current job state

### 4.1 Create In-Memory Job Store
Create `api_gateway/src/services/jobService.js`:
```javascript
// Simple in-memory store (will upgrade to Redis/DB later)
const jobStore = new Map()

export function createJob(filename, filesize) {
  const jobId = generateJobId()
  jobStore.set(jobId, {
    id: jobId,
    filename,
    filesize,
    status: 'received',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  return jobId
}

export function getJob(jobId) {
  return jobStore.get(jobId)
}

export function updateJobStatus(jobId, status, details = {}) {
  const job = jobStore.get(jobId)
  if (!job) return null
  
  job.status = status
  job.updatedAt = new Date().toISOString()
  Object.assign(job, details)
  
  return job
}

function generateJobId() {
  return 'job-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
}
```

### 4.2 Create Status Route
Create `api_gateway/src/routes/status.js`:
```javascript
import { getJob } from '../services/jobService.js'

export async function statusRoutes(app) {
  app.get('/status/:jobId', async (request, reply) => {
    const { jobId } = request.params
    
    const job = getJob(jobId)
    
    if (!job) {
      return reply.status(404).send({
        error: 'Job not found',
        jobId
      })
    }

    return {
      jobId: job.id,
      status: job.status,
      filename: job.filename,
      filesize: job.filesize,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    }
  })
}
```

### 4.3 Update Upload Route to Use Job Service
Update `api_gateway/src/routes/upload.js`:
```javascript
import { createJob, updateJobStatus } from '../services/jobService.js'

// In uploadRoutes handler:
const jobId = createJob(filename, buffer.length)
updateJobStatus(jobId, 'queued')

return {
  jobId,
  status: 'queued',
  message: 'File received and queued for processing'
}
```

### 4.4 Register Status Route
Update `api_gateway/src/index.js`:
```javascript
import { statusRoutes } from './routes/status.js'

app.register(statusRoutes)
```

### Testing Checklist
- [ ] Upload file and get jobId: `curl -F "file=@/tmp/test.txt" http://localhost:3000/upload`
- [ ] Query status with jobId: `curl http://localhost:3000/status/job-xxxxx`
- [ ] Status response includes: jobId, status, filename, filesize, timestamps
- [ ] Non-existent jobId returns 404: `curl http://localhost:3000/status/job-invalid`
- [ ] Status updates correctly between requests

**If ALL pass → Continue to Stage 5**

---

## Stage 5: Kafka Integration - Producer Setup
**Goal**: Connect API Gateway to Kafka and publish upload events  
**Estimated**: 2-3 hours  
**Success Criteria**: Upload events are published to Kafka topic

### 5.1 Create Kafka Producer
Create `api_gateway/src/infra/kafka.js`:
```javascript
import { Kafka } from 'kafkajs'
import { env } from '../config/env.js'

const kafka = new Kafka({
  clientId: 'api-gateway',
  brokers: env.KAFKA_BROKERS,
  retry: {
    initialRetryTime: 100,
    retries: 5,
    maxRetryTime: 30000,
    multiplier: 2
  }
})

const producer = kafka.producer()

export async function connectProducer() {
  try {
    await producer.connect()
    console.log('[KAFKA] Producer connected')
  } catch (err) {
    console.error('[KAFKA] Producer connection failed:', err)
    throw err
  }
}

export async function disconnectProducer() {
  try {
    await producer.disconnect()
    console.log('[KAFKA] Producer disconnected')
  } catch (err) {
    console.error('[KAFKA] Producer disconnection failed:', err)
  }
}

export async function publishUploadEvent(jobId, filename, filesize) {
  try {
    await producer.send({
      topic: 'image-uploads',
      messages: [
        {
          key: jobId,
          value: JSON.stringify({
            jobId,
            filename,
            filesize,
            timestamp: new Date().toISOString(),
            eventType: 'image-uploaded'
          })
        }
      ]
    })
    console.log(`[KAFKA] Published event for job ${jobId}`)
  } catch (err) {
    console.error(`[KAFKA] Failed to publish event for job ${jobId}:`, err)
    throw err
  }
}
```

### 5.2 Initialize Kafka in Main App
Update `api_gateway/src/index.js`:
```javascript
import { connectProducer, disconnectProducer } from './infra/kafka.js'

async function start() {
  try {
    await connectProducer() // Connect to Kafka
    await app.listen({ host: '0.0.0.0', port: PORT })
    console.log(`API Gateway listening on port ${PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

async function shutdown() {
  console.log('Shutting down gracefully...')
  await disconnectProducer() // Disconnect from Kafka
  await app.close()
  process.exit(0)
}
```

### 5.3 Publish Event on Upload
Update `api_gateway/src/routes/upload.js`:
```javascript
import { publishUploadEvent } from '../infra/kafka.js'

// In uploadRoutes handler, after creating job:
try {
  await publishUploadEvent(jobId, filename, buffer.length)
  updateJobStatus(jobId, 'sent-to-queue')
} catch (err) {
  console.error(`Failed to publish upload event for job ${jobId}:`, err)
  updateJobStatus(jobId, 'error', { error: 'Failed to queue job' })
  return reply.status(500).send({ error: 'Failed to queue job' })
}
```

### 5.4 Create Kafka Topic
```bash
# Create image-uploads topic
docker exec cancer-kafka kafka-topics --create --topic image-uploads \
  --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1 2>/dev/null || true

# Verify topic created
docker exec cancer-kafka kafka-topics --list --bootstrap-server localhost:9092
```

### 5.5 Monitor Kafka Events
```bash
# Start a consumer to see published events
docker exec cancer-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic image-uploads \
  --from-beginning
```

### Testing Checklist
- [ ] Kafka topic created: `docker exec cancer-kafka kafka-topics --list ...`
- [ ] API Gateway starts without errors: `docker-compose logs api_gateway`
- [ ] Upload file: `curl -F "file=@/tmp/test.txt" http://localhost:3000/upload`
- [ ] Kafka consumer shows event published
- [ ] Event contains: jobId, filename, filesize, timestamp
- [ ] Status updates to "sent-to-queue"

**If ALL pass → Continue to Stage 6**

---

## Stage 6: Image Processor - Consumer Setup
**Goal**: Create Image Processor that consumes upload events from Kafka  
**Estimated**: 2-3 hours  
**Success Criteria**: Image Processor receives and logs upload events

### 6.1 Create Image Processor Main Entry Point
Update `image_processor/main.py`:
```python
import logging
import asyncio
from config.settings import Settings
from infra.kafka_consumer import KafkaConsumer

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(name)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

async def main():
    settings = Settings()
    consumer = KafkaConsumer(settings)
    
    logger.info('Image Processor starting...')
    
    try:
        await consumer.start()
        logger.info('Image Processor running')
        # Keep running
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info('Shutting down...')
    finally:
        await consumer.stop()

if __name__ == '__main__':
    asyncio.run(main())
```

### 6.2 Create Settings Configuration
Create/Update `image_processor/config/settings.py`:
```python
import os

class Settings:
    KAFKA_BROKERS = os.getenv('KAFKA_BROKERS', 'kafka:9092').split(',')
    KAFKA_CONSUMER_GROUP = 'image-processor-group'
    KAFKA_TOPICS = ['image-uploads']
    
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    
    def __init__(self):
        print(f'Settings loaded: Kafka brokers: {self.KAFKA_BROKERS}')
```

### 6.3 Create Kafka Consumer
Create/Update `image_processor/infra/kafka_consumer.py`:
```python
import json
import logging
from confluent_kafka import Consumer, KafkaError, KafkaException

logger = logging.getLogger(__name__)

class KafkaConsumer:
    def __init__(self, settings):
        self.settings = settings
        self.consumer = None
        
    async def start(self):
        conf = {
            'bootstrap.servers': ','.join(self.settings.KAFKA_BROKERS),
            'group.id': self.settings.KAFKA_CONSUMER_GROUP,
            'auto.offset.reset': 'earliest',
            'enable.auto.commit': True,
            'max.poll.interval.ms': 60000
        }
        
        self.consumer = Consumer(conf)
        self.consumer.subscribe(self.settings.KAFKA_TOPICS)
        logger.info(f'Consumer subscribed to topics: {self.settings.KAFKA_TOPICS}')
        
        # Start consuming messages
        while True:
            msg = self.consumer.poll(timeout=1.0)
            
            if msg is None:
                continue
            
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    logger.debug('Reached end of partition')
                else:
                    raise KafkaException(msg.error())
            else:
                await self.handle_message(msg)
    
    async def handle_message(self, msg):
        try:
            event = json.loads(msg.value().decode('utf-8'))
            job_id = event.get('jobId')
            filename = event.get('filename')
            logger.info(f'[EVENT] Received upload: {job_id} - {filename}')
            # TODO: Process image in next stage
        except Exception as e:
            logger.error(f'Error handling message: {e}')
    
    async def stop(self):
        if self.consumer:
            self.consumer.close()
```

### 6.4 Update docker-compose.yml
Add/Update image_processor service:
```yaml
image_processor:
  build: ./image_processor
  container_name: cancer_cells_image_processor
  environment:
    - KAFKA_BROKERS=kafka:9092
    - LOG_LEVEL=INFO
  depends_on:
    - kafka
  networks:
    - cancer_network
```

### Testing Checklist
- [ ] Image Processor container builds: `docker-compose build image_processor`
- [ ] Container starts without errors: `docker-compose up -d image_processor`
- [ ] Consumer connects to Kafka: Check logs `docker-compose logs image_processor`
- [ ] Upload file via API: `curl -F "file=@/tmp/test.txt" http://localhost:3000/upload`
- [ ] Image Processor logs show received event: `docker-compose logs image_processor`
- [ ] Event contains correct jobId and filename

**If ALL pass → Continue to Stage 7**

---

## Stage 7: ML Service - Consumer Setup (Mock Predictions)
**Goal**: Create ML Service that processes images and generates mock predictions  
**Estimated**: 2-3 hours  
**Success Criteria**: ML Service receives images and publishes mock predictions

### 7.1 Create ML Service Main Entry Point
Update `ml_service/main.py`:
```python
import logging
import asyncio
from config.settings import Settings
from infra.kafka_consumer import KafkaConsumer

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(name)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

async def main():
    settings = Settings()
    consumer = KafkaConsumer(settings)
    
    logger.info('ML Service starting...')
    
    try:
        await consumer.start()
        logger.info('ML Service running')
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info('Shutting down...')
    finally:
        await consumer.stop()

if __name__ == '__main__':
    asyncio.run(main())
```

### 7.2 Create ML Service Settings
Update `ml_service/config/settings.py`:
```python
import os

class Settings:
    KAFKA_BROKERS = os.getenv('KAFKA_BROKERS', 'kafka:9092').split(',')
    KAFKA_CONSUMER_GROUP = 'ml-service-group'
    KAFKA_INPUT_TOPICS = ['processed-images']  # Will consume from Image Processor
    KAFKA_OUTPUT_TOPIC = 'ml-predictions'
    
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    
    # Mock model settings
    CONFIDENCE_MIN = 0.5
    CONFIDENCE_MAX = 0.99
```

### 7.3 Create ML Service Kafka Consumer
Create/Update `ml_service/infra/kafka_consumer.py`:
```python
import json
import logging
from confluent_kafka import Consumer, KafkaError, KafkaException
from services.ml_handler import MockMLHandler

logger = logging.getLogger(__name__)

class KafkaConsumer:
    def __init__(self, settings):
        self.settings = settings
        self.consumer = None
        self.ml_handler = MockMLHandler(settings)
        
    async def start(self):
        conf = {
            'bootstrap.servers': ','.join(self.settings.KAFKA_BROKERS),
            'group.id': self.settings.KAFKA_CONSUMER_GROUP,
            'auto.offset.reset': 'earliest',
            'enable.auto.commit': True,
        }
        
        self.consumer = Consumer(conf)
        self.consumer.subscribe(self.settings.KAFKA_INPUT_TOPICS)
        logger.info(f'Consumer subscribed to: {self.settings.KAFKA_INPUT_TOPICS}')
        
        while True:
            msg = self.consumer.poll(timeout=1.0)
            
            if msg is None:
                continue
            
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                else:
                    raise KafkaException(msg.error())
            else:
                await self.handle_message(msg)
    
    async def handle_message(self, msg):
        try:
            event = json.loads(msg.value().decode('utf-8'))
            job_id = event.get('jobId')
            logger.info(f'[ML] Processing job {job_id}')
            
            # Generate mock prediction
            prediction = await self.ml_handler.predict(event)
            
            # Publish result (will implement in next step)
            logger.info(f'[ML] Prediction for {job_id}: {prediction}')
        except Exception as e:
            logger.error(f'Error processing message: {e}')
    
    async def stop(self):
        if self.consumer:
            self.consumer.close()
```

### 7.4 Create Mock ML Handler
Create `ml_service/services/ml_handler.py`:
```python
import logging
import random
from datetime import datetime

logger = logging.getLogger(__name__)

class MockMLHandler:
    def __init__(self, settings):
        self.settings = settings
        logger.info('ML Handler initialized (mock mode)')
    
    async def predict(self, image_event):
        """Generate mock ML prediction"""
        # Simulate prediction with random confidence
        confidence = round(
            random.uniform(self.settings.CONFIDENCE_MIN, self.settings.CONFIDENCE_MAX),
            3
        )
        
        # Randomly decide if cancer detected
        cancer_detected = confidence > 0.7
        
        prediction = {
            'jobId': image_event.get('jobId'),
            'modelName': 'mock-model-v1',
            'confidence': confidence,
            'predicted_class': 'cancer' if cancer_detected else 'normal',
            'timestamp': datetime.now().isoformat(),
            'processing_time_ms': random.randint(100, 500)
        }
        
        return prediction
```

### 7.5 Update docker-compose.yml
Add/Update ml_service:
```yaml
ml_service:
  build: ./ml_service
  container_name: cancer_cells_ml_service
  environment:
    - KAFKA_BROKERS=kafka:9092
    - LOG_LEVEL=INFO
  depends_on:
    - kafka
  networks:
    - cancer_network
```

### Testing Checklist
- [ ] ML Service builds: `docker-compose build ml_service`
- [ ] ML Service starts: `docker-compose up -d ml_service`
- [ ] Consumer subscribes: Check logs `docker-compose logs ml_service`
- [ ] First create processed-images topic: `docker exec cancer-kafka kafka-topics --create --topic processed-images --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1`
- [ ] Upload file: `curl -F "file=@/tmp/test.txt" http://localhost:3000/upload`
- [ ] ML Service logs show prediction generated
- [ ] Prediction includes: jobId, modelName, confidence, predicted_class

**If ALL pass → Continue to Stage 8**

---

## Stage 8: Results Aggregator Setup
**Goal**: Create Result Aggregator that collects predictions and finalizes results  
**Estimated**: 2-3 hours  
**Success Criteria**: Aggregator receives predictions and creates final results

### 8.1 Create Result Aggregator Main Entry Point
Update `result_aggregator/src/index.js`:
```javascript
import Fastify from 'fastify'
import { env } from './config/env.js'
import { resultsRoutes } from './routes/results.js'
import { connectServices, disconnectServices } from './infra/services.js'

const app = Fastify({ logger: true })

app.register(resultsRoutes)

// Health endpoint
app.get('/health', async () => {
  return { status: 'ok', service: 'result-aggregator' }
})

async function start() {
  try {
    await connectServices()
    await app.listen({ host: '0.0.0.0', port: env.PORT })
    console.log(`Result Aggregator listening on port ${env.PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

async function shutdown() {
  console.log('Shutting down gracefully...')
  await disconnectServices()
  await app.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

start()
```

### 8.2 Create Kafka Consumer for Results
Create `result_aggregator/src/infra/kafka.js`:
```javascript
import { Kafka } from 'kafkajs'
import { env } from '../config/env.js'

const kafka = new Kafka({
  clientId: 'result-aggregator',
  brokers: env.KAFKA_BROKERS
})

const consumer = kafka.consumer({ groupId: 'result-aggregator-group' })

export async function connectConsumer() {
  try {
    await consumer.connect()
    await consumer.subscribe({ topic: 'ml-predictions' })
    console.log('[KAFKA] Consumer connected and subscribed to ml-predictions')
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const prediction = JSON.parse(message.value.toString())
          console.log(`[AGGREGATOR] Received prediction: ${JSON.stringify(prediction)}`)
          // TODO: Store and aggregate prediction
        } catch (err) {
          console.error('[AGGREGATOR] Error processing message:', err)
        }
      }
    })
  } catch (err) {
    console.error('[KAFKA] Consumer connection failed:', err)
    throw err
  }
}

export async function disconnectConsumer() {
  try {
    await consumer.disconnect()
    console.log('[KAFKA] Consumer disconnected')
  } catch (err) {
    console.error('[KAFKA] Consumer disconnection failed:', err)
  }
}
```

### 8.3 Create Aggregation Service
Create `result_aggregator/src/services/aggregatorService.js`:
```javascript
// Simple in-memory store for aggregated results
const resultStore = new Map()

export function storeResult(jobId, prediction) {
  const existing = resultStore.get(jobId)
  
  if (!existing) {
    resultStore.set(jobId, {
      jobId,
      predictions: [],
      status: 'aggregating',
      createdAt: new Date().toISOString()
    })
  }
  
  const result = resultStore.get(jobId)
  result.predictions.push(prediction)
  result.updatedAt = new Date().toISOString()
  
  console.log(`[AGGREGATOR] Stored prediction for job ${jobId}, total predictions: ${result.predictions.length}`)
  
  return result
}

export function getResult(jobId) {
  return resultStore.get(jobId)
}

export function finalizeResult(jobId) {
  const result = resultStore.get(jobId)
  if (!result) return null
  
  // Aggregate predictions (simple averaging for now)
  const avgConfidence = result.predictions.reduce((sum, p) => sum + p.confidence, 0) / result.predictions.length
  const cancerCount = result.predictions.filter(p => p.predicted_class === 'cancer').length
  
  result.status = 'completed'
  result.finalPrediction = cancerCount > result.predictions.length / 2 ? 'cancer' : 'normal'
  result.avgConfidence = avgConfidence
  
  return result
}
```

### 8.4 Create Results Route
Create `result_aggregator/src/routes/results.js`:
```javascript
import { getResult, finalizeResult } from '../services/aggregatorService.js'

export async function resultsRoutes(app) {
  app.get('/results/:jobId', async (request, reply) => {
    const { jobId } = request.params
    
    let result = getResult(jobId)
    
    if (!result) {
      return reply.status(404).send({
        error: 'Result not found',
        jobId
      })
    }
    
    // If still aggregating, finalize if possible
    if (result.status === 'aggregating' && result.predictions.length > 0) {
      result = finalizeResult(jobId)
    }
    
    return result
  })
}
```

### 8.5 Create Services Initializer
Create `result_aggregator/src/infra/services.js`:
```javascript
import { connectConsumer, disconnectConsumer } from './kafka.js'

export async function connectServices() {
  await connectConsumer()
}

export async function disconnectServices() {
  await disconnectConsumer()
}
```

### 8.6 Update docker-compose.yml
Add result_aggregator service:
```yaml
result_aggregator:
  build: ./result_aggregator
  container_name: cancer_cells_result_aggregator
  ports:
    - "3001:3001"
  environment:
    - PORT=3001
    - KAFKA_BROKERS=kafka:9092
  depends_on:
    - kafka
  networks:
    - cancer_network
```

### Testing Checklist
- [ ] Result Aggregator builds: `docker-compose build result_aggregator`
- [ ] Service starts: `docker-compose up -d result_aggregator`
- [ ] Health endpoint works: `curl http://localhost:3001/health`
- [ ] Create ml-predictions topic: `docker exec cancer-kafka kafka-topics --create --topic ml-predictions --bootstrap-server localhost:9092`
- [ ] Upload file: `curl -F "file=@/tmp/test.txt" http://localhost:3000/upload`
- [ ] Check results: `curl http://localhost:3001/results/job-xxxxx`
- [ ] Results include: jobId, predictions, finalPrediction, avgConfidence

**If ALL pass → Continue to Stage 9**

---

## Stage 9: End-to-End Flow Test
**Goal**: Test complete flow from upload to final results  
**Estimated**: 1-2 hours  
**Success Criteria**: Entire pipeline works seamlessly

### 9.1 Start All Services
```bash
# Stop all and start fresh
docker-compose down
docker-compose up -d

# Verify all are running
docker-compose ps
```

### 9.2 Monitor All Services
Open 4 terminal windows:

**Terminal 1: API Gateway logs**
```bash
docker-compose logs -f api_gateway
```

**Terminal 2: Image Processor logs**
```bash
docker-compose logs -f image_processor
```

**Terminal 3: ML Service logs**
```bash
docker-compose logs -f ml_service
```

**Terminal 4: Result Aggregator logs**
```bash
docker-compose logs -f result_aggregator
```

### 9.3 Execute End-to-End Test
In a 5th terminal:
```bash
# 1. Check all health endpoints
curl http://localhost:3000/health
curl http://localhost:3001/health

# 2. Upload a file
JOB_ID=$(curl -s -F "file=@/tmp/test.txt" http://localhost:3000/upload | jq -r '.jobId')
echo "Job ID: $JOB_ID"

# 3. Check status (should be sent-to-queue)
curl http://localhost:3000/status/$JOB_ID

# 4. Wait a few seconds
sleep 5

# 5. Check results (should show aggregated prediction)
curl http://localhost:3001/results/$JOB_ID

# 6. Watch logs across all terminals - should see:
#    - API Gateway: file uploaded
#    - Image Processor: received upload event
#    - ML Service: generated prediction
#    - Result Aggregator: received prediction
```

### 9.4 Verify Data Flow
```bash
# Should see in API Gateway logs:
# [UPLOAD] Job job-xxxxx: test.txt (xxx bytes)

# Should see in Image Processor logs:
# [EVENT] Received upload: job-xxxxx - test.txt

# Should see in ML Service logs:
# [ML] Processing job job-xxxxx
# [ML] Prediction for job-xxxxx: {...}

# Should see in Result Aggregator logs:
# [AGGREGATOR] Received prediction: {...}
# [AGGREGATOR] Stored prediction for job job-xxxxx
```

### Testing Checklist
- [ ] All services start without errors
- [ ] All health endpoints return 200
- [ ] File upload succeeds and returns jobId
- [ ] API Gateway logs show upload
- [ ] Image Processor logs show received event
- [ ] ML Service logs show generated prediction
- [ ] Result Aggregator logs show received prediction
- [ ] Query results returns complete data with finalPrediction
- [ ] Entire flow takes < 10 seconds

**If ALL pass → Continue to Stage 10**

---

## Stage 10: Add Real Database Integration
**Goal**: Move from in-memory to persistent PostgreSQL storage  
**Estimated**: 3-4 hours  
**Success Criteria**: All data persists in PostgreSQL

### 10.1 Add PostgreSQL Client to API Gateway
Update `api_gateway/package.json`:
```json
{
  "dependencies": {
    "pg": "^8.11.3"
  }
}
```

Run: `npm install` in api_gateway directory

### 10.2 Create PostgreSQL Connection Module
Create `api_gateway/src/infra/postgres.js`:
```javascript
import pg from 'pg'
import { env } from '../config/env.js'

const pool = new pg.Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  database: env.POSTGRES_DB,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD
})

export async function queryDB(sql, values = []) {
  const client = await pool.connect()
  try {
    return await client.query(sql, values)
  } finally {
    client.release()
  }
}

export async function healthCheck() {
  try {
    const result = await queryDB('SELECT 1')
    return result.rowCount > 0
  } catch (err) {
    console.error('[DB] Health check failed:', err)
    return false
  }
}
```

### 10.3 Update Job Service to Use PostgreSQL
Update `api_gateway/src/services/jobService.js`:
```javascript
import { queryDB } from '../infra/postgres.js'

export async function createJob(filename, filesize) {
  const jobId = generateJobId()
  
  const result = await queryDB(
    'INSERT INTO jobs (id, filename, filesize, status, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
    [jobId, filename, filesize, 'received']
  )
  
  console.log(`[DB] Created job ${jobId}`)
  return jobId
}

export async function getJob(jobId) {
  const result = await queryDB(
    'SELECT * FROM jobs WHERE id = $1',
    [jobId]
  )
  
  return result.rows[0] || null
}

export async function updateJobStatus(jobId, status, details = {}) {
  const result = await queryDB(
    'UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, jobId]
  )
  
  return result.rows[0] || null
}

function generateJobId() {
  return 'job-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
}
```

### 10.4 Update Environment Configuration
Update `api_gateway/src/config/env.js`:
```javascript
export const env = {
  PORT: process.env.PORT || 3000,
  KAFKA_BROKERS: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
  REDIS_URL: process.env.REDIS_URL || 'redis://redis:6379',
  
  // PostgreSQL settings
  POSTGRES_HOST: process.env.POSTGRES_HOST || 'postgres',
  POSTGRES_PORT: process.env.POSTGRES_PORT || 5432,
  POSTGRES_DB: process.env.POSTGRES_DB || 'cancer_cells_db',
  POSTGRES_USER: process.env.POSTGRES_USER || 'postgres',
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || 'postgres'
}
```

### 10.5 Add Database Health Check
Update `api_gateway/src/index.js`:
```javascript
import { healthCheck as dbHealthCheck } from './infra/postgres.js'

// In health endpoint:
app.get('/health', async () => {
  const dbOk = await dbHealthCheck()
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'disconnected'
  }
})
```

### 10.6 Update Result Aggregator to Use PostgreSQL
Follow same pattern:
- Add `pg` to package.json
- Create postgres.js module
- Update aggregatorService.js to store results in DB
- Store predictions with: `INSERT INTO predictions (job_id, model_name, confidence, predicted_class) ...`

### Testing Checklist
- [ ] API Gateway starts: `docker-compose up -d api_gateway`
- [ ] Health endpoint shows database: connected
- [ ] Upload file: `curl -F "file=@/tmp/test.txt" http://localhost:3000/upload`
- [ ] Query database: `docker exec cancer-postgres psql -U admin -d cancer_cells -c "SELECT * FROM jobs"`
- [ ] Job record exists with status
- [ ] Run end-to-end flow again
- [ ] Query PostgreSQL for results: `docker exec cancer-postgres psql -U admin -d cancer_cells -c "SELECT * FROM predictions;"`
- [ ] Data persists after container restart: `docker-compose restart`

**If ALL pass → Continue to Stage 11**

---

## Stage 11: Add Redis Caching
**Goal**: Implement Redis for fast status and result lookups  
**Estimated**: 2-3 hours  
**Success Criteria**: Cache hits reduce database queries

### 11.1 Create Redis Module
Create `api_gateway/src/infra/redis.js`:
```javascript
import Redis from 'ioredis'
import { env } from '../config/env.js'

export const redis = new Redis(env.REDIS_URL)

redis.on('connect', () => {
  console.log('[REDIS] Connected')
})

redis.on('error', (err) => {
  console.error('[REDIS] Error:', err)
})

export async function cacheJob(jobId, job, ttl = 3600) {
  await redis.setex(`job:${jobId}`, ttl, JSON.stringify(job))
}

export async function getCachedJob(jobId) {
  const cached = await redis.get(`job:${jobId}`)
  return cached ? JSON.parse(cached) : null
}

export async function invalidateJob(jobId) {
  await redis.del(`job:${jobId}`)
}
```

### 11.2 Update Job Service to Use Cache
Update `api_gateway/src/services/jobService.js`:
```javascript
import { cacheJob, getCachedJob, invalidateJob } from '../infra/redis.js'

export async function getJob(jobId) {
  // Try cache first
  let job = await getCachedJob(jobId)
  if (job) {
    console.log(`[CACHE HIT] Job ${jobId}`)
    return job
  }
  
  // Fallback to database
  const result = await queryDB('SELECT * FROM jobs WHERE id = $1', [jobId])
  job = result.rows[0] || null
  
  if (job) {
    await cacheJob(jobId, job)
    console.log(`[CACHE MISS] Job ${jobId} loaded from DB`)
  }
  
  return job
}

export async function updateJobStatus(jobId, status) {
  const result = await queryDB(
    'UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [status, jobId]
  )
  
  const job = result.rows[0]
  
  // Update cache
  await invalidateJob(jobId)
  await cacheJob(jobId, job)
  
  return job
}
```

### Testing Checklist
- [ ] Redis starts: `docker-compose logs redis`
- [ ] Upload file and query status multiple times
- [ ] First query shows [CACHE MISS], subsequent show [CACHE HIT]
- [ ] Query database directly and verify consistency
- [ ] Status updates invalidate cache
- [ ] Performance improves for cached queries

**If ALL pass → Continue to Stage 12**

---

## Stage 12: Error Handling & Resilience
**Goal**: Add comprehensive error handling and retry logic  
**Estimated**: 3-4 hours  
**Success Criteria**: Services recover gracefully from failures

### 12.1 Add Kafka Retry Logic
Update `api_gateway/src/infra/kafka.js`:
```javascript
export async function publishUploadEvent(jobId, filename, filesize) {
  const maxRetries = 3
  const retryDelayMs = 1000
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await producer.send({
        topic: 'image-uploads',
        messages: [{
          key: jobId,
          value: JSON.stringify({
            jobId, filename, filesize,
            timestamp: new Date().toISOString()
          })
        }]
      })
      console.log(`[KAFKA] Published event for job ${jobId} (attempt ${attempt})`)
      return
    } catch (err) {
      console.error(`[KAFKA] Error publishing (attempt ${attempt}/${maxRetries}):`, err)
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt))
      } else {
        throw new Error(`Failed to publish event after ${maxRetries} attempts`)
      }
    }
  }
}
```

### 12.2 Add Database Connection Resilience
Update `api_gateway/src/infra/postgres.js`:
```javascript
const pool = new pg.Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  database: env.POSTGRES_DB,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 10000
})

pool.on('error', (err, client) => {
  console.error('[DB] Unexpected pool error:', err)
})

export async function queryDB(sql, values = [], retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect()
      try {
        return await client.query(sql, values)
      } finally {
        client.release()
      }
    } catch (err) {
      console.error(`[DB] Query error (attempt ${attempt}/${retries}):`, err)
      
      if (attempt >= retries) throw err
      
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
}
```

### 12.3 Add Input Validation
Update `api_gateway/src/routes/upload.js`:
```javascript
function validateFile(buffer, mimetype) {
  const errors = []
  
  const MAX_FILE_SIZE = 10 * 1024 * 1024
  if (buffer.length > MAX_FILE_SIZE) {
    errors.push(`File too large (${buffer.length} > ${MAX_FILE_SIZE})`)
  }
  
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/tiff']
  if (!ALLOWED_TYPES.includes(mimetype)) {
    errors.push(`Invalid type: ${mimetype}`)
  }
  
  // Check file magic bytes for image
  const pngMagic = buffer.slice(0, 8).toString('hex').startsWith('89504e47')
  const jpegMagic = buffer.slice(0, 2).toString('hex') === 'ffd8'
  
  if (!pngMagic && !jpegMagic && buffer.length > 0) {
    // Simple validation - could be tiff
    console.warn('Warning: Could not verify image magic bytes')
  }
  
  return errors
}

// In upload handler:
const validationErrors = validateFile(buffer, data.mimetype)
if (validationErrors.length > 0) {
  return reply.status(400).send({
    error: 'Validation failed',
    details: validationErrors
  })
}
```

### Testing Checklist
- [ ] Stop Kafka and try upload → Should retry and fail gracefully
- [ ] Stop PostgreSQL and try upload → Should retry and show error
- [ ] Stop PostgreSQL then restart → Should recover connection
- [ ] Upload invalid file type → 400 with validation error
- [ ] Upload oversized file → 413 with file size error
- [ ] Upload corrupted file → 400 with validation error
- [ ] Upload valid file → Should succeed

**If ALL pass → Continue to Stage 13**

---

## Stage 13: Integration & Performance Testing
**Goal**: Test complete system under load and identify bottlenecks  
**Estimated**: 2-3 hours  
**Success Criteria**: System handles multiple concurrent uploads

### 13.1 Create Load Test Script
Create `test/load-test.sh`:
```bash
#!/bin/bash

API_URL="http://localhost:3000"
AGGREGATOR_URL="http://localhost:3001"
NUM_FILES=10
CONCURRENT=3

# Create test files
for i in {1..5}; do
  dd if=/dev/urandom of=/tmp/test-$i.bin bs=1M count=1 2>/dev/null
done

echo "Starting load test with $NUM_FILES uploads, $CONCURRENT concurrent..."

# Upload files
count=0
for i in {1..NUM_FILES}; do
  file_num=$((($i - 1) % 5 + 1))
  
  (
    echo "Uploading file $i..."
    RESPONSE=$(curl -s -F "file=@/tmp/test-$file_num.bin" "$API_URL/upload")
    JOB_ID=$(echo $RESPONSE | jq -r '.jobId')
    
    echo "Job $i: $JOB_ID"
    
    # Poll for result
    for attempt in {1..30}; do
      RESULT=$(curl -s "$AGGREGATOR_URL/results/$JOB_ID")
      STATUS=$(echo $RESULT | jq -r '.status // "pending"')
      
      if [ "$STATUS" == "completed" ]; then
        echo "Job $i completed: $RESULT"
        break
      fi
      
      sleep 1
    done
  ) &
  
  # Limit concurrent jobs
  count=$((count + 1))
  if [ $count -ge $CONCURRENT ]; then
    wait -n
    count=$((count - 1))
  fi
done

# Wait for all jobs
wait

echo "Load test completed!"
```

### 13.2 Monitor Performance
```bash
# In separate terminals:

# 1. Monitor Kafka topics
watch 'docker exec cancer-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group image-processor-group \
  --describe'

# 2. Monitor PostgreSQL connections
watch 'docker exec cancer-postgres psql -U admin -d cancer_cells -c \
  "SELECT count(*) as connections FROM pg_stat_activity;"'

# 3. Monitor Docker stats
docker stats

# 4. Check database size
docker exec cancer-postgres du -sh /var/lib/postgresql/data
```

### 13.3 Performance Benchmarks
Run tests and record:
```bash
# Baseline - single upload to final result
time curl -F "file=@/tmp/test.txt" http://localhost:3000/upload

# Check result timing
time curl http://localhost:3001/results/job-xxxxx

# Run load test
bash test/load-test.sh
```

### Testing Checklist
- [ ] 10 concurrent uploads complete successfully
- [ ] No dropped messages in Kafka
- [ ] All results are persisted in database
- [ ] Response times < 1 second for cached queries
- [ ] Average end-to-end time documented
- [ ] Peak database connections monitored
- [ ] No memory leaks detected

**If ALL pass → Continue to Stage 14**

---

## Stage 14: Real ML Model Integration (Optional)
**Goal**: Replace mock predictions with actual ML model  
**Estimated**: Variable based on model  
**Success Criteria**: System uses real trained model

### 14.1 Create Model Loading Service
```python
# ml_service/services/ml_handler.py

import os
import numpy as np
from PIL import Image

class MLHandler:
    def __init__(self, settings):
        self.settings = settings
        self.model = self.load_model()
    
    def load_model(self):
        model_path = os.getenv('MODEL_PATH', 'models/cancer_detector.h5')
        
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model not found at {model_path}")
        
        # Load your actual model here
        # Example: from tensorflow import keras
        # model = keras.models.load_model(model_path)
        # return model
        
        print(f'[ML] Loaded model from {model_path}')
        return None  # Replace with actual model
    
    async def predict(self, image_path):
        # Load image
        img = Image.open(image_path)
        # Preprocess
        img = img.resize((256, 256))
        img_array = np.array(img) / 255.0
        
        # Run model
        # prediction = self.model.predict(np.expand_dims(img_array, 0))
        
        return {
            'confidence': 0.87,
            'predicted_class': 'cancer',
            'processing_time_ms': 150
        }
```

### 14.2 Update Consumer to Download Images
```python
# ml_service/infra/kafka_consumer.py

async def handle_message(self, msg):
    event = json.loads(msg.value().decode('utf-8'))
    
    # Download image from OCI storage
    image_path = await self.download_image(event['image_path'])
    
    # Run ML inference
    prediction = await self.ml_handler.predict(image_path)
    
    # Publish result
    await self.publish_prediction(prediction)
```

### Testing Checklist
- [ ] Model loads successfully
- [ ] Model file size reasonable (< 500MB)
- [ ] Prediction runs in < 5 seconds
- [ ] Confidence scores make sense
- [ ] Results consistent across multiple predictions on same image

---

## Stage 15: Deployment Preparation
**Goal**: Prepare system for production deployment  
**Estimated**: 2-3 hours  
**Success Criteria**: System ready for deployment

### 15.1 Create Production docker-compose.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: cancer_cells_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - cancer_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    networks:
      - cancer_network
    restart: unless-stopped
    depends_on:
      - zookeeper

  redis:
    image: redis:7-alpine
    networks:
      - cancer_network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ... other services with restart policies

volumes:
  postgres_data:

networks:
  cancer_network:
    driver: bridge
```

### 15.2 Create Environment Template
Create `.env.production`:
```bash
# Database
POSTGRES_PASSWORD=secure_password_here
POSTGRES_DB=cancer_cells_db

# Kafka
KAFKA_BROKERS=kafka:9092

# Redis
REDIS_URL=redis://redis:6379

# API Gateway
PORT=3000
LOG_LEVEL=info

# ML Service
MODEL_PATH=/models/cancer_detector.h5
```

### 15.3 Add Health Checks to All Services
Ensure all services have `/health` endpoints and liveness probes

### 15.4 Create Backup Strategy
```bash
# Backup PostgreSQL daily
0 2 * * * docker exec cancer_cells_postgres pg_dump -U postgres cancer_cells_db | gzip > /backups/db-$(date +\%Y\%m\%d).sql.gz
```

### Testing Checklist
- [ ] All services have restart policies
- [ ] All services have health checks
- [ ] Environment variables are externalized
- [ ] Logs are formatted consistently
- [ ] Error rates are logged and monitored
- [ ] Backup strategy tested

---

## Testing Workflow Summary

### Quick Verification at Each Stage
```bash
# General checks
docker-compose ps                    # All healthy?
docker-compose logs --tail=50        # Any errors?

# API tests
curl http://localhost:3000/health    # API Gateway up?
curl http://localhost:3001/health    # Aggregator up?

# Database
docker exec cancer-postgres psql -U admin -d cancer_cells -c "SELECT count(*) FROM jobs;"

# Kafka
docker exec cancer-kafka kafka-topics --list --bootstrap-server localhost:9092
```

### When Something Breaks
1. Check logs: `docker compose logs SERVICE_NAME`
2. Verify network: `docker exec SERVICE_1 ping SERVICE_2`
3. Check ports: `netstat -tulpn | grep LISTEN`
4. Restart service: `docker compose restart SERVICE_NAME`
5. Clear and rebuild: `docker compose down && docker compose up -d`

---

## Next Steps After All Stages Complete

1. **Add Authentication**: Implement JWT token-based auth
2. **Add File Storage**: Integrate OCI Object Storage
3. **Monitoring**: Add Prometheus + Grafana
4. **CI/CD**: Set up automated testing and deployment
5. **Documentation**: Generate API docs (Swagger/OpenAPI)
6. **Performance**: Profile and optimize hotspots
7. **Security**: Security audit and hardening
8. **Scaling**: Add load balancing and horizontal scaling

---

**Good luck! Go stage by stage, test at each step, and build confidence in the system.** 🚀
