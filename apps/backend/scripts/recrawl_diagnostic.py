#!/usr/bin/env python3
"""
Diagnostic re-crawl script for specific sources with full pagination and Playwright rendering.
Runs in shadow mode - writes to side table only.
"""
import os
import sys
import json
import asyncio
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import urlparse, urljoin, urlencode, parse_qs
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
    "https://jobs.undp.org/cj_view_consultancies.cfm",
    "https://jobs.undp.org/cj_view_jobs.cfm?_gl=1*e9opwh*_ga*MjQ1MTExNTM1LjE3NjQ0OTI4NjE.*_ga_PBF14M9C6G*czE3NjQ3ODMzMDAkbzEkZzEkdDE3NjQ3ODM0OTAkajU0JGwwJGgw"
]

DOMAIN_ALLOWLIST = ["undp.org"]
RUN_MODE = "shadow"  # Write to side table only
FOLLOW_PAGINATION = True
USE_BROWSER_RENDERING = True
FORCE_FULL_LIMITS = True
MAX_PAGES = 500  # Safe upper bound
MAX_CONCURRENT_PAGES = 2  # Limit Playwright concurrency

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
            org_name = urlparse(url).netloc.replace('www.', '').split('.')[0].upper()
            cur.execute("""
                INSERT INTO sources (
                    org_name, careers_url, source_type, status, 
                    crawl_frequency_days, created_at, updated_at
                )
                VALUES (%s, %s, 'html', 'active', 1, NOW(), NOW())
                RETURNING id
            """, (f"{org_name}_RECRAWL_DIAGNOSTIC", url))
            
            source_id = str(cur.fetchone()['id'])
            conn.commit()
            return source_id
    finally:
        conn.close()


def find_next_page_url(soup: BeautifulSoup, current_url: str) -> Optional[str]:
    """Find next page URL from pagination links."""
    # Method 1: Look for rel="next"
    next_link = soup.find('link', rel='next')
    if next_link and next_link.get('href'):
        return urljoin(current_url, next_link['href'])
    
    # Method 2: Look for "Next" button/link
    next_buttons = soup.find_all('a', string=lambda t: t and 'next' in t.lower())
    for btn in next_buttons:
        href = btn.get('href')
        if href:
            return urljoin(current_url, href)
    
    # Method 3: Look for page number links (find highest page number + 1)
    page_links = soup.find_all('a', href=lambda h: h and ('page=' in h.lower() or 'p=' in h.lower()))
    if page_links:
        max_page = 1
        for link in page_links:
            href = link.get('href', '')
            # Extract page number from URL
            try:
                parsed = urlparse(href)
                params = parse_qs(parsed.query)
                for key in ['page', 'p', 'pagenum', 'pagenumber']:
                    if key in params:
                        page_num = int(params[key][0])
                        max_page = max(max_page, page_num)
            except:
                pass
        
        # Try to construct next page URL
        parsed_current = urlparse(current_url)
        params = parse_qs(parsed_current.query)
        next_page = max_page + 1
        
        # Try common page parameter names
        for key in ['page', 'p', 'pagenum', 'pagenumber']:
            if key in params or max_page > 1:
                params[key] = [str(next_page)]
                new_query = urlencode(params, doseq=True)
                next_url = f"{parsed_current.scheme}://{parsed_current.netloc}{parsed_current.path}?{new_query}"
                return next_url
    
    return None


async def crawl_page_with_browser(crawler: SimpleCrawler, url: str) -> tuple[int, str]:
    """Crawl a single page with Playwright rendering."""
    logger.info(f"Fetching page with browser: {url}")
    status, html = await crawler.fetch_html(url, use_browser=True)
    return status, html


async def extract_jobs_from_page(html: str, base_url: str, crawler: SimpleCrawler) -> List[Dict]:
    """Extract jobs from a single page HTML."""
    # Use crawler's extraction method
    jobs = crawler.extract_jobs_from_html(html, base_url)
    
    # Relax validation: accept titles with length >= 1
    relaxed_jobs = []
    for job in jobs:
        # Only require title (length >= 1) and apply_url
        if job.get('title') and len(str(job.get('title', ''))) >= 1:
            if not job.get('apply_url'):
                # Use base_url as fallback
                job['apply_url'] = base_url
            relaxed_jobs.append(job)
    
    return relaxed_jobs


async def save_jobs_to_side_table(db_url: str, jobs: List[Dict], source_id: str, org_name: str) -> Dict:
    """Save jobs to side/shadow table with relaxed dedupe."""
    if not jobs:
        return {'inserted': 0, 'skipped': 0, 'failed': 0}
    
    conn = psycopg2.connect(db_url)
    inserted = 0
    skipped = 0
    failed = 0
    
    try:
        with conn.cursor() as cur:
            for job in jobs:
                try:
                    title = job.get('title', '').strip()
                    apply_url = job.get('apply_url', '').strip()
                    
                    if not title or not apply_url:
                        skipped += 1
                        continue
                    
                    # Relaxed dedupe: only check by exact URL (not canonical_hash)
                    cur.execute("""
                        SELECT id FROM jobs_side 
                        WHERE apply_url = %s
                        LIMIT 1
                    """, (apply_url,))
                    
                    if cur.fetchone():
                        skipped += 1
                        continue
                    
                    # Insert to jobs_side table
                    cur.execute("""
                        INSERT INTO jobs_side (
                            source_id, org_name, title, apply_url, location_raw,
                            status, fetched_at, last_seen_at, created_at
                        )
                        VALUES (%s, %s, %s, %s, %s, 'active', NOW(), NOW(), NOW())
                    """, (
                        source_id,
                        org_name,
                        title[:500],  # Limit length
                        apply_url[:500],
                        job.get('location_raw', '')[:200] or None
                    ))
                    
                    inserted += 1
                except Exception as e:
                    logger.warning(f"Failed to insert job {job.get('title', 'unknown')[:50]}: {e}")
                    failed += 1
            
            conn.commit()
    except Exception as e:
        logger.error(f"Error saving jobs to side table: {e}")
        conn.rollback()
    finally:
        conn.close()
    
    return {'inserted': inserted, 'skipped': skipped, 'failed': failed}


