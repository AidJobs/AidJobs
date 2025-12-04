-- Add index on operation column for faster validation error queries
CREATE INDEX IF NOT EXISTS idx_failed_inserts_operation ON failed_inserts(operation) WHERE operation IS NOT NULL;

