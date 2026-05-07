# Agent Prompt — cancer_cells Microservices Scaffold

## Your Role

You are a **scaffolding agent**, not an implementation agent.
Your job is to create the full project structure with real boilerplate and clearly marked
`// TODO` blocks where the human developer will write the actual logic.

You do NOT implement business logic yourself.
You do NOT put everything in one file.
Every service must be broken into focused, single-responsibility modules.

---

## Project Overview

Build a scaffold for a medical image analysis backend called `cancer_cells`.
It uses an **event-driven microservices architecture** with Kafka as the message broker.

When a user uploads an image:
1. The API Gateway accepts it, stores it in Oracle Object Storage, creates a job in Redis,
   and publishes an event to Kafka.
2. The ML Service and Image Processor both consume that event in parallel (fan-out pattern).
3. The ML Service runs inference and publishes its result back to Kafka.
4. The Image Processor generates 7 processed image variants, uploads them to OCI,
   and publishes its result back to Kafka.
5. The Result Aggregator listens for both results, merges them in Redis,
   marks the job complete, and persists to PostgreSQL.

**No chatbot service. No frontend. Backend only.**

---

## Tech Stack — strictly enforced

| Service            | Language   | Key packages                                              |
|--------------------|------------|-----------------------------------------------------------|
| `api_gateway`      | Node.js    | fastify, @fastify/multipart, kafkajs, ioredis, @aws-sdk/client-s3 |
| `ml_service`       | Python     | confluent-kafka, oci, (ML lib TBD by developer)           |
| `image_processor`  | Python     | confluent-kafka, oci, opencv-python, Pillow               |
| `result_aggregator`| Node.js    | kafkajs, ioredis, pg                                      |
| Infra              | Docker     | Kafka, Zookeeper, Redis, PostgreSQL                       |
| Object Storage     | Remote     | Oracle OCI (S3-compatible endpoint, no MinIO container)   |

**Do not deviate from this stack.**
Do not add extra dependencies not listed here without a comment explaining why.

---

## Modular Architecture Rules — read carefully before writing any file

These rules are non-negotiable:

1. **One responsibility per file.** A file that handles HTTP routing must not also
   touch Kafka or Redis directly. Route handler → calls service function → service
   calls infrastructure module.

2. **Infrastructure is always isolated.** Kafka producer/consumer, Redis client,
   PostgreSQL pool, and OCI client each live in their own file under an `infra/` or
   `config/` folder. They export a single configured instance or factory function.

3. **No inline configuration.** No hardcoded ports, bucket names, topic names, or
   credentials anywhere in source files. Everything comes from `process.env` (Node)
   or `os.environ` (Python), loaded once in a config module.

4. **Routes only route.** In Node.js services, route files call service-layer
   functions and return responses. They do not contain business logic.

5. **Services only orchestrate.** Service-layer functions coordinate between
   infrastructure modules. They do not contain raw SDK calls.

6. **Consumers only consume.** Kafka consumer setup is separate from the handler
   logic that processes each message.

---

## TODO Block Format

Every block of code the developer must implement follows this exact format:

```
// TODO [N]: <one-line description of what to implement>
//
// What:  <what this block must do>
// Hint:  <specific API, method, or pattern to use>
// Input: <what variables are available>
// Output: <what this block must produce or return>
//
// Your code here ↓
```

For Python, use `#` instead of `//`.
Number TODOs sequentially within each file, starting at 1.
A developer must be able to implement each TODO without reading any other file.

---

## Folder Structure to Create

Create every file listed below. Where the file is marked [scaffold], write real
boilerplate with TODO blocks. Where marked [full], write the complete implementation —
the developer will not touch these.

