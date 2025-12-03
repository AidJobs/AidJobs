# Meilisearch Sync Script

## Purpose

After hard-deleting jobs from the database, their IDs may still exist in Meilisearch, causing them to appear in search results even though they're gone from the database.

This script removes orphaned job IDs from Meilisearch that no longer exist in the database.

## Usage

### 1. Dry Run (Recommended First)

Check what would be deleted without actually deleting:

```bash
cd apps/backend
python scripts/sync_meilisearch.py
```

This will show:
- How many jobs are in Meilisearch
- How many jobs are in database
- How many orphaned IDs would be deleted
- Sample of orphaned IDs

### 2. Execute Sync

After reviewing the dry run, actually delete orphaned jobs:

```bash
python scripts/sync_meilisearch.py --execute
```

## Requirements

- `MEILISEARCH_URL` or `MEILI_HOST` environment variable
- `MEILISEARCH_KEY` or `MEILI_API_KEY` environment variable
- `SUPABASE_DB_URL` or `DATABASE_URL` environment variable
- `meilisearch` Python package installed
- `psycopg2` Python package installed

## What It Does

1. Fetches all job IDs from Meilisearch
2. Fetches all job IDs from database
3. Finds IDs that exist in Meilisearch but not in database (orphaned)
4. Deletes orphaned IDs from Meilisearch (in batches of 100)

## When to Use

- After hard-deleting jobs from database
- When search results show jobs that don't exist in database
- Before reindexing Meilisearch (clean up first)
- Periodically to keep Meilisearch in sync

## Safety

- Default mode is **dry-run** (safe, no changes)
- Must use `--execute` flag to actually delete
- Deletes in batches with error handling
- Logs all operations for audit trail

