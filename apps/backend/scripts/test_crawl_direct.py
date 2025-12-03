"""
Direct crawl test - uses orchestrator directly without API.
Tests UNESCO/UNDP extraction with the current code.
"""

import os
import sys
import asyncio
import logging

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env if available
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(env_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        pass

import psycopg2
from psycopg2.extras import RealDictCursor
from orchestrator import get_orchestrator

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def get_db_url():
    """Get database URL"""
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("SUPABASE_DB_URL or DATABASE_URL not set")
    return db_url

def get_source(source_id: str):
    """Get source from database"""
    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, org_name, careers_url, source_type, org_type,
                       parser_hint, crawl_frequency_days, consecutive_failures,
                       consecutive_nochange
                FROM sources
                WHERE id::text = %s
            """, (source_id,))
            source = cur.fetchone()
            if source:
                return dict(source)
            return None
    finally:
        conn.close()

async def test_crawl(source_id: str):
    """Test crawl for a specific source"""
    db_url = get_db_url()
    orchestrator = get_orchestrator(db_url)
    
    source = get_source(source_id)
    if not source:
        logger.error(f"Source {source_id} not found")
        return
    
    logger.info(f"Testing crawl for: {source['org_name']}")
    logger.info(f"URL: {source['careers_url']}")
    logger.info("=" * 80)
    
    try:
        # Run crawl
        result = await orchestrator.run_source_with_lock(source)
        logger.info("=" * 80)
        logger.info("Crawl completed!")
        logger.info(f"Result: {result}")
        return result
    except Exception as e:
        logger.error(f"Crawl failed: {e}", exc_info=True)
        return None

async def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Test crawl directly')
    parser.add_argument('--source-id', type=str, help='Source ID to test')
    parser.add_argument('--org', type=str, choices=['unesco', 'undp'], help='Organization name')
    args = parser.parse_args()
    
    source_id = args.source_id
    
    if not source_id and args.org:
        # Find source by org name
        db_url = get_db_url()
        conn = psycopg2.connect(db_url)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                org_pattern = '%UNESCO%' if args.org == 'unesco' else '%UNDP%'
                cur.execute("""
                    SELECT id FROM sources
                    WHERE org_name ILIKE %s AND status = 'active'
                    LIMIT 1
                """, (org_pattern,))
                row = cur.fetchone()
                if row:
                    source_id = str(row['id'])
                else:
                    logger.error(f"No {args.org.upper()} source found")
                    return
        finally:
            conn.close()
    
    if not source_id:
        logger.error("Please provide --source-id or --org")
        return
    
    await test_crawl(source_id)

if __name__ == '__main__':
    asyncio.run(main())

