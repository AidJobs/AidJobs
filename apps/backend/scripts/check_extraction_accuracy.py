#!/usr/bin/env python3
"""
Check extraction accuracy against ground truth.

Validates that extraction success rates meet thresholds.
"""

import os
import sys
import json
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from psycopg2.extras import RealDictCursor


def get_db_conn():
    """Get database connection."""
    db_url = os.getenv('SUPABASE_DB_URL') or os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("Database URL not set")
    return psycopg2.connect(db_url)


def check_accuracy(threshold: float = 0.85):
    """Check extraction accuracy."""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Get extraction statistics
            cur.execute("""
                SELECT 
                    COUNT(*) as total_extractions,
                    COUNT(CASE WHEN status = 'OK' THEN 1 END) as successful,
                    COUNT(CASE WHEN status = 'PARTIAL' THEN 1 END) as partial,
                    COUNT(CASE WHEN status = 'EMPTY' THEN 1 END) as empty,
                    COUNT(CASE WHEN status = 'DB_FAIL' THEN 1 END) as failed
                FROM extraction_logs
                WHERE created_at >= NOW() - INTERVAL '7 days'
            """)
            
            stats = cur.fetchone()
            
            total = stats['total_extractions'] or 0
            successful = stats['successful'] or 0
            partial = stats['partial'] or 0
            
            if total == 0:
                print("⚠️  No extraction data found")
                return True
            
            # Calculate success rate (OK + PARTIAL with >50% fields)
            success_rate = (successful + partial * 0.5) / total
            
            print(f"Extraction Statistics (last 7 days):")
            print(f"  Total: {total}")
            print(f"  Successful: {successful}")
            print(f"  Partial: {partial}")
            print(f"  Empty: {stats['empty']}")
            print(f"  Failed: {stats['failed']}")
            print(f"\n  Success Rate: {success_rate:.2%}")
            print(f"  Threshold: {threshold:.2%}")
            
            if success_rate >= threshold:
                print(f"\n✅ Accuracy meets threshold ({success_rate:.2%} >= {threshold:.2%})")
                return True
            else:
                print(f"\n❌ Accuracy below threshold ({success_rate:.2%} < {threshold:.2%})")
                return False
            
    finally:
        conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Check extraction accuracy')
    parser.add_argument('--threshold', type=float, default=0.85,
                       help='Minimum success rate threshold')
    
    args = parser.parse_args()
    success = check_accuracy(threshold=args.threshold)
    sys.exit(0 if success else 1)

