-- Add country, country_iso, and city columns if missing
-- These columns are used by the geocoding system but were not included in phase4_geocoding.sql
-- Idempotent - safe to run multiple times

ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS country TEXT,
    ADD COLUMN IF NOT EXISTS country_iso TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT;

-- Add indexes for location-based queries
CREATE INDEX IF NOT EXISTS idx_jobs_country ON jobs(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_country_iso ON jobs(country_iso) WHERE country_iso IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city) WHERE city IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN jobs.country IS 'Country name from geocoding or extraction';
COMMENT ON COLUMN jobs.country_iso IS 'ISO country code (e.g., US, GB, NG)';
COMMENT ON COLUMN jobs.city IS 'City name from geocoding or extraction';



