#!/usr/bin/env python3
"""
Shadow test script for global extraction improvements.
Tests up to 5 active sources with the new heuristics enabled.
"""
import os
import sys
import json
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Optional
from urllib.parse import urlparse

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from crawler_v2.simple_crawler import SimpleCrawler
import psycopg2
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

REPORT_DIR = Path(__file__).parent.parent / "report"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

# Limit Playwright concurrency
PLAYWRIGHT_CONCURRENCY = 2


def get_db_url():
    """Get database URL from environment."""
    return os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")


def get_active_sources(db_url: str, limit: int = 5) -> List[Dict]:
    """Get up to 5 active sources, preferring recently run ones."""
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, org_name, careers_url, source_type, status, last_run_at
                FROM sources
                WHERE status = 'active'
                ORDER BY 
                    CASE WHEN last_run_at IS NOT NULL THEN 1 ELSE 2 END,
                    last_run_at DESC NULLS LAST,
                    created_at DESC
                LIMIT %s
            """, (limit,))
            
            sources = cur.fetchall()
            return [dict(s) for s in sources]
    finally:
        conn.close()


async def run_shadow_crawl(crawler: SimpleCrawler, source: Dict, db_url: str) -> Dict:
    """Run a shadow crawl for a single source."""
    source_id = str(source['id'])
    org_name = source['org_name']
    careers_url = source['careers_url']
    domain = urlparse(careers_url).netloc.replace('www.', '').replace('.', '_')
    
    logger.info(f"\n{'='*80}\nShadow crawling: {org_name} ({careers_url})\n{'='*80}")
    
        try:
        # Run crawl
        source_dict = {
            'id': source_id,
            'org_name': org_name,
            'careers_url': careers_url,
            'source_type': source.get('source_type', 'html')
        }
        result = await crawler.crawl_source(source_dict)
        
        # Extract stats from result
        counts = result.get('counts', {})
        pages_crawled = result.get('pages_crawled', 1)  # Default to 1 for listing page
        total_links_found = result.get('total_links_found', 0)
        job_links_identified = result.get('job_links_identified', 0)
        jobs_extracted = counts.get('found', 0)
        
        # Get save_jobs results
        jobs_saved = counts.get('inserted', 0) + counts.get('updated', 0)
        jobs_skipped = counts.get('skipped', 0)
        jobs_failed = counts.get('failed', 0)
        
        # Query jobs_side table to confirm
        conn = psycopg2.connect(db_url)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT COUNT(*) as count
                    FROM jobs_side
                    WHERE source_id = %s
                """, (source_id,))
                saved_count = cur.fetchone()['count']
        finally:
            conn.close()
        
        return {
            'source_id': source_id,
            'org_name': org_name,
            'careers_url': careers_url,
            'domain': domain,
            'status': result.get('status', 'unknown'),
            'pages_crawled': pages_crawled,
            'total_links_found': total_links_found,
            'job_links_identified': job_links_identified,
            'jobs_extracted': jobs_extracted,
            'jobs_saved_to_side_table': saved_count,
            'jobs_skipped': jobs_skipped,
            'jobs_failed': jobs_failed,
            'skip_reasons': save_results.get('skip_reasons', {}),
            'error': result.get('error')
        }
    except Exception as e:
        logger.error(f"Error crawling {org_name}: {e}", exc_info=True)
        return {
            'source_id': source_id,
            'org_name': org_name,
            'careers_url': careers_url,
            'domain': domain,
            'status': 'error',
            'error': str(e),
            'pages_crawled': 0,
            'total_links_found': 0,
            'job_links_identified': 0,
            'jobs_extracted': 0,
            'jobs_saved_to_side_table': 0,
            'jobs_skipped': 0,
            'jobs_failed': 0
        }


async def main():
    """Main shadow test function."""
    # Ensure global heuristics are enabled
    os.environ['EXTRACTION_GLOBAL_HEURISTICS'] = 'true'
    
    db_url = get_db_url()
    if not db_url:
        logger.error("Database URL not configured")
        sys.exit(1)
    
    # Ensure jobs_side table exists
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS jobs_side (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    source_id UUID,
                    org_name TEXT,
                    title TEXT,
                    apply_url TEXT,
                    location_raw TEXT,
                    status TEXT DEFAULT 'active',
                    fetched_at TIMESTAMPTZ DEFAULT NOW(),
                    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            conn.commit()
    finally:
        conn.close()
    
    # Get active sources
    sources = get_active_sources(db_url, limit=5)
    if not sources:
        logger.error("No active sources found")
        sys.exit(1)
    
    logger.info(f"Found {len(sources)} active sources for shadow test")
    
    # Initialize crawler with shadow mode
    crawler = SimpleCrawler(db_url=db_url, use_ai=False, shadow_mode=True)
    
    # Run shadow crawls
    results = []
    for source in sources:
        result = await run_shadow_crawl(crawler, source, db_url)
        results.append(result)
        
        # Generate per-domain report
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        domain = result['domain']
        report_file = REPORT_DIR / f"shadow_test_{domain}_{timestamp}.json"
        
        report_data = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'source': {
                'id': result['source_id'],
                'org_name': result['org_name'],
                'careers_url': result['careers_url']
            },
            'config': {
                'shadow_mode': True,
                'global_heuristics': True,
                'playwright_concurrency': PLAYWRIGHT_CONCURRENCY
            },
            'results': result,
            'summary': {
                'pages_crawled': result['pages_crawled'],
                'jobs_found': result['jobs_extracted'],
                'jobs_saved_to_side_table': result['jobs_saved_to_side_table'],
                'jobs_skipped': result['jobs_skipped'],
                'jobs_failed': result['jobs_failed']
            }
        }
        
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Report saved: {report_file}")
        
        # Print summary
        print(f"\n{result['org_name']} ({result['domain']}):")
        print(f"  Pages crawled: {result['pages_crawled']}")
        print(f"  Jobs found: {result['jobs_extracted']}")
        print(f"  Jobs saved to side table: {result['jobs_saved_to_side_table']}")
        print(f"  Jobs skipped: {result['jobs_skipped']}")
        if result.get('error'):
            print(f"  Error: {result['error']}")
    
    # Print final summary
    print("\n" + "="*80)
    print("SHADOW TEST COMPLETE")
    print("="*80)
    for result in results:
        print(f"\n{result['org_name']}:")
        print(f"  Pages crawled: {result['pages_crawled']}")
        print(f"  Jobs found: {result['jobs_extracted']}")
        print(f"  Jobs saved to side table: {result['jobs_saved_to_side_table']}")


if __name__ == "__main__":
    asyncio.run(main())