```
cancer_cells/
│
├── docker-compose.yml                   [full]
├── .env.example                         [full]
├── .gitignore                           [full]
│
├── api_gateway/
│   ├── package.json                     [full]
│   ├── Dockerfile                       [full]
│   └── src/
│       ├── index.js                     [full]   ← server bootstrap only
│       ├── config/
│       │   └── env.js                   [full]   ← loads + validates all env vars
│       ├── infra/
│       │   ├── kafka.js                 [full]   ← KafkaJS producer instance
│       │   ├── redis.js                 [full]   ← ioredis client instance
│       │   └── oci.js                   [scaffold] ← TODO: OCI S3 upload function
│       ├── routes/
│       │   ├── upload.js                [scaffold] ← TODO: multipart + orchestration
│       │   └── status.js                [full]   ← Redis reads, no TODOs
│       └── services/
│           └── jobService.js            [scaffold] ← TODO: createJob, getJob logic
│
├── ml_service/
│   ├── requirements.txt                 [full]
│   ├── Dockerfile                       [full]
│   ├── main.py                          [full]   ← entry point, wires everything
│   ├── config/
│   │   └── settings.py                  [full]   ← env vars only
│   ├── infra/
│   │   ├── kafka_consumer.py            [full]   ← consumer setup + loop
│   │   ├── kafka_producer.py            [full]   ← producer setup + publish fn
│   │   └── oci_client.py                [scaffold] ← TODO: download image from OCI
│   └── services/
│       └── ml_handler.py                [scaffold] ← TODO: load model, run inference
│
├── image_processor/
│   ├── requirements.txt                 [full]
│   ├── Dockerfile                       [full]
│   ├── main.py                          [full]   ← entry point, wires everything
│   ├── config/
│   │   └── settings.py                  [full]   ← env vars only
│   ├── infra/
│   │   ├── kafka_consumer.py            [full]   ← consumer setup + loop
│   │   ├── kafka_producer.py            [full]   ← producer setup + publish fn
│   │   └── oci_client.py                [scaffold] ← TODO: download + upload to OCI
│   └── services/
│       ├── processor.py                 [scaffold] ← TODO: 7 variant generators
│       └── parallel_upload.py           [full]   ← ThreadPoolExecutor upload logic
│
└── result_aggregator/
    ├── package.json                     [full]
    ├── Dockerfile                       [full]
    └── src/
        ├── index.js                     [full]   ← entry point, wires everything
        ├── config/
        │   └── env.js                   [full]   ← loads + validates all env vars
        ├── infra/
        │   ├── kafka.js                 [full]   ← KafkaJS consumer instance
        │   ├── redis.js                 [full]   ← ioredis client instance
        │   └── db.js                    [full]   ← pg Pool instance
        └── services/
            ├── aggregator.js            [scaffold] ← TODO: merge logic, status update
            └── persist.js               [scaffold] ← TODO: PostgreSQL insert
```

---

## Detailed File Specifications

### docker-compose.yml [full]

Include these services with health checks:
- `zookeeper` — confluentinc/cp-zookeeper:7.5.0
- `kafka` — confluentinc/cp-kafka:7.5.0, depends_on zookeeper, KAFKA_AUTO_CREATE_TOPICS_ENABLE=true
- `redis` — redis:7-alpine, with persistence volume
- `postgres` — postgres:16-alpine, with init volume for schema
- `api_gateway` — builds from ./api_gateway, depends on kafka + redis
- `ml_service` — builds from ./ml_service, depends on kafka
- `image_processor` — builds from ./image_processor, depends on kafka
- `result_aggregator` — builds from ./result_aggregator, depends on kafka + redis + postgres

All services read from a shared `.env` file via `env_file: .env`.
Use a `cancer_net` bridge network for all services.
No MinIO container. Oracle OCI is a remote service, no local container needed.

---

### .env.example [full]

