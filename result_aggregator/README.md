# Result Aggregator Service

## Overview
The Result Aggregator is a Node.js/Fastify-based microservice that collects, processes, and aggregates ML predictions from the ML Service into final analysis results. It coordinates the final stage of the cancer cell detection pipeline, combining multiple predictions into a comprehensive report and notifying the user of completion.

## Technology Stack
- **Framework**: Fastify (lightweight web framework)
- **Language**: JavaScript (Node.js)
- **Message Queue**: Kafka (for event-driven processing)
- **Cache**: Redis (for result caching and notifications)
- **Database**: PostgreSQL (for persistent storage)
- **Cloud Storage**: Oracle Cloud Infrastructure (OCI) S3-compatible storage

## Directory Structure

```
result_aggregator/
├── src/
│   ├── config/              # Configuration management
│   ├── routes/              # API endpoints for result retrieval
│   ├── infra/               # Infrastructure integrations
│   │   ├── kafka.js         # Kafka producer/consumer setup
│   │   ├── redis.js         # Redis client for notifications
│   │   ├── postgres.js      # PostgreSQL database client
│   │   └── oci.js           # Oracle Cloud Storage integration
│   ├── services/            # Business logic
│   │   ├── aggregatorService.js  # Result aggregation logic
│   │   ├── notificationService.js # User notifications
│   │   └── reportService.js      # Report generation
│   └── index.js             # Application entry point
├── Dockerfile               # Container configuration
└── package.json             # Node.js dependencies and scripts
```

## Key Features

### 1. **Prediction Aggregation**
- Consumes individual ML predictions from the ML Service
- Combines multiple predictions using statistical methods
- Calculates confidence scores and aggregate classifications
- Handles edge cases (conflicting predictions, low confidence)

### 2. **Result Persistence**
- Stores final results in PostgreSQL database
- Caches frequently accessed results in Redis
- Archives results in OCI Object Storage
- Maintains result history and audit trails

### 3. **User Notifications**
- Notifies users when analysis is complete
- Provides real-time status updates
- Integrates with notification channels (email, webhook, push)
- Handles failed jobs with error details

### 4. **Report Generation**
- Creates comprehensive analysis reports
- Includes visualizations and heatmaps
- Generates human-readable summaries
- Exports results in multiple formats (JSON, PDF, images)

## Dependencies

| Package | Purpose |
|---------|---------|
| `fastify` | Web server framework |
| `kafkajs` | Kafka client for message consumption/production |
| `ioredis` | Redis client for caching |
| `pg` | PostgreSQL client |
| `@aws-sdk/client-s3` | S3-compatible storage (OCI) |
| `pdfkit` | PDF report generation |
| `handlebars` | Template engine for report formatting |

## Aggregation Workflow

```
ML Service Publishes Prediction (Kafka)
    ↓
Consumer Receives Prediction Event
    ↓
Validate Prediction Data
    ↓
Retrieve Job Context from PostgreSQL
    ↓
Check if All Predictions Received
    ↓
If Complete:
  - Aggregate predictions using strategy
  - Calculate final confidence
  - Determine final classification
  - Generate report
  - Store results in PostgreSQL
  - Cache in Redis
  - Create visualization
  - Notify user (via Redis pub/sub)
  ↓
Publish Aggregation Complete Event
```

## Key Modules

### `services/aggregatorService.js`
Core aggregation logic:
- Collects individual predictions
- Implements aggregation strategies (voting, averaging, weighted ensemble)
- Calculates composite confidence scores
- Determines final classification
- Handles edge cases (missing predictions, timeouts)

**Aggregation Strategies:**
- **Majority Voting**: Most common prediction wins
- **Confidence Weighted**: Higher confidence predictions weighted more
- **Statistical**: Mean/median of confidence scores
- **Ensemble**: Weighted combination based on model accuracy

### `services/notificationService.js`
User communication:
- Triggers on aggregation completion
- Sends notifications via configured channels
- Includes result summary and access link
- Handles notification failures and retries

### `services/reportService.js`
Report generation:
- Creates detailed analysis reports
- Embeds visualizations and heatmaps
- Generates PDF and JSON exports
- Stores reports in OCI storage
- Provides shareable result URLs

