#!/usr/bin/env python3
"""
Full extraction diagnostic re-crawl script for UNDP with no caps.
Extracts ALL job links from listing page and performs detail extraction.
Runs in shadow mode - writes to side table only.
"""
import os
import sys
import json
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from crawler_v2.simple_crawler import SimpleCrawler
import psycopg2
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
TARGET_URLS = [
    "https://jobs.undp.org/cj_view_consultancies.cfm"
]

DOMAIN_ALLOWLIST = ["undp.org"]
RUN_MODE = "shadow"  # Write to side table only
FOLLOW_PAGINATION = False  # Single long page
USE_BROWSER_RENDERING = True
FORCE_FULL_LIMITS = True  # No caps
PLAYWRIGHT_CONCURRENCY = 2  # Limit concurrent browser instances

REPORT_DIR = Path(__file__).parent.parent / "report"
REPORT_DIR.mkdir(parents=True, exist_ok=True)


def get_db_url():
    """Get database URL from environment."""
    return os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")


def get_source_id_for_url(db_url: str, url: str) -> Optional[str]:
    """Get or create a source_id for the URL."""
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Try to find existing source
            cur.execute("""
                SELECT id FROM sources 
                WHERE careers_url = %s OR careers_url LIKE %s
                LIMIT 1
            """, (url, f"%{urlparse(url).path}%"))
            
            result = cur.fetchone()
            if result:
                return str(result['id'])
            
            # Create a temporary source for diagnostic run
            org_name = "UNDP_RECRAWL_DIAGNOSTIC"
            cur.execute("""
                INSERT INTO sources (
                    org_name, careers_url, source_type, status, 
                    crawl_frequency_days, created_at, updated_at
                )
                VALUES (%s, %s, 'html', 'active', 1, NOW(), NOW())
                RETURNING id
            """, (org_name, url))
            
            source_id = str(cur.fetchone()['id'])
            conn.commit()
            return source_id
    finally:
        conn.close()


def extract_all_job_links(soup: BeautifulSoup, base_url: str) -> List[Dict]:
    """Extract ALL job links from the page with relaxed filters."""
    job_links = []
    seen_urls: Set[str] = set()
    
    # Find all anchor tags
    all_links = soup.find_all('a', href=True)
    logger.info(f"Found {len(all_links)} total links on page")
    
    for link in all_links:
        href = link.get('href', '').strip()
        if not href:
            continue
        
        # Resolve relative URLs
        full_url = urljoin(base_url, href)
        
        # Skip if already seen
        if full_url in seen_urls:
            continue
        seen_urls.add(full_url)
        
        # Relaxed filter: any link that might be a job
        # Look for job-related keywords in URL or text
        link_text = link.get_text(strip=True).lower()
        href_lower = href.lower()
        
        # Keywords that suggest a job link
        job_keywords = [
            'job', 'position', 'vacancy', 'career', 'apply', 'consultant',
            'consultancy', 'opportunity', 'opening', 'recruit', 'hire',
            'cfm', 'detail', 'view', 'posting'
        ]
        
        # Check if link text or URL contains job-related keywords
        is_job_link = any(keyword in href_lower or keyword in link_text 
                         for keyword in job_keywords)
        
        # Also check if it's a detail page (not a listing page)
        is_detail_page = any(exclude in href_lower for exclude in [
            'listing', 'search', 'filter', 'page=', 'p=', 'index'
        ])
        
        # Accept if it looks like a job link and is not a listing/filter page
        if is_job_link and not is_detail_page:
            job_links.append({
                'url': full_url,
                'text': link.get_text(strip=True),
                'title': link.get_text(strip=True)[:200]  # Preview
            })
    
    logger.info(f"Identified {len(job_links)} potential job links")
    return job_links


