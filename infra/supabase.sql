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
    org_type TEXT,
    status TEXT DEFAULT 'active',
    crawl_frequency_days INT DEFAULT 3,
    next_run_at TIMESTAMPTZ,
    last_crawled_at TIMESTAMPTZ,
    last_crawl_status TEXT,
    last_crawl_message TEXT,
    consecutive_failures INT DEFAULT 0,
    consecutive_nochange INT DEFAULT 0,
    parser_hint TEXT,
    time_window TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns to sources if missing (idempotent)
ALTER TABLE sources 
    ADD COLUMN IF NOT EXISTS org_type TEXT,
    ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_crawl_message TEXT,
    ADD COLUMN IF NOT EXISTS consecutive_failures INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS consecutive_nochange INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS time_window TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create indexes for sources table
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
CREATE INDEX IF NOT EXISTS idx_sources_next_run_at ON sources(next_run_at);
CREATE INDEX IF NOT EXISTS idx_sources_org_type ON sources(org_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_careers_url ON sources(careers_url);

-- Crawl logs table: track crawl execution history
CREATE TABLE IF NOT EXISTS crawl_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
    ran_at TIMESTAMPTZ DEFAULT NOW(),
    duration_ms INT,
    found INT DEFAULT 0,
    inserted INT DEFAULT 0,
    updated INT DEFAULT 0,
    skipped INT DEFAULT 0,
    status TEXT NOT NULL,
    message TEXT
);

-- Add duration_ms column if missing (idempotent)
ALTER TABLE crawl_logs ADD COLUMN IF NOT EXISTS duration_ms INT;

-- Create index for crawl_logs table
CREATE INDEX IF NOT EXISTS idx_crawl_logs_source_id ON crawl_logs(source_id, ran_at DESC);

