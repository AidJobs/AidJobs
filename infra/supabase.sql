-- AidJobs Database Schema
-- Idempotent schema for Supabase PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sources table: job board URLs to crawl
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_name TEXT,
    careers_url TEXT NOT NULL,
    source_type TEXT DEFAULT 'html',
    parser_hint TEXT,
    status TEXT DEFAULT 'pending_validation',
    crawl_frequency_days INT DEFAULT 3,
    last_crawled_at TIMESTAMPTZ,
    last_crawl_status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs table: parsed job postings
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
    org_name TEXT,
    title TEXT NOT NULL,
    location_raw TEXT,
    country TEXT,
    country_iso TEXT,
    city TEXT,
    level_norm TEXT,
    mission_tags TEXT[],
    international_eligible BOOLEAN,
    deadline DATE,
    apply_url TEXT,
    description_snippet TEXT,
    canonical_hash TEXT NOT NULL UNIQUE,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    search_tsv TSVECTOR
);

-- Indexes for jobs table
CREATE INDEX IF NOT EXISTS idx_jobs_search_tsv ON jobs USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_jobs_status_deadline ON jobs(status, deadline);
CREATE INDEX IF NOT EXISTS idx_jobs_country ON jobs(country);
CREATE INDEX IF NOT EXISTS idx_jobs_level_norm ON jobs(level_norm);
CREATE INDEX IF NOT EXISTS idx_jobs_international_eligible ON jobs(international_eligible);

-- Function to update search_tsv column
CREATE OR REPLACE FUNCTION jobs_tsv_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_tsv := 
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.org_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.description_snippet, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.mission_tags, ' '), '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain search_tsv
DROP TRIGGER IF EXISTS jobs_tsv_trigger ON jobs;
CREATE TRIGGER jobs_tsv_trigger
    BEFORE INSERT OR UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION jobs_tsv_update();

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    is_pro BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shortlists table: saved jobs
CREATE TABLE IF NOT EXISTS shortlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, job_id)
);

-- Find & Earn submissions
CREATE TABLE IF NOT EXISTS findearn_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    url TEXT NOT NULL,
    domain TEXT,
    status TEXT DEFAULT 'queued',
    jobs_found INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rewards table
CREATE TABLE IF NOT EXISTS rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    kind TEXT,
    days INT,
    issued_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    provider TEXT,
    provider_ref TEXT,
    amount_cents INT,
    currency TEXT DEFAULT 'USD',
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security Policies

-- Jobs table: public read access for active jobs
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_active_jobs ON jobs;
CREATE POLICY read_active_jobs ON jobs
    FOR SELECT
    TO anon, authenticated
    USING (status = 'active');

-- Shortlists table: owner-only access
ALTER TABLE shortlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manage_own_shortlists ON shortlists;
CREATE POLICY manage_own_shortlists ON shortlists
    FOR ALL
    TO authenticated
    USING (user_id::text = auth.uid()::text);

-- Sources table: admin-only (service role)
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only_sources ON sources;
CREATE POLICY admin_only_sources ON sources
    FOR ALL
    TO service_role
    USING (true);

-- Rewards table: admin-only (service role)
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only_rewards ON rewards;
CREATE POLICY admin_only_rewards ON rewards
    FOR ALL
    TO service_role
    USING (true);

-- Payments table: admin-only (service role)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_only_payments ON payments;
CREATE POLICY admin_only_payments ON payments
    FOR ALL
    TO service_role
    USING (true);