```
# Kafka
KAFKA_BROKER=kafka:9092
KAFKA_TOPIC_IMAGE_UPLOADS=image_uploads
KAFKA_TOPIC_ML_RESULT=ml_result_ready
KAFKA_TOPIC_IMAGE_DONE=image_processing_done
KAFKA_GROUP_ML=ml-service-group
KAFKA_GROUP_IMAGE=image-processor-group
KAFKA_GROUP_AGGREGATOR=aggregator-group

# Redis
REDIS_URL=redis://redis:6379

# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=cancer_cells
POSTGRES_USER=admin
POSTGRES_PASSWORD=changeme

# Oracle OCI (S3-compatible)
OCI_ENDPOINT=https://<namespace>.compat.objectstorage.<region>.oraclecloud.com
OCI_BUCKET=cancer-cells-images
OCI_ACCESS_KEY=
OCI_SECRET_KEY=
OCI_REGION=ap-mumbai-1

# API Gateway
PORT=3000
```

---

### api_gateway/src/infra/oci.js [scaffold]

```js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { env } from '../config/env.js'

const s3 = new S3Client({
  endpoint: env.OCI_ENDPOINT,
  region: env.OCI_REGION,
  credentials: {
    accessKeyId: env.OCI_ACCESS_KEY,
    secretAccessKey: env.OCI_SECRET_KEY,
  },
  forcePathStyle: true,
})

/**
 * Uploads a file buffer to Oracle Object Storage.
 * @param {Buffer} buffer - The raw file bytes
 * @param {string} filename - Original filename, used to build the object key
 * @param {string} mimetype - MIME type of the file (e.g. image/jpeg)
 * @returns {Promise<string>} object_key - The path of the uploaded file inside the bucket
 */
export async function uploadToOCI(buffer, filename, mimetype) {
  // TODO [1]: Build the object key
  //
  // What:  Create a unique storage path for this file to avoid name collisions.
  //        Pattern: uploads/<timestamp>-<filename>  e.g. "uploads/1714900000000-scan.jpg"
  // Hint:  Use Date.now() for the timestamp prefix
  // Input: filename (string)
  // Output: object_key (string)
  //
  // Your code here ↓

  // TODO [2]: Upload the buffer to OCI using PutObjectCommand
  //
  // What:  Send the file to Oracle Object Storage using the S3-compatible client.
  // Hint:  new PutObjectCommand({ Bucket, Key, Body, ContentType })
  //        then await s3.send(command)
  // Input: s3 client, env.OCI_BUCKET, object_key, buffer, mimetype
  // Output: none (throw on failure)
  //
  // Your code here ↓

  // TODO [3]: Return the object_key
  //
  // What:  The caller (jobService.js) needs this key to store in Redis
  //        and to publish to Kafka so downstream services can download the file.
  // Output: object_key (string)
  //
  // Your code here ↓
}
```

---

### api_gateway/src/routes/upload.js [scaffold]

```js
import { createJob, buildJobKey } from '../services/jobService.js'
import { publishEvent } from '../infra/kafka.js'
import { env } from '../config/env.js'

export async function uploadRoutes(fastify) {
  fastify.post('/api/upload', async (req, reply) => {

    // TODO [1]: Parse the multipart file upload
    //
    // What:  Extract the uploaded image from the request.
    // Hint:  const data = await req.file()
    //        const buffer = await data.toBuffer()
    //        also extract data.filename and data.mimetype
    // Input: req (Fastify request with multipart plugin registered)
    // Output: { buffer, filename, mimetype }
    //
    // Your code here ↓

    // TODO [2]: Upload image to Oracle OCI
    //
    // What:  Store the raw image bytes in OCI before doing anything else.
    //        Downstream services will download from this location.
    // Hint:  import { uploadToOCI } from '../infra/oci.js'
    //        const object_key = await uploadToOCI(buffer, filename, mimetype)
    // Input: buffer, filename, mimetype
    // Output: object_key (string)
    //
    // Your code here ↓

    // TODO [3]: Create a job record in Redis
    //
    // What:  Call createJob() from jobService.js.
    //        It returns a job_id and stores the initial job hash in Redis.
    // Hint:  const { job_id } = await createJob(object_key, filename)
    // Input: object_key, filename
    // Output: job_id (string, UUID)
    //
    // Your code here ↓

    // TODO [4]: Publish the ImageUploaded event to Kafka
    //
    // What:  Notify both ml_service and image_processor that a new image is ready.
    //        Both services subscribe to the same topic — this is the fan-out.
    // Hint:  await publishEvent(env.KAFKA_TOPIC_IMAGE_UPLOADS, { job_id, object_key, filename })
    // Input: env.KAFKA_TOPIC_IMAGE_UPLOADS, job_id, object_key, filename
    // Output: none
    //
    // Your code here ↓

    return reply.code(202).send({ job_id, status: 'queued' })
  })
}
```

