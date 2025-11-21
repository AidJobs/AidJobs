#!/usr/bin/env python3
"""
Test the search API to verify enrichment fields are returned.
"""
import os
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.search import search_service

async def main():
    print("Testing Search API with Enrichment Fields")
    print("=" * 60)
    
    # Test search
    result = await search_service.search_query(
        q="",
        page=1,
        size=5,
    )
    
    print(f"Total jobs: {result.get('total', 0)}")
    print(f"Returned: {len(result.get('items', []))} items")
    print(f"Source: {result.get('source', 'unknown')}")
    print()
    
    if result.get('items'):
        print("Sample job with enrichment fields:")
        print("-" * 60)
        job = result['items'][0]
        print(f"Title: {job.get('title', 'N/A')}")
        print(f"Org: {job.get('org_name', 'N/A')}")
        print(f"Impact Domain: {job.get('impact_domain', [])}")
        print(f"Functional Role: {job.get('functional_role', [])}")
        print(f"Experience Level: {job.get('experience_level', 'N/A')}")
        print(f"SDGs: {job.get('sdgs', [])}")
        print(f"Match Score: {job.get('match_score', 'N/A')}")
        print(f"Top Reasons: {job.get('top_reasons', [])}")
        print()
        
        # Count enriched jobs
        enriched_count = sum(1 for j in result['items'] if j.get('enriched_at') or j.get('impact_domain'))
        print(f"Enriched jobs in results: {enriched_count} out of {len(result['items'])}")
    else:
        print("No jobs returned")

if __name__ == "__main__":
    asyncio.run(main())

