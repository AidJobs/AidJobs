#!/usr/bin/env python3
"""
Test script for UNESCO extraction diagnostics
Tests the UNESCO extraction logic without requiring admin authentication
"""
import os
import sys
import asyncio
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from crawler.html_fetch import HTMLCrawler

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_unesco_extraction():
    """Test UNESCO extraction with a sample URL or from database"""
    
    # Get database URL
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        logger.error("ERROR: SUPABASE_DB_URL or DATABASE_URL not set")
        logger.error("Set environment variable before running this script")
        return
    
    # Get UNESCO URL from environment or use default
    unesco_url = os.getenv("UNESCO_TEST_URL", "https://careers.unesco.org/careersection/2/jobsearch.ftl")
    
    logger.info("=" * 80)
    logger.info("UNESCO EXTRACTION TEST")
    logger.info("=" * 80)
    logger.info(f"Testing URL: {unesco_url}")
    logger.info("")
    
    # Create crawler
    crawler = HTMLCrawler(db_url)
    
    try:
        # Fetch HTML
        logger.info("Step 1: Fetching HTML page...")
        status, headers, html, size = await crawler.fetch_html(unesco_url)
        
        if status != 200:
            logger.error(f"❌ Failed to fetch page: HTTP {status}")
            logger.error(f"   Size: {size} bytes")
            return
        
        logger.info(f"✓ HTML fetched successfully: {size:,} bytes")
        logger.info("")
        
        # Extract jobs
        logger.info("Step 2: Extracting jobs...")
        parser_hint = None  # Test without parser hint first
        extracted_jobs = crawler.extract_jobs(html, unesco_url, parser_hint)
        
        logger.info("")
        logger.info("=" * 80)
        logger.info("EXTRACTION RESULTS")
        logger.info("=" * 80)
        logger.info(f"Jobs extracted: {len(extracted_jobs)}")
        logger.info("")
        
        if extracted_jobs:
            logger.info("✓ SUCCESS: Jobs were extracted!")
            logger.info("")
            logger.info("Sample extracted jobs:")
            logger.info("-" * 80)
            
            for idx, job in enumerate(extracted_jobs[:10], 1):
                logger.info(f"\nJob {idx}:")
                logger.info(f"  Title: {job.get('title', 'N/A')[:80]}")
                logger.info(f"  Apply URL: {job.get('apply_url', 'N/A')[:100]}")
                logger.info(f"  Location: {job.get('location_raw', 'N/A')[:60]}")
                if job.get('description_snippet'):
                    logger.info(f"  Description: {job.get('description_snippet', '')[:100]}...")
            
            logger.info("")
            logger.info("-" * 80)
            logger.info(f"✓ Total jobs extracted: {len(extracted_jobs)}")
            
            # Check for unique URLs
            urls = [job.get('apply_url', '') for job in extracted_jobs if job.get('apply_url')]
            unique_urls = set(url.rstrip('/').split('#')[0].split('?')[0] for url in urls)
            logger.info(f"✓ Unique apply URLs: {len(unique_urls)}")
            
            if len(unique_urls) < len(urls):
                logger.warning(f"⚠ WARNING: {len(urls) - len(unique_urls)} duplicate URLs found")
        else:
            logger.error("❌ FAILED: No jobs were extracted")
            logger.error("")
            logger.error("Possible reasons:")
            logger.error("  1. UNESCO page structure changed")
            logger.error("  2. Page requires JavaScript to load content")
            logger.error("  3. Page requires authentication")
            logger.error("  4. Extraction patterns need adjustment")
            logger.error("")
            logger.error("Next steps:")
            logger.error("  1. Check the HTML structure manually")
            logger.error("  2. Try adding a parser_hint CSS selector")
            logger.error("  3. Review the extraction logs above")
        
        logger.info("")
        logger.info("=" * 80)
        
    except Exception as e:
        logger.error(f"❌ Error during extraction test: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_unesco_extraction())