---

### api_gateway/src/services/jobService.js [scaffold]

```js
import { randomUUID } from 'crypto'
import { redis } from '../infra/redis.js'

export function buildJobKey(job_id) {
  return `job:${job_id}`
}

/**
 * Creates a new job entry in Redis.
 * @param {string} object_key - OCI object key of the uploaded image
 * @param {string} filename - Original filename
 * @returns {Promise<{ job_id: string }>}
 */
export async function createJob(object_key, filename) {
  // TODO [1]: Generate a unique job ID
  //
  // What:  Create a UUID v4 string that identifies this processing job.
  // Hint:  randomUUID() from 'crypto' (already imported)
  // Output: job_id (string)
  //
  // Your code here ↓

  // TODO [2]: Store the job hash in Redis
  //
  // What:  Create a Redis hash at key "job:<job_id>" with these fields:
  //        status       → "queued"
  //        object_key   → the OCI path
  //        filename     → original filename
  //        ml_done      → "false"
  //        image_done   → "false"
  //        created_at   → ISO timestamp string
  // Hint:  await redis.hSet(buildJobKey(job_id), { ... })
  //        Redis hSet does not accept booleans — store as strings "true"/"false"
  // Input: job_id, object_key, filename
  // Output: none (throw on failure)
  //
  // Your code here ↓

  return { job_id }
}

/**
 * Retrieves job status from Redis.
 * Used by the status route — already implemented, no TODOs here.
 */
export async function getJob(job_id) {
  const data = await redis.hGetAll(buildJobKey(job_id))
  if (!data || Object.keys(data).length === 0) return null
  return data
}
```

---

### ml_service/infra/oci_client.py [scaffold]

```python
import boto3
from botocore.config import Config
from config.settings import settings

s3 = boto3.client(
    's3',
    endpoint_url=settings.OCI_ENDPOINT,
    aws_access_key_id=settings.OCI_ACCESS_KEY,
    aws_secret_access_key=settings.OCI_SECRET_KEY,
    region_name=settings.OCI_REGION,
    config=Config(signature_version='s3v4'),
)

def download_image(object_key: str) -> bytes:
    """
    Downloads an image from Oracle OCI and returns it as raw bytes.

    Args:
        object_key: The path of the object inside the bucket (e.g. "uploads/123-scan.jpg")

    Returns:
        bytes: Raw image bytes ready for inference
    """
    # TODO [1]: Download the object from OCI
    #
    # What:  Fetch the file stored at object_key from the configured OCI bucket.
    # Hint:  response = s3.get_object(Bucket=settings.OCI_BUCKET, Key=object_key)
    #        then read: response['Body'].read()
    # Input: s3 client, settings.OCI_BUCKET, object_key
    # Output: bytes (raw image data)
    #
    # Your code here ↓
    pass
```

---

### ml_service/services/ml_handler.py [scaffold]

