-- Phase 4: Location Geocoding Migration
-- Adds columns for storing geocoded location data
-- Idempotent - safe to run multiple times

-- Add geocoding columns to jobs table
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS geocoding_source TEXT,
    ADD COLUMN IF NOT EXISTS is_remote BOOLEAN DEFAULT FALSE;

-- Add indexes for location-based queries
CREATE INDEX IF NOT EXISTS idx_jobs_latitude_longitude ON jobs(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_is_remote ON jobs(is_remote);
CREATE INDEX IF NOT EXISTS idx_jobs_geocoded_at ON jobs(geocoded_at);

-- Add comment for documentation
COMMENT ON COLUMN jobs.latitude IS 'Latitude from geocoding (decimal degrees)';
COMMENT ON COLUMN jobs.longitude IS 'Longitude from geocoding (decimal degrees)';
COMMENT ON COLUMN jobs.geocoded_at IS 'Timestamp when location was geocoded';
COMMENT ON COLUMN jobs.geocoding_source IS 'Source of geocoding: nominatim, google, or heuristic';
COMMENT ON COLUMN jobs.is_remote IS 'True if job is remote/work from home';

