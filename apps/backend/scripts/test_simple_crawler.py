"""
Test the new simple crawler with UNESCO source.
"""

import os
import sys
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        pass

from crawler_v2.orchestrator import SimpleOrchestrator

async def test():
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: Database URL not set")
        return
    
    print("=" * 80)
    print("TESTING SIMPLE CRAWLER")
    print("=" * 80)
    print()
    
    orchestrator = SimpleOrchestrator(db_url)
    
    # Get UNESCO source
    sources = orchestrator.get_active_sources(10)
    unesco_source = None
    
    for source in sources:
        if 'unesco' in source.get('org_name', '').lower() or 'unesco' in source.get('careers_url', '').lower():
            unesco_source = source
            break
    
    if not unesco_source:
        print("❌ No UNESCO source found")
        print("\nAvailable sources:")
        for s in sources:
            print(f"  - {s.get('org_name')} ({s.get('source_type')})")
        return
    
    print(f"Found source: {unesco_source.get('org_name')}")
    print(f"URL: {unesco_source.get('careers_url')}")
    print(f"Type: {unesco_source.get('source_type')}")
    print()
    
    # Crawl it
    print("Crawling...")
    result = await orchestrator.crawl_source(unesco_source)
    
    print()
    print("=" * 80)
    print("RESULTS")
    print("=" * 80)
    print(f"Status: {result['status']}")
    print(f"Message: {result['message']}")
    print(f"Found: {result['counts']['found']}")
    print(f"Inserted: {result['counts']['inserted']}")
    print(f"Updated: {result['counts']['updated']}")
    print(f"Skipped: {result['counts']['skipped']}")

if __name__ == '__main__':
    asyncio.run(test())