```python
# TODO [1]: Import your ML framework here
#
# What:  Import whatever library your model uses.
# Hint:  e.g. import torch, from tensorflow import keras, import pickle, etc.
# Note:  Add the package to requirements.txt before importing.
#
# Your import here ↓

from infra.oci_client import download_image
from infra.kafka_producer import publish_event
from config.settings import settings
import numpy as np

# TODO [2]: Load your model at module level (runs once on startup)
#
# What:  Load the trained model file into memory.
#        This must happen outside the handler function so it loads only once.
# Hint:  MODEL_PATH comes from settings (add MODEL_PATH to settings.py and .env.example)
#        e.g. model = torch.load(settings.MODEL_PATH)
#           or model = pickle.load(open(settings.MODEL_PATH, 'rb'))
# Output: module-level `model` variable
#
# Your code here ↓
model = None  # replace this


def preprocess(image_bytes: bytes) -> np.ndarray:
    # TODO [3]: Convert raw image bytes into the input format your model expects
    #
    # What:  Decode and preprocess the image bytes into a numpy array or tensor.
    # Hint:  Use cv2.imdecode or PIL.Image.open with io.BytesIO
    #        Then resize, normalize, add batch dim as needed by your model.
    # Input: image_bytes (bytes)
    # Output: preprocessed array/tensor ready for model.predict() or model()
    #
    # Your code here ↓
    pass


def run_inference(preprocessed_input) -> tuple[str, float]:
    # TODO [4]: Run your model and return prediction + confidence score
    #
    # What:  Pass the preprocessed input through the model.
    #        Return a string label and a float confidence between 0.0 and 1.0.
    # Hint:  output = model(preprocessed_input)  or  model.predict(...)
    #        Apply softmax/sigmoid if needed, then argmax for class label.
    # Input: preprocessed_input (whatever preprocess() returned)
    # Output: (prediction: str, confidence: float)  e.g. ("malignant", 0.94)
    #
    # Your code here ↓
    pass


async def handle_image_uploaded(event: dict):
    """
    Called by the Kafka consumer for each ImageUploaded event.
    Orchestrates download → preprocess → inference → publish.
    This function is fully wired — do not modify it once your TODOs above are done.
    """
    job_id = event['job_id']
    object_key = event['object_key']

    image_bytes = download_image(object_key)
    preprocessed = preprocess(image_bytes)
    prediction, confidence = run_inference(preprocessed)

    await publish_event(settings.KAFKA_TOPIC_ML_RESULT, {
        'job_id': job_id,
        'prediction': prediction,
        'confidence': confidence,
    })
```

---

### image_processor/services/processor.py [scaffold]

