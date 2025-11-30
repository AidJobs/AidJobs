-- Enterprise Job Deletion System
-- Adds audit logging, soft delete, and impact analysis

-- Audit log for job deletions
CREATE TABLE IF NOT EXISTS job_deletion_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
    deleted_by TEXT NOT NULL,  -- Admin email or 'system'
    deletion_type TEXT NOT NULL CHECK (deletion_type IN ('hard', 'soft', 'batch')),
    jobs_count INT NOT NULL,
    deletion_reason TEXT,
    metadata JSONB,  -- Store additional context (dry_run, trigger_crawl, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_deletion_audit_source_id ON job_deletion_audit(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_deletion_audit_deleted_by ON job_deletion_audit(deleted_by);
CREATE INDEX IF NOT EXISTS idx_job_deletion_audit_created_at ON job_deletion_audit(created_at DESC);

-- Add soft delete columns to jobs table (idempotent)
ALTER TABLE jobs 
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by TEXT,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- Index for soft-deleted jobs
CREATE INDEX IF NOT EXISTS idx_jobs_deleted_at ON jobs(deleted_at) WHERE deleted_at IS NOT NULL;

-- Function to get deletion impact summary
CREATE OR REPLACE FUNCTION get_deletion_impact(source_uuid UUID)
RETURNS TABLE (
    total_jobs INT,
    active_jobs INT,
    shortlists_count INT,
    enrichment_reviews_count INT,
    enrichment_history_count INT,
    enrichment_feedback_count INT,
    ground_truth_count INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INT as total_jobs,
        COUNT(*) FILTER (WHERE status = 'active' AND deleted_at IS NULL)::INT as active_jobs,
        (SELECT COUNT(*)::INT FROM shortlists s 
         INNER JOIN jobs j ON s.job_id = j.id 
         WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as shortlists_count,
        (SELECT COUNT(*)::INT FROM enrichment_reviews er
         INNER JOIN jobs j ON er.job_id = j.id
         WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as enrichment_reviews_count,
        (SELECT COUNT(*)::INT FROM enrichment_history eh
         INNER JOIN jobs j ON eh.job_id = j.id
         WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as enrichment_history_count,
        (SELECT COUNT(*)::INT FROM enrichment_feedback ef
         INNER JOIN jobs j ON ef.job_id = j.id
         WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as enrichment_feedback_count,
        (SELECT COUNT(*)::INT FROM enrichment_ground_truth egt
         INNER JOIN jobs j ON egt.job_id = j.id
         WHERE j.source_id = source_uuid AND j.deleted_at IS NULL) as ground_truth_count
    FROM jobs
    WHERE source_id = source_uuid AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

