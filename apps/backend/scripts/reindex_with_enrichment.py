#!/usr/bin/env python3
"""
Reindex Meilisearch to include enrichment fields.
This ensures enriched jobs are searchable with their enrichment data.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.search import search_service
import asyncio

async def main():
    print("Reindexing Meilisearch with Enrichment Fields")
    print("=" * 60)
    
    print("Starting reindex...")
    result = await search_service.reindex_jobs()
    
    print("\n" + "=" * 60)
    if result.get("error"):
        print(f"[ERROR] Reindex failed: {result['error']}")
        sys.exit(1)
    else:
        print(f"[OK] Reindex completed successfully!")
        print(f"  Indexed: {result.get('indexed', 0)} jobs")
        print(f"  Skipped: {result.get('skipped', 0)} jobs")
        print(f"  Duration: {result.get('duration_ms', 0)}ms")
        print("\nEnrichment fields are now searchable in Meilisearch!")

if __name__ == "__main__":
    asyncio.run(main())

