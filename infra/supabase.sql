-- AidJobs Database Schema
-- Idempotent schema for Supabase PostgreSQL

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create Supabase-specific roles if they don't exist (for non-Supabase PostgreSQL)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END
$$;

-- Create auth schema and uid() function if they don't exist (for non-Supabase PostgreSQL)
-- Note: On Supabase-hosted databases, the auth schema already exists and is managed by Supabase.
-- We only create it for standalone PostgreSQL installations.
DO $$
BEGIN
    -- Check if we're on Supabase by looking for the 'extensions' schema
    -- On Supabase, skip auth schema creation to avoid permission errors
    IF NOT EXISTS (SELECT FROM information_schema.schemata WHERE schema_name = 'extensions') THEN
        -- Not on Supabase, create auth schema if needed
        IF NOT EXISTS (SELECT FROM information_schema.schemata WHERE schema_name = 'auth') THEN
            CREATE SCHEMA auth;
        END IF;
        
        -- Create stub uid() function for standalone PostgreSQL
        EXECUTE '
        CREATE OR REPLACE FUNCTION auth.uid()
        RETURNS UUID AS $FUNC$
        BEGIN
            RETURN NULL::UUID;
        END;
        $FUNC$ LANGUAGE plpgsql STABLE;
        ';
    END IF;
END
$$;