async def extract_job_detail(crawler: SimpleCrawler, job_url: str) -> Optional[Dict]:
    """Extract job details from a detail page."""
    try:
        # Fetch with browser rendering
        status, html = await crawler.fetch_html(job_url, use_browser=True)
        
        if status < 200 or status >= 300:
            logger.warning(f"Failed to fetch detail page {job_url}: HTTP {status}")
            return None
        
        # Extract using crawler's extraction method
        jobs = crawler.extract_jobs_from_html(html, job_url)
        
        if jobs:
            job = jobs[0]  # Take first extracted job
            # Ensure apply_url is set
            if not job.get('apply_url'):
                job['apply_url'] = job_url
            return job
        
        return None
    except Exception as e:
        logger.warning(f"Error extracting detail from {job_url}: {e}")
        return None


async def save_jobs_to_side_table(db_url: str, jobs: List[Dict], source_id: str, org_name: str) -> Dict:
    """Save jobs to side/shadow table with relaxed dedupe."""
    if not jobs:
        return {'inserted': 0, 'skipped': 0, 'failed': 0}
    
    conn = psycopg2.connect(db_url)
    inserted = 0
    skipped = 0
    failed = 0
    skip_reasons = {}
    
    try:
        with conn.cursor() as cur:
            for job in jobs:
                try:
                    title = job.get('title', '').strip()
                    apply_url = job.get('apply_url', '').strip()
                    
                    # Relaxed validation: title length >= 1
                    if not title or len(title) < 1:
                        skipped += 1
                        skip_reasons['empty_title'] = skip_reasons.get('empty_title', 0) + 1
                        continue
                    
                    if not apply_url:
                        skipped += 1
                        skip_reasons['no_apply_url'] = skip_reasons.get('no_apply_url', 0) + 1
                        continue
                    
                    # Relaxed dedupe: only check by exact URL (not canonical_hash)
                    cur.execute("""
                        SELECT id FROM jobs_side 
                        WHERE apply_url = %s
                        LIMIT 1
                    """, (apply_url,))
                    
                    if cur.fetchone():
                        skipped += 1
                        skip_reasons['duplicate_url'] = skip_reasons.get('duplicate_url', 0) + 1
                        continue
                    
                    # Insert to jobs_side table
                    cur.execute("""
                        INSERT INTO jobs_side (
                            source_id, org_name, title, apply_url, location_raw,
                            deadline, description_snippet, status, fetched_at, 
                            last_seen_at, created_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, 'active', NOW(), NOW(), NOW())
                    """, (
                        source_id,
                        org_name,
                        title[:500],  # Limit length
                        apply_url[:500],
                        job.get('location_raw', '')[:200] or None,
                        job.get('deadline') or None,
                        job.get('description_snippet', '')[:1000] or None
                    ))
                    
                    inserted += 1
                except Exception as e:
                    logger.warning(f"Failed to insert job {job.get('title', 'unknown')[:50]}: {e}")
                    failed += 1
                    skip_reasons['insert_error'] = skip_reasons.get('insert_error', 0) + 1
            
            conn.commit()
    except Exception as e:
        logger.error(f"Error saving jobs to side table: {e}")
        conn.rollback()
    finally:
        conn.close()
    
    return {'inserted': inserted, 'skipped': skipped, 'failed': failed, 'skip_reasons': skip_reasons}


