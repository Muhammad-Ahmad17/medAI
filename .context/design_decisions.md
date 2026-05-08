# Design Decisions & Objections

Answers to every "why" question about the architecture, plus additional
questions that naturally arise from the same code.

---

## Q1 — Why are there TWO database declarations?
### `api_gateway/src/infra/postgres.js`  vs  `result_aggregator/src/infra/db.js`

**Short answer:** Two services, two processes, same physical Postgres.

Each Docker container is a separate Node.js process with its own memory.
A `pg.Pool` is a pool of TCP sockets; it lives inside the process that
created it and cannot be shared across process boundaries.

| Detail | api_gateway `postgres.js` | result_aggregator `db.js` |
|--------|--------------------------|--------------------------|
| Pool size | default (10) | default (10) |
| Tables it writes | `jobs`, `predictions`, `results` | `job_results` only |
| Tables it reads | `jobs` (fallback on Redis miss) | nothing (write-only) |
| Why it exists | Gateway needs Postgres at startup to create schema | Aggregator needs Postgres to persist completed results |

**They connect to the same physical Postgres instance** (same `POSTGRES_*`
env-vars), but each service manages its own TCP connections independently.
This is normal and correct in a microservices setup.

---

## Q2 — Why are we storing job status in Postgres if it is short-term?

**Short answer:** Redis IS the short-term store; Postgres is the safety net.

```
Redis  → 7-day TTL (SETEX)  → fast reads, auto-expiry
Postgres → permanent row   → survives Redis restart, crash, flush
```

The `getJob` function reads Redis **first** (O(1), sub-millisecond).
Postgres is the **fallback** — it answers only when the Redis key has
expired or the cache was cold (e.g. after a Redis restart):

```js
const cached = await redis.get(`job:${jobId}`)
if (cached) return JSON.parse(cached)      // ← fast path (99% of requests)
// only reaches Postgres if Redis misses:
const result = await db.query(`SELECT * FROM jobs WHERE job_id = $1`, [jobId])
```

**Why store in Postgres at all?**

- A job typically completes in seconds, but the *result* may be viewed
  minutes or hours later (doctor logs in after a meeting).
- Redis can be flushed, restarted, or run out of memory.
- Postgres provides a durable audit trail: when was this scan submitted,
  when did it complete, what was the prediction?

**Why not Postgres-only?**

- The browser polls every 2 seconds until completion. Under load that
  would be hundreds of SQL SELECTs per second.
- Redis handles that trivially; Postgres would be overwhelmed.

**Conclusion:** Redis is a cache/queue hybrid; Postgres is the record of truth.
The 7-day TTL matches a realistic "result review" window; after that the row in
Postgres is still there for historical queries.

---

## Q3 — If `presignResult` produces temporary URLs, why permanently store the result?

**Short answer:** We store the *object keys*, not the presigned URLs.
Presigning happens at read time, not write time.

What is actually stored in Postgres `job_results.image_urls` is:

```
["https://namespace.compat.objectstorage.ap-mumbai-1.oraclecloud.com/cancer-cells-images/processed/job-123/heatmap-scan.jpg",
 "https://.../original-scan.jpg", ...]
```

These are **plain, unsigned URLs** (path-style permanent references to private
objects). They cannot be accessed without credentials — they are just addresses.

When the browser calls `GET /api/results/:jobId`, the gateway calls
`presignJobResult()` which **converts those plain URLs → short-lived SigV4
signed URLs on the fly**, right before the response is sent:

```
Stored permanently:   plain URL  (address, not access)
Sent to browser:      presigned URL  (expires in OCI_PRESIGN_EXPIRES_SECONDS)
```

**Why not store the presigned URL?**
- A presigned URL expires (default 1 hour). If you stored it and a doctor
  views the result 2 hours later, the image link is dead.
- By storing the plain key and presigning at read time, every request gets
  a fresh URL valid for the configured TTL.

**What if we wanted to store object keys directly (cleaner)?**
That is a valid refactor: store only `processed/job-123/heatmap-scan.jpg` and
reconstruct the full URL in `presignResult.js`. The current code stores the
full URL because the image_processor returns URLs, and parsing the key back out
is handled by `parseObjectKeyFromUrl()` in `utils/objectStorageUrl.js`.

---

## Q4 — Kafka consumer vs producer: detailed flow

### What is Kafka in one sentence?
A durable, ordered message log. Producers append events; consumers read
them at their own pace. Events are not deleted after one consumer reads them —
all consumers in different groups get their own copy.

### Full event flow in this app

