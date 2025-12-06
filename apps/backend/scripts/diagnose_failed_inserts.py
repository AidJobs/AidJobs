#!/usr/bin/env python3
"""
Diagnostic script to extract failed insert reasons for UNICEF and UNESCO.
Read-only - does not modify any data.
"""
import os
import sys
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Optional

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from psycopg2.extras import RealDictCursor

REPORT_DIR = Path(__file__).parent.parent / "report"
REPORT_DIR.mkdir(parents=True, exist_ok=True)


def get_db_url():
    """Get database URL from environment."""
    return os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")


def get_source_ids(db_url: str) -> Dict[str, str]:
    """Get source IDs for UNICEF and UNESCO."""
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Try exact IDs first
            cur.execute("""
                SELECT id, org_name
                FROM sources
                WHERE id::text IN ('d8fb4848-7019-416d-b862-947ac890b69f', '12b14bdb-53ea-4082-9ec8-211344115dd0')
                OR (org_name ILIKE '%unicef%' OR org_name ILIKE '%unesco%')
                AND status = 'active'
                ORDER BY created_at DESC
            """)
            
            sources = cur.fetchall()
            result = {}
            for source in sources:
                org_lower = source['org_name'].lower()
                if 'unicef' in org_lower and 'unicef' not in result:
                    result['unicef'] = str(source['id'])
                elif 'unesco' in org_lower and 'unesco' not in result:
                    result['unesco'] = str(source['id'])
            
            return result
    finally:
        conn.close()


def extract_failed_inserts(db_url: str, source_id: str, org_name: str) -> Dict:
    """Extract failed insert records for a source."""
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check if failed_inserts table exists
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name = 'failed_inserts'
            """)
            if not cur.fetchone():
                return {'table_exists': False, 'records': []}
            
            # Query failed inserts
            cur.execute("""
                SELECT 
                    id, source_url, error, payload, raw_page_id, 
                    attempt_at, source_id, resolved_at, resolution_notes, operation
                FROM failed_inserts
                WHERE source_id = %s
                ORDER BY attempt_at DESC
                LIMIT 50
            """, (source_id,))
            
            records = cur.fetchall()
            
            # Also check extraction_logs
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_name = 'extraction_logs'
            """)
            extraction_logs_exist = bool(cur.fetchone())
            
            extraction_warnings = []
            if extraction_logs_exist:
                cur.execute("""
                    SELECT url, status, reason, extracted_fields
                    FROM extraction_logs
                    WHERE source_id = %s
                    AND (status != 'OK' OR reason IS NOT NULL)
                    ORDER BY fetched_at DESC
                    LIMIT 20
                """, (source_id,))
                extraction_warnings = cur.fetchall()
            
            return {
                'table_exists': True,
                'records': [dict(r) for r in records],
                'extraction_warnings': [dict(w) for w in extraction_warnings]
            }
    finally:
        conn.close()


def analyze_errors(records: List[Dict]) -> Dict:
    """Analyze error patterns."""
    error_counts = {}
    for record in records:
        error = record.get('error', 'unknown')
        # Extract main error type
        if 'validation' in error.lower():
            error_type = 'validation'
        elif 'sql' in error.lower() or 'insert' in error.lower():
            error_type = 'sql'
        elif 'duplicate' in error.lower() or 'unique' in error.lower():
            error_type = 'dedupe'
        else:
            error_type = 'other'
        
        error_counts[error_type] = error_counts.get(error_type, 0) + 1
    
    return error_counts


def main():
    """Main diagnostic function."""
    db_url = get_db_url()
    if not db_url:
        print("ERROR: Database URL not configured")
        sys.exit(1)
    
    # Get source IDs
    source_ids = get_source_ids(db_url)
    
    if 'unicef' not in source_ids and 'unesco' not in source_ids:
        print("ERROR: Could not find UNICEF or UNESCO source IDs")
        sys.exit(1)
    
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    results = {}
    
    for org_key, source_id in source_ids.items():
        org_name = org_key.upper()
        print(f"\n{'='*80}")
        print(f"Diagnosing failed inserts for: {org_name}")
        print(f"{'='*80}")
        
        data = extract_failed_inserts(db_url, source_id, org_name)
        
        if not data['table_exists']:
            print(f"⚠ failed_inserts table does not exist")
            data['summary'] = {
                'total_attempts': 0,
                'top_error_reasons': []
            }
        else:
            records = data['records']
            error_counts = analyze_errors(records)
            
            data['summary'] = {
                'total_attempts': len(records),
                'top_error_reasons': sorted(error_counts.items(), key=lambda x: x[1], reverse=True)[:3]
            }
            
            print(f"✓ Found {len(records)} failed insert records")
            if error_counts:
                print(f"  Top errors: {dict(list(error_counts.items())[:3])}")
        
        # Save report
        report_file = REPORT_DIR / f"failed_inserts_{org_key}_{timestamp}.json"
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump({
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'source_id': source_id,
                'org_name': org_name,
                'data': data
            }, f, indent=2, ensure_ascii=False, default=str)
        
        print(f"✓ Report saved: {report_file}")
        results[org_key] = {
            'source_id': source_id,
            'report_path': str(report_file),
            'summary': data['summary']
        }
    
    # Print summary
    print(f"\n{'='*80}")
    print("DIAGNOSTIC SUMMARY")
    print(f"{'='*80}")
    for org_key, result in results.items():
        print(f"\n{org_key.upper()}:")
        print(f"  Source ID: {result['source_id']}")
        print(f"  Total failed attempts: {result['summary']['total_attempts']}")
        print(f"  Top error reasons: {result['summary']['top_error_reasons']}")
        print(f"  Report: {result['report_path']}")


if __name__ == "__main__":
    main()

