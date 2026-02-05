CREATE TABLE IF NOT EXISTS run_logs (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS run_logs_run_id_idx ON run_logs (run_id);
CREATE INDEX IF NOT EXISTS run_logs_created_at_idx ON run_logs (created_at);
