CREATE TABLE IF NOT EXISTS vector_stores (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  meta JSONB
);

ALTER TABLE runs ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE vector_chunks ADD COLUMN IF NOT EXISTS vector_store_id UUID REFERENCES vector_stores(id);

CREATE UNIQUE INDEX IF NOT EXISTS links_unique_idx
  ON links (from_type, from_id, to_type, to_id, relation);

CREATE INDEX IF NOT EXISTS vector_chunks_document_idx ON vector_chunks (document_id);
CREATE INDEX IF NOT EXISTS vector_chunks_store_idx ON vector_chunks (vector_store_id);