```python
import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import io

def to_bytes(image_array: np.ndarray, ext: str = '.jpg') -> bytes:
    """Converts a numpy array back to image bytes. Already implemented."""
    _, buffer = cv2.imencode(ext, image_array)
    return buffer.tobytes()

def decode(image_bytes: bytes) -> np.ndarray:
    """Decodes raw bytes into a numpy array. Already implemented."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)


# Each function below takes raw image_bytes and returns processed image_bytes.
# Use decode() to get the numpy array. Use to_bytes() to return bytes.
# One variant = one function. Keep them pure — no side effects.

def grayscale(image_bytes: bytes) -> bytes:
    """Example variant — already implemented. Use this as a reference."""
    img = decode(image_bytes)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray_3ch = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    return to_bytes(gray_3ch)

def enhanced_contrast(image_bytes: bytes) -> bytes:
    # TODO [1]: Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
    #
    # What:  Enhance local contrast in the image — useful for medical scans.
    # Hint:  clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    #        Apply to the L channel after converting BGR → LAB
    # Input: image_bytes (bytes)
    # Output: processed image as bytes
    #
    # Your code here ↓
    pass

def edge_detection(image_bytes: bytes) -> bytes:
    # TODO [2]: Apply Canny edge detection
    #
    # What:  Highlight structural edges in the image.
    # Hint:  cv2.Canny(gray_image, threshold1=100, threshold2=200)
    #        Convert back to 3-channel before returning.
    # Input: image_bytes (bytes)
    # Output: processed image as bytes
    #
    # Your code here ↓
    pass

def gaussian_blur(image_bytes: bytes) -> bytes:
    # TODO [3]: Apply Gaussian blur
    #
    # What:  Smooth the image to reduce noise.
    # Hint:  cv2.GaussianBlur(img, (15, 15), 0)
    # Input: image_bytes (bytes)
    # Output: processed image as bytes
    #
    # Your code here ↓
    pass

def histogram_equalization(image_bytes: bytes) -> bytes:
    # TODO [4]: Apply global histogram equalization
    #
    # What:  Normalize the overall brightness distribution.
    # Hint:  Convert to YUV, equalize the Y channel, convert back.
    #        cv2.equalizeHist() works on single-channel images.
    # Input: image_bytes (bytes)
    # Output: processed image as bytes
    #
    # Your code here ↓
    pass

def red_channel(image_bytes: bytes) -> bytes:
    # TODO [5]: Isolate the red channel
    #
    # What:  Zero out the green and blue channels, keep only red.
    # Hint:  img[:, :, 0] = 0  (blue)
    #        img[:, :, 1] = 0  (green)  — OpenCV is BGR order
    # Input: image_bytes (bytes)
    # Output: processed image as bytes
    #
    # Your code here ↓
    pass

def sharpened(image_bytes: bytes) -> bytes:
    # TODO [6]: Sharpen the image using an unsharp mask
    #
    # What:  Enhance fine details and edges.
    # Hint:  blurred = cv2.GaussianBlur(img, (0, 0), 3)
    #        sharp = cv2.addWeighted(img, 1.5, blurred, -0.5, 0)
    # Input: image_bytes (bytes)
    # Output: processed image as bytes
    #
    # Your code here ↓
    pass

# Registry — maps variant name to function.
# parallel_upload.py iterates this dict. Add new variants here.
VARIANTS = {
    'grayscale':             grayscale,
    'enhanced_contrast':     enhanced_contrast,
    'edge_detection':        edge_detection,
    'gaussian_blur':         gaussian_blur,
    'histogram_equalization': histogram_equalization,
    'red_channel':           red_channel,
    'sharpened':             sharpened,
}
```

---

### result_aggregator/src/services/aggregator.js [scaffold]

```js
import { redis } from '../infra/redis.js'
import { persistResult } from './persist.js'

function buildJobKey(job_id) {
  return `job:${job_id}`
}

/**
 * Called when the Kafka consumer receives an "ml_result_ready" event.
 */
export async function handleMLResult(event) {
  const { job_id, prediction, confidence } = event

  // TODO [1]: Store ML result fields in the Redis hash for this job
  //
  // What:  Update the existing job hash with the ML output and mark ml_done.
  // Hint:  await redis.hSet(buildJobKey(job_id), {
  //          prediction, confidence: String(confidence), ml_done: 'true'
  //        })
  // Input: job_id, prediction (string), confidence (number)
  // Output: none
  //
  // Your code here ↓

  // TODO [2]: Check if both services are done and finalize if so
  //
  // What:  After updating, check if ml_done AND image_done are both 'true'.
  //        If yes, call finalizeJob(job_id).
  // Hint:  const job = await redis.hGetAll(buildJobKey(job_id))
  //        if (job.ml_done === 'true' && job.image_done === 'true') await finalizeJob(job_id)
  // Input: job_id
  // Output: none
  //
  // Your code here ↓
}

/**
 * Called when the Kafka consumer receives an "image_processing_done" event.
 */
export async function handleImageDone(event) {
  const { job_id, image_urls } = event

  // TODO [3]: Store image_urls and mark image_done in Redis
  //
  // What:  Update the job hash with the processed image URLs and mark image_done.
  // Hint:  image_urls is an array — stringify it before storing in Redis.
  //        await redis.hSet(buildJobKey(job_id), {
  //          image_urls: JSON.stringify(image_urls), image_done: 'true'
  //        })
  // Input: job_id, image_urls (string[])
  // Output: none
  //
  // Your code here ↓

  // TODO [4]: Same finalization check as handleMLResult
  //
  // What:  Check if both done, call finalizeJob if yes.
  // Hint:  Same pattern as TODO [2] above.
  //
  // Your code here ↓
}

async function finalizeJob(job_id) {
  // TODO [5]: Mark the job as complete in Redis and trigger persistence
  //
  // What:  Set status = "complete" in Redis, then fire off a non-blocking
  //        Postgres insert. The insert should NOT block the Kafka consumer.
  // Hint:  await redis.hSet(buildJobKey(job_id), { status: 'complete' })
  //        const job = await redis.hGetAll(buildJobKey(job_id))
  //        persistResult(job_id, job).catch(err => console.error('persist failed', err))
  //        Note: no await on persistResult — fire and forget.
  // Input: job_id
  // Output: none
  //
  // Your code here ↓
}
```