-- Crawl locks table: advisory locks for concurrent crawling
CREATE TABLE IF NOT EXISTS crawl_locks (
    source_id UUID PRIMARY KEY,
    locked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Domain policies table: per-domain safety and rate limiting
CREATE TABLE IF NOT EXISTS domain_policies (
    host TEXT PRIMARY KEY,
    max_concurrency INT DEFAULT 1,
    min_request_interval_ms INT DEFAULT 3000,
    max_pages INT DEFAULT 10,
    max_kb_per_page INT DEFAULT 1024,
    allow_js BOOLEAN DEFAULT FALSE,
    last_seen_status TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Robots cache table: cached robots.txt data
CREATE TABLE IF NOT EXISTS robots_cache (
    host TEXT PRIMARY KEY,
    robots_txt TEXT,
    fetched_at TIMESTAMPTZ,
    crawl_delay_ms INT,
    disallow JSONB
);

-- Takedowns table: domains/URLs to exclude from crawling
CREATE TABLE IF NOT EXISTS takedowns (
    domain_or_url TEXT PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link validations table: cache for apply URL validation results
CREATE TABLE IF NOT EXISTS link_validations (
    url TEXT PRIMARY KEY,
    is_valid BOOLEAN NOT NULL,
    status_code INT,
    final_url TEXT,
    redirect_count INT DEFAULT 0,
    error_message TEXT,
    validated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for link validations (for cleanup of old entries)
CREATE INDEX IF NOT EXISTS idx_link_validations_validated_at ON link_validations(validated_at);

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
    ADD COLUMN IF NOT EXISTS org_type TEXT,
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

-- Add enrichment columns to jobs table (idempotent)
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS impact_domain TEXT[],
    ADD COLUMN IF NOT EXISTS impact_confidences JSONB,
    ADD COLUMN IF NOT EXISTS functional_role TEXT[],
    ADD COLUMN IF NOT EXISTS functional_confidences JSONB,
    ADD COLUMN IF NOT EXISTS experience_level TEXT,
    ADD COLUMN IF NOT EXISTS estimated_experience_years JSONB,
    ADD COLUMN IF NOT EXISTS experience_confidence NUMERIC,
    ADD COLUMN IF NOT EXISTS sdgs INTEGER[],
    ADD COLUMN IF NOT EXISTS sdg_confidences JSONB,
    ADD COLUMN IF NOT EXISTS sdg_explanation TEXT,
    ADD COLUMN IF NOT EXISTS matched_keywords TEXT[],
    ADD COLUMN IF NOT EXISTS confidence_overall NUMERIC,
    ADD COLUMN IF NOT EXISTS low_confidence BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS low_confidence_reason TEXT,
    ADD COLUMN IF NOT EXISTS embedding_input TEXT,
    ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS enrichment_version INTEGER DEFAULT 1;

-- Add soft deletion columns to jobs table (idempotent)
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- Add data quality columns to jobs table (idempotent)
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS data_quality_score INTEGER,
    ADD COLUMN IF NOT EXISTS data_quality_issues JSONB;

-- Create index for enrichment fields
CREATE INDEX IF NOT EXISTS idx_jobs_impact_domain ON jobs USING GIN(impact_domain);
CREATE INDEX IF NOT EXISTS idx_jobs_functional_role ON jobs USING GIN(functional_role);
CREATE INDEX IF NOT EXISTS idx_jobs_experience_level ON jobs(experience_level);
CREATE INDEX IF NOT EXISTS idx_jobs_sdgs ON jobs USING GIN(sdgs);
CREATE INDEX IF NOT EXISTS idx_jobs_low_confidence ON jobs(low_confidence) WHERE low_confidence = TRUE;
CREATE INDEX IF NOT EXISTS idx_jobs_enriched_at ON jobs(enriched_at);

-- Index for soft deletion queries (only index non-null values for performance)
CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at ON jobs(deleted_at) WHERE deleted_at IS NOT NULL;

-- Index for data quality filtering
CREATE INDEX IF NOT EXISTS idx_jobs_quality_score ON jobs(data_quality_score) WHERE data_quality_score IS NOT NULL;

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
CREATE TABLE IF NOT EXISTS find_earn_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    source_type TEXT,
    status TEXT DEFAULT 'pending',
    detected_jobs INT DEFAULT 0,
    notes TEXT,
    submitted_by TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (url)
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

-- Enrichment Review Queue: Quality assurance for low-confidence enrichments
CREATE TABLE IF NOT EXISTS enrichment_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_review')),
    reviewer_id UUID,  -- Admin user who reviewed
    review_notes TEXT,
    original_enrichment JSONB,  -- Snapshot of enrichment at time of review
    corrected_enrichment JSONB,  -- Corrected values if any
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_reviews_job_id ON enrichment_reviews(job_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_reviews_status ON enrichment_reviews(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_enrichment_reviews_created_at ON enrichment_reviews(created_at);

-- Enrichment History: Audit trail of all enrichment changes
CREATE TABLE IF NOT EXISTS enrichment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    enrichment_before JSONB,  -- Snapshot before change
    enrichment_after JSONB,  -- Snapshot after change
    changed_fields TEXT[],  -- List of fields that changed
    change_reason TEXT,  -- Why the change was made (auto-enrichment, manual correction, etc.)
    changed_by TEXT,  -- 'system', 'admin', 'ai_service', etc.
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    enrichment_version INTEGER
);

CREATE INDEX IF NOT EXISTS idx_enrichment_history_job_id ON enrichment_history(job_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_history_changed_at ON enrichment_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_enrichment_history_changed_by ON enrichment_history(changed_by);

-- Enrichment Feedback: Human corrections to learn from
CREATE TABLE IF NOT EXISTS enrichment_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    feedback_type TEXT CHECK (feedback_type IN ('correction', 'flag_incorrect', 'flag_missing')),
    field_name TEXT,  -- Which field was incorrect (impact_domain, experience_level, etc.)
    original_value TEXT,  -- What the AI said
    corrected_value TEXT,  -- What it should be
    feedback_notes TEXT,
    submitted_by UUID,  -- User/admin who submitted feedback
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,  -- Whether feedback has been used for learning
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_enrichment_feedback_job_id ON enrichment_feedback(job_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_feedback_processed ON enrichment_feedback(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_enrichment_feedback_field ON enrichment_feedback(field_name);

-- Enrichment Ground Truth: Manually labeled test set for accuracy validation
CREATE TABLE IF NOT EXISTS enrichment_ground_truth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description_snippet TEXT,
    org_name TEXT,
    location_raw TEXT,
    -- Ground truth labels
    impact_domain TEXT[],
    functional_role TEXT[],
    experience_level TEXT,
    sdgs INTEGER[],
    -- Metadata
    labeled_by TEXT,  -- Who created this ground truth
    labeled_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_enrichment_ground_truth_job_id ON enrichment_ground_truth(job_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_ground_truth_active ON enrichment_ground_truth(is_active) WHERE is_active = TRUE;

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
    USING (user_id::text = auth.uid()::text)
    WITH CHECK (user_id::text = auth.uid()::text);

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

-- Find & Earn submissions: public insert, admin read/update
ALTER TABLE find_earn_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_insert_find_earn ON find_earn_submissions;
CREATE POLICY public_insert_find_earn ON find_earn_submissions
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS admin_manage_find_earn ON find_earn_submissions;
CREATE POLICY admin_manage_find_earn ON find_earn_submissions
    FOR ALL
    TO service_role
    USING (true);
