-- Phase 2: Observability & Storage Migration
-- Adds tables for raw HTML storage, extraction logging, and failed insert tracking
-- Idempotent - safe to run multiple times

-- 1. raw_pages: Store fetched HTML + metadata (one row per URL fetch attempt)
CREATE TABLE IF NOT EXISTS raw_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  status INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  http_headers JSONB,
  storage_path TEXT, -- path in storage bucket or filesystem
  content_length INTEGER,
  notes TEXT,
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for raw_pages
CREATE INDEX IF NOT EXISTS idx_raw_pages_source_id ON raw_pages(source_id);
CREATE INDEX IF NOT EXISTS idx_raw_pages_url ON raw_pages(url);
CREATE INDEX IF NOT EXISTS idx_raw_pages_fetched_at ON raw_pages(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_pages_status ON raw_pages(status);

-- 2. extraction_logs: Per-URL extraction status for monitoring
CREATE TABLE IF NOT EXISTS extraction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  raw_page_id UUID REFERENCES raw_pages(id) ON DELETE SET NULL,
  status TEXT NOT NULL, -- OK / PARTIAL / EMPTY / DB_FAIL
  reason TEXT,
  extracted_fields JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE
);

-- Indexes for extraction_logs
CREATE INDEX IF NOT EXISTS idx_extraction_logs_source_id ON extraction_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_extraction_logs_url ON extraction_logs(url);
CREATE INDEX IF NOT EXISTS idx_extraction_logs_status ON extraction_logs(status);
CREATE INDEX IF NOT EXISTS idx_extraction_logs_created_at ON extraction_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extraction_logs_raw_page_id ON extraction_logs(raw_page_id);

-- 3. failed_inserts: Track insertion failures for debugging
CREATE TABLE IF NOT EXISTS failed_inserts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT,
  error TEXT NOT NULL,
  payload JSONB,
  raw_page_id UUID REFERENCES raw_pages(id) ON DELETE SET NULL,
  attempt_at TIMESTAMPTZ DEFAULT NOW(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  operation TEXT -- 'insert' / 'update' / 'process'
);

-- Indexes for failed_inserts
CREATE INDEX IF NOT EXISTS idx_failed_inserts_source_id ON failed_inserts(source_id);
CREATE INDEX IF NOT EXISTS idx_failed_inserts_source_url ON failed_inserts(source_url);
CREATE INDEX IF NOT EXISTS idx_failed_inserts_attempt_at ON failed_inserts(attempt_at DESC);
CREATE INDEX IF NOT EXISTS idx_failed_inserts_resolved_at ON failed_inserts(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_failed_inserts_raw_page_id ON failed_inserts(raw_page_id);

-- RLS Policies (if using Supabase RLS)
-- Note: These are optional and only apply if RLS is enabled
DO $$
BEGIN
    -- Check if RLS is enabled on sources table (indicates Supabase setup)
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'sources'
        AND rowsecurity = true
    ) THEN
        -- Enable RLS on new tables
        ALTER TABLE raw_pages ENABLE ROW LEVEL SECURITY;
        ALTER TABLE extraction_logs ENABLE ROW LEVEL SECURITY;
        ALTER TABLE failed_inserts ENABLE ROW LEVEL SECURITY;
        
        -- Public read access for raw_pages (for debugging)
        DROP POLICY IF EXISTS "raw_pages_public_read" ON raw_pages;
        CREATE POLICY "raw_pages_public_read" ON raw_pages
            FOR SELECT USING (true);
        
        -- Public read access for extraction_logs
        DROP POLICY IF EXISTS "extraction_logs_public_read" ON extraction_logs;
        CREATE POLICY "extraction_logs_public_read" ON extraction_logs
            FOR SELECT USING (true);
        
        -- Public read access for failed_inserts
        DROP POLICY IF EXISTS "failed_inserts_public_read" ON failed_inserts;
        CREATE POLICY "failed_inserts_public_read" ON failed_inserts
            FOR SELECT USING (true);
        
        -- Service role can do everything
        DROP POLICY IF EXISTS "raw_pages_service_all" ON raw_pages;
        CREATE POLICY "raw_pages_service_all" ON raw_pages
            FOR ALL USING (auth.role() = 'service_role');
        
        DROP POLICY IF EXISTS "extraction_logs_service_all" ON extraction_logs;
        CREATE POLICY "extraction_logs_service_all" ON extraction_logs
            FOR ALL USING (auth.role() = 'service_role');
        
        DROP POLICY IF EXISTS "failed_inserts_service_all" ON failed_inserts;
        CREATE POLICY "failed_inserts_service_all" ON failed_inserts
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END
$$;

-- Comments for documentation
COMMENT ON TABLE raw_pages IS 'Stores raw HTML content fetched from job board URLs for debugging and re-extraction';
COMMENT ON TABLE extraction_logs IS 'Logs every extraction attempt with status and extracted fields for monitoring';
COMMENT ON TABLE failed_inserts IS 'Tracks jobs that failed to insert into the database for debugging and resolution';

COMMENT ON COLUMN raw_pages.storage_path IS 'Path to stored HTML file (Supabase Storage bucket path or filesystem path)';
COMMENT ON COLUMN extraction_logs.status IS 'Extraction status: OK (success), PARTIAL (some fields missing), EMPTY (no jobs found), DB_FAIL (database error)';
COMMENT ON COLUMN failed_inserts.operation IS 'Operation that failed: insert, update, or process';

