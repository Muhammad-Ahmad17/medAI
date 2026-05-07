# PostgreSQL Database

## Overview
PostgreSQL is the primary relational database for the cancer cell detection system. It stores persistent application data including user information, job metadata, processing history, results, and system configuration.

## Directory Structure

```
postgres/
└── init.sql            # Database initialization script
```

## Key Responsibilities

### 1. **Data Persistence**
- Stores job records and their lifecycle
- Maintains user and authentication data
- Archives processing history
- Persists ML model predictions and results

### 2. **Data Relationships**
- Links images to processing jobs
- Associates jobs with ML predictions
- Tracks result aggregations
- Maintains audit trails

### 3. **Transactional Integrity**
- Ensures ACID compliance for critical operations
- Manages concurrent access from multiple services
- Supports complex queries for reporting

## Database Schema

The `init.sql` script initializes the following tables:

### Core Tables

#### `jobs`
Tracks processing jobs from start to completion
- `id` - Unique job identifier
- `user_id` - User who initiated the job
- `status` - Current job status (pending, processing, completed, failed)
- `created_at` - Job creation timestamp
- `updated_at` - Last update timestamp
- `result` - Final aggregated result

#### `images`
Stores image metadata and relationships
- `id` - Image identifier
- `job_id` - Associated job
- `filename` - Original filename
- `storage_path` - Path in OCI Object Storage
- `size` - File size in bytes
- `upload_timestamp` - When uploaded

#### `predictions`
Stores ML model predictions
- `id` - Prediction identifier
- `image_id` - Image that was analyzed
- `model_name` - Name of ML model used
- `confidence` - Confidence score (0-1)
- `class_label` - Predicted cancer classification
- `metadata` - JSON field for additional model outputs
- `created_at` - Prediction timestamp

#### `aggregated_results`
Final results combining multiple predictions
- `id` - Result identifier
- `job_id` - Associated job
- `final_prediction` - Aggregated prediction
- `confidence_score` - Combined confidence
- `affected_cells_count` - Estimated number of cancer cells
- `visualization_path` - Path to result visualization
- `created_at` - Result timestamp

#### `users`
User and authentication data
- `id` - User identifier
- `email` - User email (unique)
- `name` - User display name
- `role` - User role (admin, analyst, viewer)
- `created_at` - Account creation date

#### `processing_logs`
Audit trail and debugging information
- `id` - Log entry identifier
- `job_id` - Associated job
- `service_name` - Which service generated the log
- `event_type` - Type of event (upload, process, complete, error)
- `details` - JSON details about the event
- `timestamp` - When event occurred

## Data Flow

```
Client Upload Request (API Gateway)
    ↓
Create Job Record (jobs table)
    ↓
Store Image Metadata (images table)
    ↓
[Image Processing]
    ↓
Store ML Predictions (predictions table)
    ↓
[Result Aggregation]
    ↓
Create Aggregated Result (aggregated_results table)
    ↓
Update Job Status to Completed
```

## Key Features

### 1. **Job Tracking**
- Complete lifecycle tracking from upload to result
- Status transitions: pending → processing → completed/failed
- Timestamps for performance monitoring

### 2. **Audit Trail**
- `processing_logs` table captures all significant events
- Service-level granularity (which service did what)
- Enables debugging and compliance tracking

### 3. **Result Management**
- Stores raw ML predictions
- Maintains aggregated results
- Links results back to original images and jobs

### 4. **User Management**
- Multi-user support with role-based access
- Enables per-user filtering and privacy

## Initialization Script (`init.sql`)

The init script performs:
1. **Table Creation** - Defines all schema tables
2. **Index Creation** - Performance optimization on frequently queried columns
3. **Foreign Key Constraints** - Maintains referential integrity
4. **Default Values** - Sets sensible defaults for timestamps and status

## Connection Details

From Docker Compose:
- **Hostname**: `postgres` (internal container network)
- **Port**: `5432` (standard PostgreSQL port)
- **Database**: `cancer_cells_db` (or configured name)
- **User**: Set via environment variables
- **Password**: Set via environment variables

## Service Connections

Services that connect to PostgreSQL:
- **API Gateway** - Reads/writes job records
- **Result Aggregator** - Writes final results
- **Admin Services** - Queries for reporting and monitoring
- **Authentication Services** - User validation

## Backup & Recovery

### Backup Recommendations
```bash
# Docker backup
docker exec cancer_cells_postgres pg_dump -U postgres cancer_cells_db > backup.sql

# Restore
docker exec -i cancer_cells_postgres psql -U postgres cancer_cells_db < backup.sql
```

### Data Retention Policy
- Keep job records for 90 days (configurable)
- Archive old results periodically
- Maintain audit logs for compliance

## Performance Considerations

### Indexing
- Primary keys (indexed automatically)
- Foreign key columns (for joins)
- Status columns (for filtering)
- Timestamp columns (for range queries)

### Query Optimization
- Use proper WHERE clauses to limit result sets
- Batch insert operations when possible
- Implement pagination for large result sets
- Monitor slow query logs

## Monitoring & Maintenance

### Health Checks
```bash
# Check connection
docker exec cancer_cells_postgres psql -U postgres -c "SELECT 1"

# Check database size
docker exec cancer_cells_postgres psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('cancer_cells_db'))"

# Check active connections
docker exec cancer_cells_postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity"
```

### Common Maintenance Tasks
- **Vacuum**: Reclaim disk space from deleted rows
- **Analyze**: Update table statistics for query optimization
- **Reindex**: Rebuild indexes if performance degrades

## Scaling Considerations

For production deployments:
- Consider read replicas for high query load
- Implement connection pooling (via PgBouncer)
- Archive historical data to separate storage
- Monitor disk space and plan growth
