"""
Test script for UNESCO/UNDP extraction.

This script:
1. Finds UNESCO/UNDP sources in the database
2. Runs a test crawl (simulation mode)
3. Shows extracted data (title, location, deadline)
4. Verifies data quality scores
5. Shows repair logs if any
"""

import os
import sys
import asyncio
import logging
from typing import Dict, List, Optional

# Add parent directory to path (apps/backend)
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

import psycopg2
from psycopg2.extras import RealDictCursor

# Load environment variables from .env file if it exists
env_path = os.path.join(backend_dir, '.env')
if os.path.exists(env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
        print(f"Loaded .env file from {env_path}")
    except ImportError:
        # dotenv not available, use system environment variables
        print("Note: python-dotenv not available, using system environment variables")
        pass
else:
    print(f"Note: .env file not found at {env_path}, using system environment variables")

# Change to backend directory for imports
os.chdir(backend_dir)

from crawler.html_fetch import HTMLCrawler
from crawler.rss_fetch import RSSCrawler
from crawler.api_fetch import APICrawler

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_db_url():
    """Get database URL from environment"""
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("No database URL found. Set SUPABASE_DB_URL or DATABASE_URL")
    return db_url


def get_db_conn():
    """Get database connection"""
    return psycopg2.connect(get_db_url())


def find_sources(org_names: Optional[List[str]] = None) -> List[Dict]:
    """Find sources by organization name"""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if org_names:
                placeholders = ','.join(['%s'] * len(org_names))
                cur.execute(f"""
                    SELECT id, org_name, careers_url, source_type, status, parser_hint
                    FROM sources
                    WHERE org_name ILIKE ANY(ARRAY[{placeholders}])
                    AND status = 'active'
                    ORDER BY org_name
                """, [f'%{name}%' for name in org_names])
            else:
                # Find UNESCO and UNDP by default
                cur.execute("""
                    SELECT id, org_name, careers_url, source_type, status, parser_hint
                    FROM sources
                    WHERE (org_name ILIKE '%unesco%' OR org_name ILIKE '%undp%')
                    AND status = 'active'
                    ORDER BY org_name
                """)
            
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


async def test_source_extraction(source: Dict, dry_run: bool = True) -> Dict:
    """
    Test extraction for a single source.
    
    Args:
        source: Source dictionary with id, org_name, careers_url, source_type
        dry_run: If True, only fetch and extract, don't save to database
    
    Returns:
        Dictionary with extraction results
    """
    db_url = get_db_url()
    source_id = str(source['id'])
    org_name = source['org_name']
    careers_url = source['careers_url']
    source_type = source.get('source_type', 'html')
    
    logger.info(f"\n{'='*80}")
    logger.info(f"Testing extraction for: {org_name}")
    logger.info(f"URL: {careers_url}")
    logger.info(f"Type: {source_type}")
    logger.info(f"{'='*80}\n")
    
    results = {
        'source': org_name,
        'url': careers_url,
        'type': source_type,
        'jobs_found': 0,
        'jobs_valid': 0,
        'jobs_rejected': 0,
        'sample_jobs': [],
        'errors': []
    }
    
    try:
        if source_type == 'html':
            crawler = HTMLCrawler(db_url)
            jobs = await crawler.fetch_jobs(careers_url, org_name, source_id)
            
        elif source_type == 'rss':
            crawler = RSSCrawler(db_url)
            jobs = await crawler.fetch_feed(careers_url)
            jobs = [crawler.normalize_job(job, org_name) for job in jobs]
            
        elif source_type == 'json' or source_type == 'api':
            crawler = APICrawler(db_url)
            jobs = await crawler.fetch_jobs(careers_url, org_name, source_id)
            
        else:
            raise ValueError(f"Unknown source type: {source_type}")
        
        results['jobs_found'] = len(jobs)
        logger.info(f"Found {len(jobs)} jobs")
        
        if not jobs:
            logger.warning("No jobs found!")
            return results
        
        # Show sample jobs
        sample_count = min(5, len(jobs))
        logger.info(f"\nSample jobs (first {sample_count}):")
        logger.info("-" * 80)
        
        for i, job in enumerate(jobs[:sample_count], 1):
            title = job.get('title', 'N/A')[:60]
            location = job.get('location_raw', 'N/A')[:40]
            deadline = job.get('deadline', 'N/A')
            apply_url = job.get('apply_url', 'N/A')[:60]
            quality_score = job.get('data_quality_score', 'N/A')
            quality_issues = job.get('data_quality_issues', [])
            
            logger.info(f"\n{i}. Title: {title}")
            logger.info(f"   Location: {location}")
            logger.info(f"   Deadline: {deadline}")
            logger.info(f"   Apply URL: {apply_url}")
            logger.info(f"   Quality Score: {quality_score}")
            
            if quality_issues:
                logger.info(f"   Issues: {', '.join(str(issue)[:50] for issue in quality_issues[:3])}")
            
            # Check if job would be valid
            is_valid = job.get('data_quality_score', 0) > 0
            if is_valid:
                results['jobs_valid'] += 1
            else:
                results['jobs_rejected'] += 1
            
            results['sample_jobs'].append({
                'title': title,
                'location': location,
                'deadline': str(deadline) if deadline else None,
                'apply_url': apply_url,
                'quality_score': quality_score,
                'valid': is_valid
            })
        
        # Summary
        logger.info(f"\n{'='*80}")
        logger.info(f"Summary for {org_name}:")
        logger.info(f"  Total jobs found: {results['jobs_found']}")
        logger.info(f"  Valid jobs: {results['jobs_valid']}")
        logger.info(f"  Rejected jobs: {results['jobs_rejected']}")
        logger.info(f"{'='*80}\n")
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error testing {org_name}: {error_msg}", exc_info=True)
        results['errors'].append(error_msg)
    
    return results


async def main():
    """Main test function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Test UNESCO/UNDP extraction')
    parser.add_argument('--org', type=str, help='Organization name to test (e.g., "UNESCO", "UNDP")')
    parser.add_argument('--all', action='store_true', help='Test all UNESCO/UNDP sources')
    parser.add_argument('--dry-run', action='store_true', default=True, help='Dry run (default: True)')
    args = parser.parse_args()
    
    # Find sources
    if args.org:
        sources = find_sources([args.org])
    elif args.all:
        sources = find_sources(['UNESCO', 'UNDP'])
    else:
        # Default: test all UNESCO/UNDP
        sources = find_sources(['UNESCO', 'UNDP'])
    
    if not sources:
        logger.error("No sources found!")
        return
    
    logger.info(f"Found {len(sources)} source(s) to test\n")
    
    # Test each source
    all_results = []
    for source in sources:
        result = await test_source_extraction(source, dry_run=args.dry_run)
        all_results.append(result)
    
    # Final summary
    logger.info(f"\n{'='*80}")
    logger.info("FINAL SUMMARY")
    logger.info(f"{'='*80}\n")
    
    total_found = sum(r['jobs_found'] for r in all_results)
    total_valid = sum(r['jobs_valid'] for r in all_results)
    total_rejected = sum(r['jobs_rejected'] for r in all_results)
    
    logger.info(f"Total sources tested: {len(all_results)}")
    logger.info(f"Total jobs found: {total_found}")
    logger.info(f"Total valid jobs: {total_valid}")
    logger.info(f"Total rejected jobs: {total_rejected}")
    
    if total_found > 0:
        success_rate = (total_valid / total_found) * 100
        logger.info(f"Success rate: {success_rate:.1f}%")
    
    # Show sources with issues
    sources_with_errors = [r for r in all_results if r['errors']]
    if sources_with_errors:
        logger.warning(f"\n⚠️  {len(sources_with_errors)} source(s) had errors:")
        for r in sources_with_errors:
            logger.warning(f"  - {r['source']}: {', '.join(r['errors'])}")
    
    # Show sources with no jobs
    sources_no_jobs = [r for r in all_results if r['jobs_found'] == 0]
    if sources_no_jobs:
        logger.warning(f"\n⚠️  {len(sources_no_jobs)} source(s) found no jobs:")
        for r in sources_no_jobs:
            logger.warning(f"  - {r['source']} ({r['url']})")


if __name__ == '__main__':
    asyncio.run(main())

