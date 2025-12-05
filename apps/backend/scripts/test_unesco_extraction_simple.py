"""
Simple test to see what UNESCO extraction is actually finding.
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

from crawler_v2.simple_crawler import SimpleCrawler

async def test():
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: Database URL not set")
        return
    
    url = "https://careers.unesco.org/go/All-jobs-openings/782502/"
    
    print("=" * 80)
    print("TESTING UNESCO EXTRACTION")
    print("=" * 80)
    print(f"URL: {url}\n")
    
    import os
    use_ai = bool(os.getenv('OPENROUTER_API_KEY'))
    crawler = SimpleCrawler(db_url, use_ai=use_ai)
    
    # Step 1: Fetch HTML
    print("Step 1: Fetching HTML...")
    status, html = await crawler.fetch_html(url)
    print(f"  Status: {status}")
    print(f"  Size: {len(html)} bytes")
    
    if status != 200:
        print(f"❌ Failed to fetch: HTTP {status}")
        return
    
    # Step 2: Extract jobs
    print("\nStep 2: Extracting jobs...")
    jobs = crawler.extract_jobs_from_html(html, url)
    print(f"  Jobs found: {len(jobs)}")
    
    if jobs:
        print("\nSample jobs:")
        for i, job in enumerate(jobs[:5], 1):
            print(f"\n{i}. Title: {job.get('title', 'N/A')[:60]}")
            print(f"   URL: {job.get('apply_url', 'N/A')[:80]}")
            print(f"   Location: {job.get('location_raw', 'N/A')[:40]}")
    else:
        print("\n❌ No jobs extracted!")
        print("\nDebugging...")
        print(f"HTML length: {len(html)}")
        print(f"HTML preview (first 500 chars):")
        print(html[:500])
        
        # Check if table exists
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')
        tables = soup.find_all('table')
        print(f"\nTables found: {len(tables)}")
        if tables:
            print(f"First table preview:")
            print(str(tables[0])[:500])

if __name__ == '__main__':
    asyncio.run(test())

