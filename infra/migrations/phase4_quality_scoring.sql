-- Phase 4: Data Quality Scoring Migration
-- Adds columns for storing quality scores
-- Idempotent - safe to run multiple times

-- Add quality scoring columns to jobs table
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS quality_score NUMERIC(3, 2),
    ADD COLUMN IF NOT EXISTS quality_grade TEXT,
    ADD COLUMN IF NOT EXISTS quality_factors JSONB,
    ADD COLUMN IF NOT EXISTS quality_issues TEXT[],
    ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS quality_scored_at TIMESTAMPTZ;

-- Add indexes for quality-based queries
CREATE INDEX IF NOT EXISTS idx_jobs_quality_score ON jobs(quality_score) WHERE quality_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_quality_grade ON jobs(quality_grade);
CREATE INDEX IF NOT EXISTS idx_jobs_needs_review ON jobs(needs_review) WHERE needs_review = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN jobs.quality_score IS 'Data quality score (0.0 to 1.0)';
COMMENT ON COLUMN jobs.quality_grade IS 'Quality grade: high, medium, low, very_low';
COMMENT ON COLUMN jobs.quality_factors IS 'JSON object with individual field scores';
COMMENT ON COLUMN jobs.quality_issues IS 'Array of data quality issues found';
COMMENT ON COLUMN jobs.needs_review IS 'True if job needs manual review';
COMMENT ON COLUMN jobs.quality_scored_at IS 'Timestamp when quality was scored';

