# Enterprise Job Deletion System - Deployment Instructions

## Database Migration

Before using the new job deletion feature, you must run the database migration:

### Option 1: Using psql (Recommended)

```bash
# Set your database URL
export DATABASE_URL="your-postgresql-connection-string"

# Run the migration
psql $DATABASE_URL -f infra/migrations/add_job_deletion_audit.sql
```

### Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `infra/migrations/add_job_deletion_audit.sql`
4. Execute the SQL

### Option 3: Using Render Database

1. Connect to your Render PostgreSQL database
2. Run the SQL from `infra/migrations/add_job_deletion_audit.sql`

## Verification

After running the migration, verify it was successful:

```sql
-- Check if audit table exists
SELECT * FROM job_deletion_audit LIMIT 1;

-- Check if soft delete columns exist
SELECT deleted_at, deleted_by, deletion_reason FROM jobs LIMIT 1;

-- Test the impact function
SELECT * FROM get_deletion_impact('your-source-uuid-here');
```

## Usage

### 1. Access the Feature

1. Go to Admin → Sources
2. Find the source you want to delete jobs from
3. Click the **red trash icon** (Delete Jobs) in the actions column

### 2. Review Impact Analysis

The modal will automatically show:
- Total jobs that will be deleted
- Active jobs count
- Related data impact (shortlists, enrichment history, etc.)

### 3. Configure Deletion Options

- **Deletion Type**: Choose Soft Delete (recoverable) or Hard Delete (permanent)
- **Dry Run Mode**: Enabled by default - preview what will be deleted
- **Export Data**: Optional - download job data as JSON before deletion
- **Trigger Crawl**: Optional - automatically start fresh crawl after deletion
- **Deletion Reason**: Required for hard deletes (for audit trail)

### 4. Execute Deletion

1. **First**: Run a dry-run to see what will be deleted
2. **Review**: Check the dry-run results
3. **Proceed**: If satisfied, disable dry-run and execute actual deletion

## Best Practices

1. **Always run dry-run first** - See what will be deleted before committing
2. **Use soft delete for UNDP** - Allows recovery if needed
3. **Export data before hard delete** - Keep a backup
4. **Provide clear deletion reason** - Helps with audit trail
5. **Trigger crawl after deletion** - Repopulate with correct data

## UNDP Specific Workflow

For fixing UNDP jobs with incorrect apply_urls:

1. Go to Admin → Sources
2. Find UNDP source
3. Click Delete Jobs (red trash icon)
4. Select **Soft Delete** (recommended)
5. Enable **Dry Run** first
6. Review impact
7. Disable dry-run and execute
8. Enable **Trigger Crawl** to repopulate with correct URLs
9. Click "Soft Delete Jobs"

## Audit Trail

All deletions are logged in `job_deletion_audit` table with:
- Who deleted (admin email)
- When deleted
- How many jobs
- Deletion type (soft/hard)
- Reason (if provided)
- Metadata (export, crawl trigger, etc.)

## Recovery (Soft Delete Only)

Soft-deleted jobs can be recovered by:
```sql
-- Restore soft-deleted jobs
UPDATE jobs 
SET deleted_at = NULL, 
    deleted_by = NULL, 
    deletion_reason = NULL,
    status = 'active'
WHERE source_id = 'your-source-uuid' 
  AND deleted_at IS NOT NULL;
```

## Troubleshooting

### Migration Fails
- Check database permissions
- Ensure PostgreSQL version supports all features
- Verify connection string is correct

### Impact Analysis Shows 0 Jobs
- Jobs may already be deleted
- Check source_id is correct
- Verify jobs table has data for that source

### Deletion Takes Too Long
- System uses batch processing (1000 jobs per batch)
- Large deletions may take several minutes
- Progress is logged in backend

### Frontend Shows Error
- Check browser console for details
- Verify API endpoints are accessible
- Ensure admin authentication is working