async def crawl_with_full_extraction(crawler: SimpleCrawler, start_url: str, source_id: str, org_name: str, db_url: str) -> Dict:
    """Crawl a source with full extraction (no caps)."""
    logger.info(f"Starting full extraction crawl: {start_url}")
    
    # Fetch listing page with browser
    logger.info("Fetching listing page with Playwright...")
    status, html = await crawler.fetch_html(start_url, use_browser=True)
    
    if status < 200 or status >= 300:
        logger.error(f"Failed to fetch listing page: HTTP {status}")
        return {
            'pages_crawled': 0,
            'total_links_found': 0,
            'total_job_links_identified': 0,
            'jobs_extracted': 0,
            'jobs_saved_to_side_table': 0,
            'sample_jobs': [],
            'skip_reasons': {}
        }
    
    # Parse HTML to find all job links
    soup = BeautifulSoup(html, 'html.parser')
    job_links = extract_all_job_links(soup, start_url)
    
    logger.info(f"Found {len(job_links)} job links, extracting details...")
    
    # Extract details for each job link (with concurrency limit)
    semaphore = asyncio.Semaphore(PLAYWRIGHT_CONCURRENCY)
    all_jobs = []
    
    async def extract_with_limit(link_info: Dict):
        async with semaphore:
            job = await extract_job_detail(crawler, link_info['url'])
            if job:
                all_jobs.append(job)
            # Small delay to avoid throttling
            await asyncio.sleep(0.5)
    
    # Extract all jobs concurrently (limited by semaphore)
    tasks = [extract_with_limit(link) for link in job_links]
    await asyncio.gather(*tasks, return_exceptions=True)
    
    logger.info(f"Extracted {len(all_jobs)} jobs from {len(job_links)} links")
    
    # Save all jobs to side table
    logger.info(f"Saving {len(all_jobs)} jobs to side table...")
    save_results = await save_jobs_to_side_table(db_url, all_jobs, source_id, org_name)
    
    return {
        'pages_crawled': 1,
        'total_links_found': len(soup.find_all('a', href=True)),
        'total_job_links_identified': len(job_links),
        'jobs_extracted': len(all_jobs),
        'jobs_saved_to_side_table': save_results['inserted'],
        'jobs_skipped': save_results['skipped'],
        'jobs_failed': save_results['failed'],
        'skip_reasons': save_results.get('skip_reasons', {}),
        'sample_jobs': all_jobs[:50]  # First 50 for report
    }


async def main():
    """Main diagnostic crawl function."""
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
                    deadline DATE,
                    description_snippet TEXT,
                    status TEXT DEFAULT 'active',
                    fetched_at TIMESTAMPTZ DEFAULT NOW(),
                    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            conn.commit()
    finally:
        conn.close()
    
    # Initialize crawler
    crawler = SimpleCrawler(db_url=db_url, use_ai=False)  # Disable AI for faster diagnostic
    
    results = {}
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    
    for target_url in TARGET_URLS:
        domain = urlparse(target_url).netloc.replace('www.', '').replace('.', '_')
        logger.info(f"\n{'='*80}\nCrawling: {target_url}\n{'='*80}")
        
        # Get source_id
        source_id = get_source_id_for_url(db_url, target_url)
        org_name = "UNDP"
        
        # Crawl with full extraction
        result = await crawl_with_full_extraction(crawler, target_url, source_id, org_name, db_url)
        results[target_url] = result
        
        # Generate report for this URL
        report_data = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'target_url': target_url,
            'domain': domain,
            'run_mode': RUN_MODE,
            'config': {
                'follow_pagination': FOLLOW_PAGINATION,
                'use_browser_rendering': USE_BROWSER_RENDERING,
                'force_full_limits': FORCE_FULL_LIMITS,
                'playwright_concurrency': PLAYWRIGHT_CONCURRENCY
            },
            'results': result,
            'summary': {
                'pages_crawled': result['pages_crawled'],
                'total_links_found': result['total_links_found'],
                'total_job_links_identified': result['total_job_links_identified'],
                'jobs_extracted': result['jobs_extracted'],
                'jobs_saved_to_side_table': result['jobs_saved_to_side_table'],
                'jobs_skipped': result['jobs_skipped'],
                'jobs_failed': result['jobs_failed']
            },
            'top_skip_reasons': result.get('skip_reasons', {})
        }
        
        # Save report
        report_file = REPORT_DIR / f"recrawl_{domain}_{timestamp}.json"
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"\nReport saved: {report_file}")
        logger.info(f"Summary: {result['pages_crawled']} pages, {result['total_job_links_identified']} links, "
                   f"{result['jobs_extracted']} jobs extracted, {result['jobs_saved_to_side_table']} saved to side table")
    
    # Print final summary
    print("\n" + "="*80)
    print("DIAGNOSTIC FULL EXTRACTION COMPLETE")
    print("="*80)
    for url, result in results.items():
        print(f"\n{url}:")
        print(f"  Pages crawled: {result['pages_crawled']}")
        print(f"  Total links found: {result['total_links_found']}")
        print(f"  Job links identified: {result['total_job_links_identified']}")
        print(f"  Jobs extracted: {result['jobs_extracted']}")
        print(f"  Jobs saved to side table: {result['jobs_saved_to_side_table']}")


if __name__ == "__main__":
    asyncio.run(main())

