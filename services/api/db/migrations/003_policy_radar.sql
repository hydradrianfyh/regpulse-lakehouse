ALTER TABLE regulation_items ADD COLUMN IF NOT EXISTS trust_tier TEXT;
ALTER TABLE regulation_items ADD COLUMN IF NOT EXISTS monitoring_stage TEXT;
ALTER TABLE regulation_items ADD COLUMN IF NOT EXISTS source_profile_id TEXT;
