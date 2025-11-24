"""
Diagnostic script to analyze UNDP job extraction and identify why all jobs link to the same page.

This script:
1. Fetches the UNDP careers page
2. Extracts jobs using the current logic
3. Analyzes link distribution
4. Identifies the root cause of duplicate URLs
5. Provides recommendations for fixes
"""

import sys
import os
import asyncio
import logging
from collections import Counter
from urllib.parse import urljoin, urlparse

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from crawler.html_fetch import HTMLCrawler
from core.net import HTTPClient

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


async def diagnose_undp_extraction():
    """Diagnose UNDP extraction issues"""
    
    # UNDP careers URL
    undp_url = "https://jobs.undp.org/cj_view_consultancies.cfm"
    
    logger.info("=" * 80)
    logger.info("UNDP EXTRACTION DIAGNOSTIC")
    logger.info("=" * 80)
    logger.info(f"Fetching: {undp_url}")
    
    # Fetch HTML
    http_client = HTTPClient()
    try:
        response = await http_client.get(undp_url)
        html = response.text
        logger.info(f"✓ Fetched {len(html)} bytes of HTML")
    except Exception as e:
        logger.error(f"✗ Failed to fetch: {e}")
        return
    
    # Parse with BeautifulSoup
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    
    # Find all "Job Title" occurrences
    import re
    job_title_pattern = re.compile(r'(?i)Job Title\s+', re.IGNORECASE)
    
    # Find all text nodes containing "Job Title"
    all_text = soup.get_text()
    title_matches = list(job_title_pattern.finditer(all_text))
    logger.info(f"Found {len(title_matches)} 'Job Title' occurrences")
    
    if len(title_matches) == 0:
        logger.error("No 'Job Title' text found! UNDP page structure may have changed.")
        return
    
    # Analyze structure
    logger.info("\n" + "=" * 80)
    logger.info("STRUCTURE ANALYSIS")
    logger.info("=" * 80)
    
    # Find containers for each job title
    job_containers = []
    for i, match in enumerate(title_matches[:10]):  # Analyze first 10
        start_pos = match.start()
        end_pos = match.end()
        
        # Find the element containing this text
        # Strategy: Find parent element that contains this text and is reasonably sized
        text_before = all_text[:start_pos]
        text_after = all_text[end_pos:end_pos+500]
        
        # Try to find the container element
        # Look for the next "Apply by" or "Location" after "Job Title"
        title_text = all_text[start_pos:end_pos+200]
        
        logger.info(f"\nJob {i+1}:")
        logger.info(f"  Position: {start_pos}-{end_pos}")
        logger.info(f"  Text context: {title_text[:100]}...")
        
        # Find links near this position
        # Get all links in the document
        all_links = soup.find_all('a', href=True)
        
        # Find links that might be associated with this job
        # Strategy: Find links in the same structural container
        # Look for parent elements containing "Job Title"
        for element in soup.find_all(['div', 'tr', 'td', 'li', 'section']):
            element_text = element.get_text()
            if match.group() in element_text:
                # Found a container - check for links
                links_in_container = element.find_all('a', href=True)
                if links_in_container:
                    logger.info(f"  Container: {element.name} (class: {element.get('class')})")
                    logger.info(f"  Links in container: {len(links_in_container)}")
                    for link in links_in_container[:3]:
                        href = link.get('href', '')
                        link_text = link.get_text().strip()[:50]
                        logger.info(f"    - {href[:80]} (text: '{link_text}')")
                    
                    job_containers.append({
                        'index': i+1,
                        'element': element,
                        'links': links_in_container,
                        'text': element_text[:200]
                    })
                    break
    
    # Now test actual extraction
    logger.info("\n" + "=" * 80)
    logger.info("EXTRACTION TEST")
    logger.info("=" * 80)
    
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL") or "postgresql://localhost"
    crawler = HTMLCrawler(db_url)
    
    try:
        jobs = crawler.extract_jobs(html, undp_url)
        logger.info(f"\nExtracted {len(jobs)} jobs")
        
        if jobs:
            # Analyze URLs
            urls = [job.get('apply_url', 'unknown') for job in jobs]
            url_counts = Counter(urls)
            
            logger.info("\nURL Distribution:")
            for url, count in url_counts.most_common(10):
                logger.info(f"  {count}x: {url[:80]}")
            
            unique_urls = len(url_counts)
            if unique_urls < len(jobs):
                logger.error(f"\n✗ PROBLEM: Only {unique_urls} unique URLs for {len(jobs)} jobs!")
                logger.error("  This is the root cause - multiple jobs are using the same URL")
                
                # Show which jobs share URLs
                logger.error("\nDuplicate URL Analysis:")
                for url, count in url_counts.items():
                    if count > 1:
                        logger.error(f"\n  URL used {count} times: {url[:80]}")
                        matching_jobs = [j for j in jobs if j.get('apply_url') == url]
                        for job in matching_jobs:
                            logger.error(f"    - {job.get('title', 'Unknown')[:60]}")
            else:
                logger.info(f"\n✓ All {len(jobs)} jobs have unique URLs")
            
            # Show first few jobs
            logger.info("\nFirst 5 jobs:")
            for i, job in enumerate(jobs[:5], 1):
                logger.info(f"\n  {i}. {job.get('title', 'Unknown')[:60]}")
                logger.info(f"     URL: {job.get('apply_url', 'Unknown')[:80]}")
        else:
            logger.error("✗ No jobs extracted!")
            
    except Exception as e:
        logger.error(f"✗ Extraction failed: {e}", exc_info=True)
    
    logger.info("\n" + "=" * 80)
    logger.info("DIAGNOSTIC COMPLETE")
    logger.info("=" * 80)


if __name__ == "__main__":
    asyncio.run(diagnose_undp_extraction())