-- Lookup tables for normalization
-- Countries table: ISO2 country codes and names
CREATE TABLE IF NOT EXISTS countries (
    code_iso2 TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

-- Levels table: job seniority levels
CREATE TABLE IF NOT EXISTS levels (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Tags table: mission tags
CREATE TABLE IF NOT EXISTS tags (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Missions table: mission/thematic areas with SDG links
CREATE TABLE IF NOT EXISTS missions (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    sdg_links TEXT[]
);

-- Functional table: functional/technical areas
CREATE TABLE IF NOT EXISTS functional (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Work modalities table: work location types
CREATE TABLE IF NOT EXISTS work_modalities (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Contracts table: contract types
CREATE TABLE IF NOT EXISTS contracts (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Organization types table: hierarchical org types
CREATE TABLE IF NOT EXISTS org_types (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    parent TEXT
);

-- Crisis types table: humanitarian crisis types
CREATE TABLE IF NOT EXISTS crisis_types (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Clusters table: humanitarian clusters
CREATE TABLE IF NOT EXISTS clusters (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Response phases table: humanitarian response phases
CREATE TABLE IF NOT EXISTS response_phases (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Benefits table: job benefits
CREATE TABLE IF NOT EXISTS benefits (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Policy flags table: policy/culture flags
CREATE TABLE IF NOT EXISTS policy_flags (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Donors table: funding organizations
CREATE TABLE IF NOT EXISTS donors (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL
);

-- Synonyms table: raw value to canonical key mappings
CREATE TABLE IF NOT EXISTS synonyms (
    type TEXT NOT NULL,              -- level | mission | modality | donor | tag
    raw_value TEXT NOT NULL,
    canonical_key TEXT NOT NULL,
    PRIMARY KEY(type, raw_value)
);

-- Seed lookup tables (idempotent)
INSERT INTO countries (code_iso2, name) VALUES
    ('AF', 'Afghanistan'),
    ('BD', 'Bangladesh'),
    ('CD', 'Congo (DRC)'),
    ('ET', 'Ethiopia'),
    ('IN', 'India'),
    ('KE', 'Kenya'),
    ('NG', 'Nigeria'),
    ('PK', 'Pakistan'),
    ('SD', 'Sudan'),
    ('SO', 'Somalia'),
    ('SY', 'Syria'),
    ('US', 'United States'),
    ('YE', 'Yemen')
ON CONFLICT (code_iso2) DO NOTHING;

INSERT INTO levels (key, label) VALUES
    ('Intern', 'Intern'),
    ('Junior', 'Junior'),
    ('Mid', 'Mid'),
    ('Senior', 'Senior'),
    ('Lead', 'Lead')
ON CONFLICT (key) DO NOTHING;

INSERT INTO tags (key, label) VALUES
    ('health', 'Health'),
    ('education', 'Education'),
    ('wash', 'WASH'),
    ('climate', 'Climate'),
    ('gender', 'Gender'),
    ('protection', 'Protection'),
    ('nutrition', 'Nutrition'),
    ('livelihoods', 'Livelihoods'),
    ('shelter', 'Shelter'),
    ('food-security', 'Food Security')
ON CONFLICT (key) DO NOTHING;

-- Sources table: job board URLs to crawl
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_name TEXT,
    careers_url TEXT NOT NULL UNIQUE,
    source_type TEXT DEFAULT 'html',
    parser_hint TEXT,
    status TEXT DEFAULT 'active',
    crawl_frequency_days INT DEFAULT 3,
    last_crawled_at TIMESTAMPTZ,
    last_crawl_status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add notes column if missing (idempotent)
ALTER TABLE sources ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create indexes for sources table
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_careers_url ON sources(careers_url);

-- Crawl logs table: track crawl execution history
CREATE TABLE IF NOT EXISTS crawl_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
    found INT DEFAULT 0,
    inserted INT DEFAULT 0,
    updated INT DEFAULT 0,
    skipped INT DEFAULT 0,
    status TEXT NOT NULL,
    message TEXT,
    ran_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for crawl_logs table
CREATE INDEX IF NOT EXISTS idx_crawl_logs_source_id ON crawl_logs(source_id, ran_at DESC);

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

-- Add taxonomy columns to jobs table (idempotent)
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS career_type TEXT,
    ADD COLUMN IF NOT EXISTS contract_type TEXT,
    ADD COLUMN IF NOT EXISTS work_modality TEXT,
    ADD COLUMN IF NOT EXISTS country_name TEXT,
    ADD COLUMN IF NOT EXISTS region_code TEXT,
    ADD COLUMN IF NOT EXISTS functional_tags TEXT[],
    ADD COLUMN IF NOT EXISTS benefits TEXT[],
    ADD COLUMN IF NOT EXISTS policy_flags TEXT[],
    ADD COLUMN IF NOT EXISTS donor_context TEXT[],
    ADD COLUMN IF NOT EXISTS project_modality TEXT,
    ADD COLUMN IF NOT EXISTS procurement_vehicle TEXT,
    ADD COLUMN IF NOT EXISTS crisis_type TEXT[],
    ADD COLUMN IF NOT EXISTS response_phase TEXT,
    ADD COLUMN IF NOT EXISTS humanitarian_cluster TEXT[],
    ADD COLUMN IF NOT EXISTS surge_required BOOLEAN,
    ADD COLUMN IF NOT EXISTS deployment_timeframe TEXT,
    ADD COLUMN IF NOT EXISTS duty_station_hardship TEXT,
    ADD COLUMN IF NOT EXISTS work_hours TEXT,
    ADD COLUMN IF NOT EXISTS contract_duration_months INT,
    ADD COLUMN IF NOT EXISTS contract_urgency TEXT,
    ADD COLUMN IF NOT EXISTS application_window JSONB,
    ADD COLUMN IF NOT EXISTS compensation_visible BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS compensation_type TEXT,
    ADD COLUMN IF NOT EXISTS compensation_min_usd NUMERIC,
    ADD COLUMN IF NOT EXISTS compensation_max_usd NUMERIC,
    ADD COLUMN IF NOT EXISTS compensation_currency TEXT,
    ADD COLUMN IF NOT EXISTS compensation_confidence NUMERIC,
    ADD COLUMN IF NOT EXISTS data_provenance TEXT,
    ADD COLUMN IF NOT EXISTS freshness_days INT,
    ADD COLUMN IF NOT EXISTS duplicate_of UUID,
    ADD COLUMN IF NOT EXISTS raw_metadata JSONB;

-- Indexes for jobs table
CREATE INDEX IF NOT EXISTS idx_jobs_search_tsv ON jobs USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_jobs_status_deadline ON jobs(status, deadline);
CREATE INDEX IF NOT EXISTS idx_jobs_country ON jobs(country);
CREATE INDEX IF NOT EXISTS idx_jobs_level_norm ON jobs(level_norm);
CREATE INDEX IF NOT EXISTS idx_jobs_international_eligible ON jobs(international_eligible);
CREATE INDEX IF NOT EXISTS idx_jobs_career_type ON jobs(career_type);
CREATE INDEX IF NOT EXISTS idx_jobs_org_type ON jobs(org_name);
CREATE INDEX IF NOT EXISTS idx_jobs_country_iso ON jobs(country_iso);
CREATE INDEX IF NOT EXISTS idx_jobs_international ON jobs(international_eligible);
CREATE INDEX IF NOT EXISTS idx_jobs_response_phase ON jobs(response_phase);

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
