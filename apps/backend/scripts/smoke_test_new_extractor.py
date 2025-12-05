#!/usr/bin/env python3
"""
Smoke test script for new pipeline extractor.

Runs extraction on selected domains in shadow mode and generates a report.
"""

import os
import sys
import json
import asyncio
import logging
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
from urllib.parse import urlparse

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx
from bs4 import BeautifulSoup

from core.rollout_config import get_rollout_config, RolloutConfig
from pipeline.extractor import Extractor
from pipeline.integration import PipelineAdapter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Output directories
REPORT_DIR = Path(__file__).parent.parent / "report"
SNAPSHOT_DIR = Path(__file__).parent.parent / "snapshots" / "new_extractor_side"
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
REPORT_DIR.mkdir(parents=True, exist_ok=True)


async def fetch_page(url: str) -> tuple[int, str]:
    """Fetch HTML page."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; AidJobs/1.0; +https://aidjobs.app)"},
                follow_redirects=True
            )
            return response.status_code, response.text
    except Exception as e:
        logger.error(f"Error fetching {url}: {e}")
        return 0, ""


def get_domain_from_url(url: str) -> str:
    """Extract domain from URL."""
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    if domain.startswith('www.'):
        domain = domain[4:]
    return domain


async def collect_test_pages(rollout_config: RolloutConfig, db_url: str) -> List[Dict[str, Any]]:
    """Collect test pages from allowed domains."""
    import psycopg2
    from psycopg2.extras import RealDictCursor
    
    pages = []
    
    try:
        conn = psycopg2.connect(db_url, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get sources from allowed domains
        if rollout_config.domain_allowlist:
            # Build domain filter
            domain_filters = []
            for domain in rollout_config.domain_allowlist:
                domain_filters.append(f"careers_url ILIKE '%{domain}%'")
            
            query = f"""
                SELECT id, org_name, careers_url, source_type
                FROM sources
                WHERE status = 'active'
                  AND source_type = 'html'
                  AND ({' OR '.join(domain_filters)})
                ORDER BY org_name
                LIMIT {rollout_config.smoke_limit}
            """
        else:
            # No allowlist - get any HTML sources (up to limit)
            query = f"""
                SELECT id, org_name, careers_url, source_type
                FROM sources
                WHERE status = 'active'
                  AND source_type = 'html'
                ORDER BY org_name
                LIMIT {rollout_config.smoke_limit}
            """
        
        cursor.execute(query)
        sources = cursor.fetchall()
        
        logger.info(f"Found {len(sources)} sources to test")
        
        # Fetch pages
        for source in sources:
            url = source['careers_url']
            status, html = await fetch_page(url)
            
            if status >= 200 and status < 300 and html:
                pages.append({
                    'source_id': str(source['id']),
                    'org_name': source['org_name'],
                    'url': url,
                    'html': html,
                    'status_code': status
                })
                logger.info(f"Fetched page: {source['org_name']} ({len(html)} chars)")
            
            # Limit to smoke_limit pages
            if len(pages) >= rollout_config.smoke_limit:
                break
        
        conn.close()
    
    except Exception as e:
        logger.error(f"Error collecting test pages: {e}", exc_info=True)
    
    return pages


async def run_smoke_test():
    """Run smoke test on new extractor."""
    logger.info("Starting smoke test for new pipeline extractor")
    
    # Get configuration
    rollout_config = get_rollout_config()
    
    if not rollout_config.use_new_extractor:
        logger.warning("EXTRACTION_USE_NEW_EXTRACTOR is not enabled. Set to 'true' to run smoke test.")
        return
    
    # Get database URL
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        logger.error("Database URL not configured (SUPABASE_DB_URL or DATABASE_URL)")
        return
    
    # Collect test pages
    logger.info("Collecting test pages...")
    pages = await collect_test_pages(rollout_config, db_url)
    
    if not pages:
        logger.warning("No pages collected for smoke test")
        return
    
    logger.info(f"Collected {len(pages)} pages for testing")
    
    # Initialize extractor
    extractor = Extractor(
        db_url=db_url,
        enable_ai=rollout_config.use_new_extractor,
        enable_snapshots=True,
        shadow_mode=rollout_config.is_shadow_mode()
    )
    
    # Track AI call count
    ai_call_count = 0
    max_ai_calls = 200
    
    # Process pages
    results = []
    field_stats = {
        'title': {'success': 0, 'total': 0},
        'employer': {'success': 0, 'total': 0},
        'location': {'success': 0, 'total': 0},
        'posted_on': {'success': 0, 'total': 0},
        'deadline': {'success': 0, 'total': 0},
        'application_url': {'success': 0, 'total': 0},
        'description': {'success': 0, 'total': 0},
    }
    
    low_confidence_count = 0
    incorrect_examples = []
    
    for i, page in enumerate(pages, 1):
        logger.info(f"Processing page {i}/{len(pages)}: {page['org_name']}")
        
        try:
            # Extract using new pipeline
            result = await extractor.extract_from_html(page['html'], page['url'])
            
            # Track field extraction
            for field_name in field_stats.keys():
                field_result = result.get_field(field_name)
                field_stats[field_name]['total'] += 1
                if field_result and field_result.is_valid():
                    field_stats[field_name]['success'] += 1
            
            # Check confidence
            overall_confidence = result.get_overall_confidence() if hasattr(result, 'get_overall_confidence') else 0.5
            if overall_confidence < 0.5:
                low_confidence_count += 1
            
            # Check for incorrect extractions (heuristics)
            is_incorrect = False
            issues = []
            
            title_field = result.get_field('title')
            if not title_field or not title_field.value or len(title_field.value.strip()) < 5:
                is_incorrect = True
                issues.append('empty_or_short_title')
            
            app_url_field = result.get_field('application_url')
            if not app_url_field or not app_url_field.value:
                is_incorrect = True
                issues.append('missing_apply_url')
            
            if not result.is_job:
                is_incorrect = True
                issues.append('not_classified_as_job')
            
            # Check for non-job content keywords
            title_text = title_field.value.lower() if title_field and title_field.value else ''
            if any(kw in title_text for kw in ['login', 'sign in', 'about us', 'contact', 'home']):
                is_incorrect = True
                issues.append('non_job_keywords')
            
            if is_incorrect and len(incorrect_examples) < 10:
                incorrect_examples.append({
                    'url': page['url'],
                    'org_name': page['org_name'],
                    'title': title_field.value if title_field else None,
                    'issues': issues,
                    'confidence': overall_confidence,
                    'is_job': result.is_job
                })
            
            # Save snapshot
            snapshot_path = SNAPSHOT_DIR / f"{get_domain_from_url(page['url'])}_page_{i}.html"
            meta_path = SNAPSHOT_DIR / f"{get_domain_from_url(page['url'])}_page_{i}.meta.json"
            
            try:
                snapshot_path.write_text(page['html'], encoding='utf-8')
                meta_data = {
                    'url': page['url'],
                    'org_name': page['org_name'],
                    'source_id': page['source_id'],
                    'extracted_at': datetime.utcnow().isoformat() + 'Z',
                    'extraction_result': result.to_dict(),
                    'overall_confidence': overall_confidence,
                    'issues': issues,
                    'shadow_mode': True,
                    'source': 'new_extractor'
                }
                meta_path.write_text(json.dumps(meta_data, indent=2), encoding='utf-8')
            except Exception as e:
                logger.warning(f"Error saving snapshot: {e}")
            
            # Collect example records (first 20)
            if len(results) < 20:
                result_dict = result.to_dict()
                # Remove id fields for privacy
                if 'id' in result_dict:
                    del result_dict['id']
                results.append(result_dict)
        
        except Exception as e:
            logger.error(f"Error processing page {page['url']}: {e}", exc_info=True)
            continue
    
    # Generate report
    report = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'config': {
            'use_new_extractor': rollout_config.use_new_extractor,
            'rollout_percent': rollout_config.rollout_percent,
            'shadow_mode': rollout_config.is_shadow_mode(),
            'domain_allowlist': rollout_config.domain_allowlist,
            'smoke_limit': rollout_config.smoke_limit
        },
        'summary': {
            'pages_processed': len(pages),
            'low_confidence_count': low_confidence_count,
            'ai_calls_used': ai_call_count
        },
        'field_extraction': {
            field_name: {
                'success': stats['success'],
                'total': stats['total'],
                'success_rate': round(stats['success'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0
            }
            for field_name, stats in field_stats.items()
        },
        'example_extractions': results[:20],
        'incorrect_examples': incorrect_examples[:10]
    }
    
    # Save report
    report_path = REPORT_DIR / "smoke_new.json"
    report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    
    logger.info(f"Smoke test complete. Report saved to {report_path}")
    logger.info(f"  Pages processed: {len(pages)}")
    logger.info(f"  Low confidence: {low_confidence_count}")
    logger.info(f"  Field success rates:")
    for field_name, stats in field_stats.items():
        rate = round(stats['success'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0
        logger.info(f"    {field_name}: {rate}% ({stats['success']}/{stats['total']})")
    
    return report


if __name__ == "__main__":
    asyncio.run(run_smoke_test())

