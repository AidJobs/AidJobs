"""
Diagnostic script to test UNESCO extraction and see what's actually being extracted.

This will help identify why locations and deadlines aren't being captured correctly.
"""

import os
import sys
import logging
from typing import Dict, List, Optional

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from core.net import HTTPClient
from crawler.plugins.registry import PluginRegistry
from bs4 import BeautifulSoup


def fetch_unesco_page(url: str = "https://careers.unesco.org/careersection/2/joblist.ftl") -> Optional[str]:
    """Fetch UNESCO jobs page HTML."""
    try:
        client = HTTPClient()
        response = client.get(url, timeout=30)
        if response and response.status_code == 200:
            return response.text
        else:
            logger.error(f"Failed to fetch UNESCO page: {response.status_code if response else 'No response'}")
            return None
    except Exception as e:
        logger.error(f"Error fetching UNESCO page: {e}")
        return None


def analyze_table_structure(html: str):
    """Analyze the actual table structure of UNESCO's job listings."""
    soup = BeautifulSoup(html, 'lxml')
    
    tables = soup.find_all('table')
    logger.info(f"Found {len(tables)} tables in HTML")
    
    for table_idx, table in enumerate(tables):
        rows = table.find_all('tr')
        logger.info(f"\n=== Table {table_idx + 1} ===")
        logger.info(f"Total rows: {len(rows)}")
        
        # Find header row
        header_row = None
        for idx, row in enumerate(rows[:10]):  # Check first 10 rows
            cells = row.find_all(['th', 'td'])
            if not cells:
                continue
            
            row_text = row.get_text().lower()
            header_keywords = ['title', 'position', 'location', 'deadline', 'duty station', 'apply', 'reference']
            header_keyword_count = sum(1 for kw in header_keywords if kw in row_text)
            
            if header_keyword_count >= 2 or len(row.find_all('th')) > len(row.find_all('td')):
                header_row = row
                logger.info(f"\nHeader row found at index {idx}:")
                for cell_idx, cell in enumerate(cells):
                    cell_text = cell.get_text().strip()
                    logger.info(f"  Column {cell_idx}: '{cell_text}'")
                break
        
        # Analyze first few data rows
        if header_row:
            logger.info(f"\nFirst 3 data rows:")
            data_row_count = 0
            for row in rows:
                if row == header_row:
                    continue
                if row.find_parent('thead'):
                    continue
                
                cells = row.find_all(['td', 'th'])
                if len(cells) < 2:
                    continue
                
                data_row_count += 1
                if data_row_count > 3:
                    break
                
                logger.info(f"\n  Data row {data_row_count}:")
                for cell_idx, cell in enumerate(cells):
                    cell_text = cell.get_text().strip()
                    # Check for links
                    link = cell.find('a', href=True)
                    link_info = f" [LINK: {link.get('href', '')[:50]}]" if link else ""
                    logger.info(f"    Cell {cell_idx}: '{cell_text[:80]}'{link_info}")


def test_extraction(html: str, base_url: str):
    """Test the actual extraction."""
    registry = PluginRegistry()
    
    logger.info("\n=== Testing UNESCO Plugin Extraction ===")
    
    # Try to extract using UNESCO plugin
    try:
        result = registry.extract(html, base_url, {}, preferred_plugin='unesco')
        
        logger.info(f"\nExtraction result:")
        logger.info(f"  Success: {result.is_success()}")
        logger.info(f"  Confidence: {result.confidence}")
        logger.info(f"  Message: {result.message}")
        logger.info(f"  Jobs extracted: {len(result.jobs)}")
        
        if result.jobs:
            logger.info(f"\nFirst 5 extracted jobs:")
            for idx, job in enumerate(result.jobs[:5]):
                logger.info(f"\n  Job {idx + 1}:")
                logger.info(f"    Title: {job.get('title', 'N/A')[:80]}")
                logger.info(f"    Location: {job.get('location_raw', 'N/A')}")
                logger.info(f"    Deadline: {job.get('deadline', 'N/A')}")
                logger.info(f"    URL: {job.get('apply_url', 'N/A')[:80]}")
        else:
            logger.warning("No jobs extracted!")
            
    except Exception as e:
        logger.error(f"Extraction failed: {e}", exc_info=True)


def main():
    """Main diagnostic function."""
    unesco_url = "https://careers.unesco.org/careersection/2/joblist.ftl"
    
    logger.info("Fetching UNESCO jobs page...")
    html = fetch_unesco_page(unesco_url)
    
    if not html:
        logger.error("Failed to fetch HTML. Cannot proceed.")
        return
    
    logger.info(f"Fetched {len(html)} characters of HTML")
    
    # Analyze table structure
    logger.info("\n" + "="*60)
    logger.info("ANALYZING TABLE STRUCTURE")
    logger.info("="*60)
    analyze_table_structure(html)
    
    # Test extraction
    logger.info("\n" + "="*60)
    logger.info("TESTING EXTRACTION")
    logger.info("="*60)
    test_extraction(html, unesco_url)
    
    logger.info("\n" + "="*60)
    logger.info("DIAGNOSIS COMPLETE")
    logger.info("="*60)


if __name__ == "__main__":
    main()