### `infra/kafka.js`
Message queue integration:
- Consumes from ml-results topic
- Publishes completion events
- Handles offset management
- Implements error recovery

### `infra/postgres.js`
Database operations:
- Writes final results to aggregated_results table
- Updates job status to completed
- Maintains processing logs
- Queries historical data for trends

### `infra/redis.js`
Caching and notifications:
- Caches final results for fast retrieval
- Publishes completion notifications via pub/sub
- Stores temporary aggregation state
- Manages result TTLs

## API Endpoints

### Get Job Results
**GET** `/results/:jobId`
- Returns final aggregated results
- Includes predictions, confidence, and classification
- Returns 404 if job not found

### Get Result Status
**GET** `/status/:jobId`
- Returns current aggregation status
- Indicates if aggregation is in progress
- Shows percentage complete (if applicable)

### Download Report
**GET** `/results/:jobId/report`
- Returns generated report (PDF/JSON)
- Supports format parameter
- Includes visualizations and detailed analysis

### Subscribe to Notifications (WebSocket)
**WS** `/subscribe/:jobId`
- Real-time notifications when job completes
- Streams results as they're finalized
- Automatic connection handling

## Data Models

### Aggregation Context
```javascript
{
  jobId: "uuid",
  imageIds: ["img1", "img2", ...],
  predictions: [
    {
      imageId: "img1",
      modelName: "cnn-v2",
      confidence: 0.95,
      classification: "cancer",
      timestamp: "2024-01-01T10:00:00Z"
    },
    ...
  ],
  aggregatedResult: {
    finalClassification: "cancer",
    confidenceScore: 0.93,
    affectedCells: 245,
    modelConsensus: 0.87,
    visualization: "s3://bucket/viz.png"
  }
}
```

## Configuration

Key settings in `src/config/env.js`:
- `KAFKA_BROKERS` - Kafka broker addresses
- `KAFKA_TOPIC_ML_RESULTS` - Topic consuming from ML Service
- `REDIS_URL` - Redis connection string
- `POSTGRES_CONNECTION` - Database connection details
- `OCI_*` - Oracle Cloud credentials
- `AGGREGATION_STRATEGY` - Which aggregation algorithm to use
- `NOTIFICATION_CHANNELS` - Enabled notification types

## Running the Service

```bash
# Install dependencies
npm install

# Start the aggregator
npm start
```

## Integration Points

- **Receives events from**: ML Service (via Kafka - ml-results topic)
- **Stores results in**: PostgreSQL database
- **Caches data in**: Redis
- **Stores artifacts in**: OCI Object Storage
- **Notifies**: Users (via Redis pub/sub, webhooks, email)

## Aggregation Strategies

### Strategy Selection
The aggregation strategy determines how multiple predictions are combined:

1. **Consensus Voting**
   - All models must agree
   - Highest confidence threshold
   - Low false positive rate

2. **Majority Voting**
   - Most models agree
   - Balances sensitivity and specificity
   - Default strategy

3. **Weighted Average**
   - Models weighted by historical accuracy
   - Adapts to model performance
   - Requires model tracking data

4. **Ensemble Optimization**
   - Machine learning based combination
   - Learns optimal weighting over time
   - Most complex implementation

## Error Handling & Resilience

- Implements timeout for incomplete predictions
- Handles partial prediction sets gracefully
- Retries failed database writes
- Implements circuit breaker for external services
- Logs all aggregation decisions for audit

## Performance Considerations

- Caches aggregation results to reduce database queries
- Implements batch notifications
- Pre-generates common reports
- Uses Redis for real-time status updates
- Implements pagination for historical data

## Monitoring & Observability

- Tracks aggregation latency
- Monitors prediction arrival rates
- Alerts on incomplete predictions
- Measures notification delivery success
- Provides metrics dashboards

## Result Lifecycle

```
Job Initiated
    ↓
Predictions Collected (ML Service → Kafka)
    ↓
Aggregation Complete (Result Aggregator)
    ↓
Results Stored (PostgreSQL)
    ↓
User Notified (Redis pub/sub)
    ↓
Results Cached (Redis)
    ↓
Report Generated & Stored (OCI)
    ↓
Available for Retrieval (API)
```