```
Browser
  │
  │  POST /api/upload (multipart image)
  ▼
API Gateway
  │  1. Upload file to OCI → objectKey
  │  2. Create job in Redis + Postgres (status=received)
  │  3. publishEvent(topic: image_uploads, { job_id, object_key, ... })
  ▼
Kafka topic: image_uploads
  │
  ├──► image_processor consumer (group: image-processor-group)
  │      │  consume_forever polls topic
  │      │  handle_image_uploaded(event):
  │      │    download original from OCI
  │      │    apply 7 VARIANTS (OpenCV transforms)
  │      │    upload_variants_in_parallel → 7 URLs
  │      │    publishEvent(topic: image_processing_done, { job_id, image_urls })
  │      ▼
  │    Kafka topic: image_processing_done
  │
  └──► ml_service consumer (group: ml-service-group)
         │  consume_forever polls same topic (independent group → own copy)
         │  handle_image_uploaded(event):
         │    download original from OCI
         │    preprocess_image → [1,128,128,3] float32
         │    run_inference → (prediction, confidence)
         │    publishEvent(topic: ml_result_ready, { job_id, prediction, confidence })
         ▼
       Kafka topic: ml_result_ready

result_aggregator consumer (group: aggregator-group)
  │  runConsumers subscribes to BOTH topics:
  │    ml_result_ready      → handleMLResult(event)
  │    image_processing_done → handleImageDone(event)
  │
  │  mergeJob (Redis WATCH/MULTI, optimistic lock):
  │    whichever arrives first sets its flag (mlDone or imageDone)
  │    when BOTH flags true:
  │      status = completed
  │      job.result = { prediction, confidence, imageUrls }
  │      persistResult(job_id, job) → Postgres job_results (fire-and-forget)
  ▼
Redis key job:{id} now has status=completed + full result

Browser (polling GET /api/results/:jobId every 2 s)
  │  getJob checks Redis → status=completed
  │  presignJobResult → replaces image_urls with signed URLs
  └► 200 { prediction, confidence, imageUrls: [signedUrl1, ...] }
```

### Why two independent consumers for the same topic?
`image_processor` and `ml_service` use **different consumer group IDs**.
Kafka delivers every message to every group independently.
If they shared a group, only one of them would receive each message.

### Why WATCH/MULTI in the aggregator?
The two pipeline events (ML result + image processing done) arrive at
approximately the same time but from different containers.
Without locking, both handlers could read the same job, each set their flag,
and both write back — with the second write overwriting the first flag:

```
Handler A reads:  { mlDone: false, imageDone: false }
Handler B reads:  { mlDone: false, imageDone: false }
Handler A writes: { mlDone: true,  imageDone: false }  ← sets mlDone
Handler B writes: { mlDone: false, imageDone: true  }  ← OVERWRITES mlDone!
→ job never reaches completed
```

Redis WATCH detects the concurrent write and forces a retry. At most one
handler succeeds per attempt; the other retries with the already-updated value.

### SETEX vs SET
| Command | Behaviour | Used for |
|---------|-----------|----------|
| `SETEX key seconds value` | Store with expiry; auto-deleted after TTL | Job records (7 days) |
| `SET key value` | Store without expiry; lives forever | Not used in this app |
| `SET key value EX seconds` | Modern equivalent of SETEX | Result aggregator MULTI block |

---

## Q5 — Why does the api_gateway create Postgres tables at boot, but result_aggregator does not?

The API gateway's `postgres.js` runs `CREATE TABLE IF NOT EXISTS` for:
- `jobs`, `predictions`, `results` — because only the gateway writes to those.

The result_aggregator writes to `job_results`, which is created by the
**Postgres init script** (`postgres/init.sql`) that runs once when the
Postgres Docker container is first created.

This avoids a race: if two services both tried to `CREATE TABLE` the same table
on startup, they would both need startup-ordering guarantees. Instead, structural
DDL lives in one place (`init.sql`); runtime tables are each owned by one service.

---

## Q6 — Why does the frontend never call the API gateway directly?

The SPA uses only relative paths (`/api/upload`, `/api/results/:id`).
These resolve to whatever origin the browser loaded the page from.
nginx inside the frontend container proxies those paths to `api_gateway:3000`
on the internal Docker network.

**Benefits:**
- No CORS issue — same origin for HTML and API.
- The API gateway port (3000) is never exposed to the public internet.
- A future HTTPS reverse proxy (OCI LB, Caddy) only needs to terminate TLS
  at one point (the frontend nginx); the backend stays HTTP internally.

---

## Q7 — Why is the Keras model loaded at module import (module-level call), not per-request?

```python
# ml_service/services/ml_handler.py  (top of file)
try_load_model(settings.MODEL_PATH)   # runs ONCE when module is imported
```

Loading a 15 MB Keras model with TensorFlow takes **2–5 seconds** and allocates
GPU/CPU buffers. Doing that inside the message handler would add that latency
to every single scan — completely unacceptable.

By loading at startup, the model is in RAM before the first Kafka message
arrives. `run_inference` then just calls `model.predict()` which is fast (~50 ms).

`try_load_model` also catches all errors and sets `model=None` instead of
crashing, so the service can start and return informative `"model_not_loaded"`
results even if the `.keras` file is temporarily missing from the volume.

---

## Q8 — Why parallel uploads in the image_processor?

The 7 VARIANTS are generated sequentially (CPU-bound dict comprehension), but
the upload of each variant to OCI is network-bound (independent PUT requests).
`ThreadPoolExecutor(max_workers=4)` lets up to 4 uploads happen simultaneously,
cutting the total upload phase roughly to `max(single_upload_time)` instead of
`7 × single_upload_time`. For a typical 200 KB variant and a 50 ms RTT to OCI,
that is ~350 ms instead of ~2.5 s.
