CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ontology_terms (
  id SERIAL PRIMARY KEY,
  term_type TEXT NOT NULL,
  value TEXT NOT NULL UNIQUE,
  label TEXT
);

CREATE TABLE IF NOT EXISTS source_documents (
  id UUID PRIMARY KEY,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  content TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL,
  hash TEXT,
  meta JSONB
);

CREATE TABLE IF NOT EXISTS regulation_items (
  id UUID PRIMARY KEY,
  jurisdiction TEXT NOT NULL,
  source_org TEXT,
  source_type TEXT,
  title TEXT,
  summary_1line TEXT,
  url TEXT,
  published_date DATE,
  retrieved_at TIMESTAMPTZ,
  effective_date DATE,
  status TEXT,
  topics TEXT[],
  impacted_areas TEXT[],
  engineering_actions JSONB,
  evidence JSONB,
  confidence NUMERIC,
  notes TEXT,
  priority TEXT,
  trust_tier TEXT,
  monitoring_stage TEXT,
  source_profile_id TEXT,
  source_document_id UUID REFERENCES source_documents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS requirements (
  id UUID PRIMARY KEY,
  requirement_family TEXT,
  markets TEXT[],
  vehicle_types TEXT[],
  functions TEXT[],
  owner TEXT,
  evidence_status TEXT,
  priority TEXT,
  source_item_id UUID REFERENCES regulation_items(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY,
  item_id UUID REFERENCES regulation_items(id),
  raw_file_uri TEXT,
  text_snapshot_uri TEXT,
  citations JSONB
);

CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY,
  run_type TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  days_window INT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  meta JSONB,
  job_id TEXT
);

CREATE TABLE IF NOT EXISTS review_queue (
  id UUID PRIMARY KEY,
  entity_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewer TEXT
);

CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY,
  from_type TEXT NOT NULL,
  from_id UUID NOT NULL,
  to_type TEXT NOT NULL,
  to_id UUID NOT NULL,
  relation TEXT NOT NULL,
  meta JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS links_unique_idx
  ON links (from_type, from_id, to_type, to_id, relation);

CREATE TABLE IF NOT EXISTS vector_stores (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  meta JSONB
);

CREATE TABLE IF NOT EXISTS vector_chunks (
  id UUID PRIMARY KEY,
  document_id UUID,
  chunk_index INT NOT NULL,
  text TEXT NOT NULL,
  embedding VECTOR(1536),
  vector_store_id UUID REFERENCES vector_stores(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vector_chunks_document_idx ON vector_chunks (document_id);
CREATE INDEX IF NOT EXISTS vector_chunks_store_idx ON vector_chunks (vector_store_id);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