async def crawl_with_pagination(crawler: SimpleCrawler, start_url: str, source_id: str, org_name: str, db_url: str) -> Dict:
    """Crawl a source with full pagination."""
    logger.info(f"Starting paginated crawl: {start_url}")
    
    pages_crawled = 0
    total_links_found = 0
    total_jobs_extracted = 0
    all_jobs = []
    page_stats = []
    
    current_url = start_url
    visited_urls = set()
    
    while current_url and pages_crawled < MAX_PAGES:
        if current_url in visited_urls:
            logger.info(f"Already visited {current_url}, stopping pagination")
            break
        
        visited_urls.add(current_url)
        logger.info(f"Crawling page {pages_crawled + 1}: {current_url}")
        
        try:
            # Fetch page with browser
            status, html = await crawl_page_with_browser(crawler, current_url)
            
            if status < 200 or status >= 300:
                logger.warning(f"Failed to fetch page: HTTP {status}")
                break
            
            # Parse HTML to find job links and pagination
            soup = BeautifulSoup(html, 'html.parser')
            
            # Count links on page
            job_links = soup.find_all('a', href=True)
            links_count = len([l for l in job_links if any(keyword in l.get('href', '').lower() 
                                                          for keyword in ['job', 'position', 'vacancy', 'career', 'apply'])])
            total_links_found += links_count
            
            # Extract jobs from page
            jobs = await extract_jobs_from_page(html, current_url, crawler)
            total_jobs_extracted += len(jobs)
            all_jobs.extend(jobs)
            
            page_stats.append({
                'page_num': pages_crawled + 1,
                'url': current_url,
                'links_found': links_count,
                'jobs_extracted': len(jobs),
                'status': status
            })
            
            logger.info(f"Page {pages_crawled + 1}: Found {links_count} links, extracted {len(jobs)} jobs")
            
            # Find next page
            if FOLLOW_PAGINATION:
                next_url = find_next_page_url(soup, current_url)
                if next_url and next_url != current_url:
                    current_url = next_url
                    pages_crawled += 1
                    # Small delay to avoid throttling
                    await asyncio.sleep(1.0)
                else:
                    logger.info("No next page found, pagination complete")
                    break
            else:
                break
            
            pages_crawled += 1
            
        except Exception as e:
            logger.error(f"Error crawling page {current_url}: {e}", exc_info=True)
            break
    
    # Save all jobs to side table
    logger.info(f"Saving {len(all_jobs)} jobs to side table...")
    save_results = await save_jobs_to_side_table(db_url, all_jobs, source_id, org_name)
    
    return {
        'pages_crawled': pages_crawled + 1,  # +1 for initial page
        'total_links_found': total_links_found,
        'total_jobs_extracted': total_jobs_extracted,
        'jobs_inserted': save_results['inserted'],
        'jobs_skipped': save_results['skipped'],
        'jobs_failed': save_results['failed'],
        'page_stats': page_stats,
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
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    
    for target_url in TARGET_URLS:
        domain = urlparse(target_url).netloc.replace('www.', '')
        logger.info(f"\n{'='*80}\nCrawling: {target_url}\n{'='*80}")
        
        # Get source_id
        source_id = get_source_id_for_url(db_url, target_url)
        org_name = urlparse(target_url).netloc.replace('www.', '').split('.')[0].upper()
        
        # Crawl with pagination
        result = await crawl_with_pagination(crawler, target_url, source_id, org_name, db_url)
        results[target_url] = result
        
        # Generate report for this URL
        report_data = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'target_url': target_url,
            'domain': domain,
            'run_mode': RUN_MODE,
            'config': {
                'follow_pagination': FOLLOW_PAGINATION,
                'use_browser_rendering': USE_BROWSER_RENDERING,
                'force_full_limits': FORCE_FULL_LIMITS,
                'max_pages': MAX_PAGES
            },
            'results': result,
            'summary': {
                'pages_crawled': result['pages_crawled'],
                'total_links_found': result['total_links_found'],
                'total_jobs_extracted': result['total_jobs_extracted'],
                'jobs_inserted_to_side': result['jobs_inserted'],
                'jobs_skipped': result['jobs_skipped'],
                'jobs_failed': result['jobs_failed']
            }
        }
        
        # Save report
        report_file = REPORT_DIR / f"recrawl_{domain}_{timestamp}.json"
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"\nReport saved: {report_file}")
        logger.info(f"Summary: {result['pages_crawled']} pages, {result['total_jobs_extracted']} jobs extracted, {result['jobs_inserted']} inserted to side table")
    
    # Print final summary
    print("\n" + "="*80)
    print("DIAGNOSTIC RECRAWL COMPLETE")
    print("="*80)
    for url, result in results.items():
        print(f"\n{url}:")
        print(f"  Pages crawled: {result['pages_crawled']}")
        print(f"  Jobs found: {result['total_jobs_extracted']}")
        print(f"  Jobs saved to side table: {result['jobs_inserted']}")


if __name__ == "__main__":
    asyncio.run(main())

