# Trinity Search - Next Steps Guide

## Step 1: Run Database Migration

You have two options:

### Option A: Use apply_sql.py (Recommended - applies full schema)
```bash
cd apps/backend
python scripts/apply_sql.py
```

This will apply the entire `infra/supabase.sql` file, including all enrichment columns.

**Requirements**: Set `SUPABASE_DB_URL` environment variable first.

### Option B: Use run_migration.py (Adds only new columns)
```bash
cd apps/backend
python scripts/run_migration.py
```

**Requirements**: Set `SUPABASE_DB_URL` environment variable first.

### Setting SUPABASE_DB_URL

**On Windows (PowerShell)**:
```powershell
$env:SUPABASE_DB_URL="postgresql://postgres.yijlbzlzfahubwukulkv:ghXps3My5KPZCNn2@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

**On Linux/Mac**:
```bash
export SUPABASE_DB_URL="postgresql://postgres.yijlbzlzfahubwukulkv:ghXps3My5KPZCNn2@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

**Or create a `.env` file** in the project root:
```
SUPABASE_DB_URL=postgresql://postgres.yijlbzlzfahubwukulkv:ghXps3My5KPZCNn2@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

---

## Step 2: Configure OpenRouter API Key

Set the OpenRouter API key for AI features:

**On Windows (PowerShell)**:
```powershell
$env:OPENROUTER_API_KEY="your-openrouter-api-key-here"
$env:OPENROUTER_MODEL="openai/gpt-4o-mini"
```

**On Linux/Mac**:
```bash
export OPENROUTER_API_KEY="your-openrouter-api-key-here"
export OPENROUTER_MODEL="openai/gpt-4o-mini"
```

**Or add to `.env` file**:
```
OPENROUTER_API_KEY=your-openrouter-api-key-here
OPENROUTER_MODEL=openai/gpt-4o-mini
```

**Get your OpenRouter API key**: https://openrouter.ai/keys

---

## Step 3: Enrich Existing Jobs

After migration and API key setup, enrich your 287 existing jobs:

### Option A: Via Admin API Endpoint (after backend is running)

1. Start your backend server
2. Login to admin panel
3. Use the batch enrichment endpoint:

```bash
POST /admin/jobs/enrich/batch
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "job_ids": ["id1", "id2", "id3", ...]  # All 287 job IDs
}
```

### Option B: Create a Script

Create `apps/backend/scripts/enrich_all_jobs.py`:

```python
import os
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db_config import db_config
from app.enrichment import batch_enrich_jobs
import psycopg2
from psycopg2.extras import RealDictCursor

conn_params = db_config.get_connection_params()
conn = psycopg2.connect(**conn_params)
cursor = conn.cursor(cursor_factory=RealDictCursor)

cursor.execute("SELECT id::text FROM jobs WHERE status = 'active'")
job_ids = [row['id'] for row in cursor.fetchall()]

print(f"Enriching {len(job_ids)} jobs...")
result = batch_enrich_jobs(job_ids, batch_size=10)
print(f"Success: {result['success_count']}, Errors: {result['error_count']}")
```

---

## Step 4: Reindex Meilisearch

After enriching jobs, reindex Meilisearch to include enrichment fields:

### Via Admin API:
```bash
POST /admin/search/reindex
Authorization: Bearer <admin-token>
```

### Or via Admin UI:
- Go to Admin Dashboard → Search → Reindex

---

## Step 5: Test the System

1. **Test Query Parser**:
   ```bash
   POST /api/search/parse
   {
     "query": "WASH officer Kenya mid-level"
   }
   ```

2. **Test Autocomplete**:
   ```bash
   GET /api/search/autocomplete?q=wash
   ```

3. **Test Search**:
   - Go to homepage
   - Try natural language query: "remote gender roles in Nepal"
   - Check that autocomplete suggestions appear
   - Verify results show match scores and enrichment badges

---

## Verification Checklist

- [ ] Database migration completed (enrichment columns exist)
- [ ] OpenRouter API key configured
- [ ] Jobs enriched (check `enriched_at` column)
- [ ] Meilisearch reindexed (enrichment fields searchable)
- [ ] Query parser working (test with natural language)
- [ ] Autocomplete working (test with partial text)
- [ ] Frontend search bar showing suggestions
- [ ] Results displaying match scores and badges

---

## Troubleshooting

### Migration fails
- Check `SUPABASE_DB_URL` is set correctly
- Verify database connection string format
- Check network connectivity to Supabase

### Enrichment fails
- Verify `OPENROUTER_API_KEY` is set
- Check OpenRouter API quota/limits
- Review backend logs for errors

### Search not working
- Verify Meilisearch is reindexed
- Check enrichment fields are populated
- Test query parser endpoint directly

---

## Quick Start Commands

```powershell
# 1. Set environment variables
$env:SUPABASE_DB_URL="postgresql://postgres.yijlbzlzfahubwukulkv:ghXps3My5KPZCNn2@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
$env:OPENROUTER_API_KEY="your-key-here"

# 2. Run migration
cd apps/backend
python scripts/apply_sql.py

# 3. Start backend (in separate terminal)
cd apps/backend
python -m uvicorn main:app --reload

# 4. Enrich jobs (via API or script)
# 5. Reindex Meilisearch (via admin UI or API)
```

