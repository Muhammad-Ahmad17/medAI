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
