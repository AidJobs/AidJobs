#!/usr/bin/env python3
"""Check enrichment status of jobs."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from app.db_config import db_config

conn_params = db_config.get_connection_params()
conn = psycopg2.connect(**conn_params)
cur = conn.cursor()

cur.execute("""
    SELECT 
        COUNT(*) as total,
        COUNT(enriched_at) as enriched,
        COUNT(CASE WHEN impact_domain IS NOT NULL THEN 1 END) as has_impact,
        COUNT(CASE WHEN functional_role IS NOT NULL THEN 1 END) as has_role
    FROM jobs 
    WHERE status = 'active'
""")
row = cur.fetchone()

print(f"Total active jobs: {row[0]}")
print(f"Enriched jobs: {row[1]}")
print(f"Jobs with impact domain: {row[2]}")
print(f"Jobs with functional role: {row[3]}")

cur.close()
conn.close()

