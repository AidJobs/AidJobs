#!/usr/bin/env python3
"""
Gather failed/low-confidence extractions from the last N days.

Produces CSV output for analysis.
"""

import os
import sys
import csv
import argparse
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from psycopg2.extras import RealDictCursor


def get_db_conn():
    """Get database connection."""
    db_url = os.getenv('SUPABASE_DB_URL') or os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("Database URL not set")
    return psycopg2.connect(db_url)


def gather_failures(days: int = 7, output_file: str = None):
    """Gather failed extractions."""
    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Query failed inserts
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            cur.execute("""
                SELECT 
                    fi.id,
                    fi.source_url,
                    fi.error,
                    fi.attempt_at,
                    fi.operation,
                    fi.payload,
                    s.org_name,
                    s.careers_url
                FROM failed_inserts fi
                LEFT JOIN sources s ON fi.source_id = s.id
                WHERE fi.attempt_at >= %s
                ORDER BY fi.attempt_at DESC
            """, (cutoff_date,))
            
            failures = cur.fetchall()
            
            # Query low-confidence extractions (from extraction_logs)
            cur.execute("""
                SELECT 
                    el.id,
                    el.url,
                    el.status,
                    el.reason,
                    el.extracted_fields,
                    el.created_at,
                    s.org_name,
                    s.careers_url
                FROM extraction_logs el
                LEFT JOIN sources s ON el.source_id = s.id
                WHERE el.created_at >= %s
                  AND (el.status = 'PARTIAL' OR el.status = 'EMPTY')
                ORDER BY el.created_at DESC
            """, (cutoff_date,))
            
            low_confidence = cur.fetchall()
            
            # Write CSV
            if output_file is None:
                output_file = f"failures_{datetime.utcnow().strftime('%Y%m%d')}.csv"
            
            with open(output_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                
                # Header
                writer.writerow([
                    'Type', 'ID', 'URL', 'Org Name', 'Error/Reason',
                    'Status', 'Timestamp', 'Payload/Fields'
                ])
                
                # Failed inserts
                for row in failures:
                    writer.writerow([
                        'FAILED_INSERT',
                        str(row['id']),
                        row['source_url'] or '',
                        row['org_name'] or '',
                        row['error'] or '',
                        row['operation'] or '',
                        row['attempt_at'].isoformat() if row['attempt_at'] else '',
                        str(row['payload'])[:500] if row['payload'] else ''
                    ])
                
                # Low confidence
                for row in low_confidence:
                    writer.writerow([
                        'LOW_CONFIDENCE',
                        str(row['id']),
                        row['url'] or '',
                        row['org_name'] or '',
                        row['reason'] or '',
                        row['status'] or '',
                        row['created_at'].isoformat() if row['created_at'] else '',
                        str(row['extracted_fields'])[:500] if row['extracted_fields'] else ''
                    ])
            
            print(f"✅ Wrote {len(failures)} failed inserts and {len(low_confidence)} low-confidence extractions to {output_file}")
            
    finally:
        conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Gather extraction failures')
    parser.add_argument('--days', type=int, default=7, help='Number of days to look back')
    parser.add_argument('--output', type=str, help='Output CSV file')
    
    args = parser.parse_args()
    gather_failures(days=args.days, output_file=args.output)