---

### result_aggregator/src/services/persist.js [scaffold]

```js
import { pool } from '../infra/db.js'

/**
 * Persists the completed job result to PostgreSQL.
 * Called as a fire-and-forget from aggregator.js — failures are logged, not thrown.
 *
 * @param {string} job_id
 * @param {object} job - Full Redis hash for the job (all string values)
 */
export async function persistResult(job_id, job) {
  // TODO [1]: Insert the completed job into the results table
  //
  // What:  Write the job's final data to the `job_results` table.
  //        Parse image_urls from JSON string back to an array.
  // Hint:
  //   const query = `
  //     INSERT INTO job_results
  //       (job_id, filename, prediction, confidence, image_urls, created_at, completed_at)
  //     VALUES ($1, $2, $3, $4, $5, $6, NOW())
  //     ON CONFLICT (job_id) DO NOTHING
  //   `
  //   const values = [
  //     job_id,
  //     job.filename,
  //     job.prediction,
  //     parseFloat(job.confidence),
  //     JSON.parse(job.image_urls || '[]'),
  //     job.created_at,
  //   ]
  //   await pool.query(query, values)
  // Input: job_id (string), job (object with string values from Redis hGetAll)
  // Output: none (throw on error — caller catches it)
  //
  // Your code here ↓
}
```

---

## PostgreSQL Init Schema

Create `postgres/init.sql` — Docker will run this on first start:

```sql
CREATE TABLE IF NOT EXISTS job_results (
  id           SERIAL PRIMARY KEY,
  job_id       UUID NOT NULL UNIQUE,
  filename     TEXT,
  prediction   TEXT,
  confidence   NUMERIC(5, 4),
  image_urls   JSONB,
  created_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_results_job_id ON job_results(job_id);
```

Mount this in docker-compose:
```yaml
postgres:
  volumes:
    - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
```

---

## Kafka Topics Reference

| Topic name               | Publisher        | Consumers                          |
|--------------------------|------------------|------------------------------------|
| `image_uploads`          | api_gateway      | ml_service, image_processor (fan-out) |
| `ml_result_ready`        | ml_service       | result_aggregator                  |
| `image_processing_done`  | image_processor  | result_aggregator                  |

All topic names come from env vars — never hardcode them.

---

## Deliverables Checklist

When you are done, the following must be true:

- [ ] All files and folders listed in the structure above exist
- [ ] Every `[full]` file is completely implemented with no TODOs
- [ ] Every `[scaffold]` file has real boilerplate and correctly formatted TODO blocks
- [ ] `docker-compose.yml` starts all infra services with `docker compose up`
- [ ] `.env.example` contains every variable referenced across all services
- [ ] No business logic exists in any `[full]` file — those are infrastructure only
- [ ] No raw SDK calls exist inside route handlers or consumer callbacks — only service calls
- [ ] No hardcoded strings for topics, ports, or credentials anywhere in source files
- [ ] Every TODO block can be implemented independently without reading other files

Do not output a summary. Create the files.