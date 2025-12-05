#!/usr/bin/env python3
"""
Diagnostic script to trace job insertion flow end-to-end.

This script simulates the extraction → validation → dedupe → DB insert flow
without actually writing to the database.
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Sample job URLs for testing
TEST_URLS = [
    "https://jobs.unicef.org/en-us/listing/",
    "https://jobs.undp.org/cj_view_jobs.cfm",
]


def get_db_conn():
    """Get database connection."""
    db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("Database URL not configured (SUPABASE_DB_URL or DATABASE_URL)")
    return psycopg2.connect(db_url, connect_timeout=5)


def check_table_exists(conn, table_name: str) -> bool:
    """Check if table exists."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = %s
            )
        """, (table_name,))
        return cur.fetchone()[0]


def get_table_columns(conn, table_name: str) -> List[str]:
    """Get list of columns in table."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = %s
            ORDER BY ordinal_position
        """, (table_name,))
        return [row[0] for row in cur.fetchall()]


def check_environment_flags() -> Dict[str, Any]:
    """Check environment variables that might affect insertion."""
    flags = {
        'EXTRACTION_USE_STORAGE': os.getenv('EXTRACTION_USE_STORAGE', 'false'),
        'EXTRACTION_SHADOW_MODE': os.getenv('EXTRACTION_SHADOW_MODE', 'true'),
        'EXTRACTION_USE_NEW_EXTRACTOR': os.getenv('EXTRACTION_USE_NEW_EXTRACTOR', 'false'),
        'DATABASE_URL': bool(os.getenv('DATABASE_URL')),
        'SUPABASE_DB_URL': bool(os.getenv('SUPABASE_DB_URL')),
    }
    
    # Check if shadow mode would redirect writes
    if flags['EXTRACTION_SHADOW_MODE'].lower() == 'true':
        flags['_shadow_table_used'] = 'jobs_side'
    else:
        flags['_shadow_table_used'] = 'jobs'
    
    return flags


def simulate_extraction_validation(job: Dict) -> Dict[str, Any]:
    """Simulate the validation logic from save_jobs."""
    result = {
        'passed': False,
        'issues': [],
        'canonical_hash': None,
        'would_insert': False,
        'would_update': False,
    }
    
    # Check required fields
    title = job.get('title', '').strip()
    apply_url = job.get('apply_url', '').strip()
    
    if not title:
        result['issues'].append('missing_title')
    elif len(title) < 3:
        result['issues'].append('title_too_short')
    
    if not apply_url:
        result['issues'].append('missing_apply_url')
    elif apply_url.startswith('#') or apply_url.startswith('javascript:'):
        result['issues'].append('invalid_url_pattern')
    
    if not result['issues']:
        result['passed'] = True
        
        # Generate canonical hash (same as save_jobs)
        import hashlib
        canonical_text = f"{title}|{apply_url}".lower()
        result['canonical_hash'] = hashlib.md5(canonical_text.encode()).hexdigest()
        result['would_insert'] = True
    
    return result


def check_duplicate_hash(conn, canonical_hash: str) -> Dict[str, Any]:
    """Check if canonical hash exists in database."""
    result = {
        'exists': False,
        'job_id': None,
        'is_deleted': False,
        'status': None,
    }
    
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, deleted_at, status 
                FROM jobs 
                WHERE canonical_hash = %s
            """, (canonical_hash,))
            row = cur.fetchone()
            if row:
                result['exists'] = True
                result['job_id'] = str(row[0])
                result['is_deleted'] = row[1] is not None
                result['status'] = row[2]
    except Exception as e:
        result['error'] = str(e)
    
    return result


def check_sql_construction_issues(insert_fields: List[str], insert_values: List) -> List[str]:
    """Check for SQL construction issues."""
    issues = []
    
    # Check for duplicate fields
    if len(insert_fields) != len(set(insert_fields)):
        duplicates = [f for f in insert_fields if insert_fields.count(f) > 1]
        issues.append(f"Duplicate fields: {duplicates}")
    
    # Check field/value count match
    # Note: NOW() values are handled separately, so we need to count them
    now_count = sum(1 for v in insert_values if v == "NOW()")
    placeholder_count = len(insert_values) - now_count
    
    if len(insert_fields) != len(insert_values):
        issues.append(f"Field/value count mismatch: {len(insert_fields)} fields, {len(insert_values)} values (NOW()={now_count})")
    
    return issues


def diagnose_sample_job(conn, job: Dict, source_id: str) -> Dict[str, Any]:
    """Diagnose a single job through the insertion flow."""
    diagnosis = {
        'job_title': job.get('title', 'Unknown')[:50],
        'job_url': job.get('apply_url', 'Unknown')[:100],
        'extraction': {},
        'validation': {},
        'dedupe': {},
        'sql_construction': {},
        'insertion_attempt': {},
    }
    
    # Step 1: Simulate validation
    validation_result = simulate_extraction_validation(job)
    diagnosis['validation'] = validation_result
    
    if not validation_result['passed']:
        diagnosis['insertion_attempt']['would_skip'] = True
        diagnosis['insertion_attempt']['reason'] = f"Validation failed: {', '.join(validation_result['issues'])}"
        return diagnosis
    
    # Step 2: Check dedupe hash
    canonical_hash = validation_result['canonical_hash']
    duplicate_check = check_duplicate_hash(conn, canonical_hash)
    diagnosis['dedupe'] = duplicate_check
    
    if duplicate_check['exists']:
        diagnosis['insertion_attempt']['would_update'] = True
        diagnosis['insertion_attempt']['would_insert'] = False
    else:
        diagnosis['insertion_attempt']['would_insert'] = True
        diagnosis['insertion_attempt']['would_update'] = False
    
    # Step 3: Simulate SQL construction (like save_jobs does)
    insert_fields = [
        "source_id", "org_name", "title", "apply_url",
        "location_raw", "canonical_hash",
        "status", "fetched_at", "last_seen_at"
    ]
    insert_values = [
        source_id,
        job.get('org_name', 'Unknown'),
        job.get('title', ''),
        job.get('apply_url', ''),
        job.get('location_raw', ''),
        canonical_hash,
        'active',
        "NOW()",
        "NOW()"
    ]
    
    # Add optional fields
    if job.get('deadline'):
        insert_fields.append("deadline")
        insert_values.append(job.get('deadline'))
    
    sql_issues = check_sql_construction_issues(insert_fields, insert_values)
    diagnosis['sql_construction'] = {
        'fields': insert_fields,
        'field_count': len(insert_fields),
        'value_count': len(insert_values),
        'issues': sql_issues,
    }
    
    if sql_issues:
        diagnosis['insertion_attempt']['would_fail'] = True
        diagnosis['insertion_attempt']['reason'] = f"SQL construction issues: {', '.join(sql_issues)}"
    
    return diagnosis


def main():
    """Run diagnostic."""
    logger.info("Starting insertion flow diagnosis...")
    
    diagnosis_report = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'environment_flags': check_environment_flags(),
        'database_checks': {},
        'sample_job_diagnoses': [],
        'findings': [],
        'recommendations': [],
    }
    
    # Check database connection and schema
    try:
        conn = get_db_conn()
        logger.info("✓ Database connection successful")
        
        # Check if jobs table exists
        jobs_exists = check_table_exists(conn, 'jobs')
        diagnosis_report['database_checks']['jobs_table_exists'] = jobs_exists
        
        if jobs_exists:
            jobs_columns = get_table_columns(conn, 'jobs')
            diagnosis_report['database_checks']['jobs_table_columns'] = jobs_columns
            diagnosis_report['database_checks']['jobs_table_column_count'] = len(jobs_columns)
            
            # Check for required columns
            required_columns = ['id', 'source_id', 'title', 'apply_url', 'canonical_hash', 'status']
            missing_columns = [col for col in required_columns if col not in jobs_columns]
            if missing_columns:
                diagnosis_report['findings'].append(f"Missing required columns: {missing_columns}")
        
        # Check shadow table if shadow mode is enabled
        if diagnosis_report['environment_flags']['EXTRACTION_SHADOW_MODE'].lower() == 'true':
            shadow_exists = check_table_exists(conn, 'jobs_side')
            diagnosis_report['database_checks']['jobs_side_table_exists'] = shadow_exists
            if not shadow_exists:
                diagnosis_report['findings'].append("Shadow mode enabled but jobs_side table does not exist")
        
        # Check for sample source
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT id, org_name, careers_url 
                FROM sources 
                WHERE status = 'active' 
                LIMIT 1
            """)
            source = cur.fetchone()
            if source:
                diagnosis_report['database_checks']['sample_source'] = {
                    'id': str(source['id']),
                    'org_name': source['org_name'],
                    'careers_url': source['careers_url'],
                }
                
                # Diagnose a sample job
                sample_job = {
                    'title': 'Test Job Title',
                    'apply_url': 'https://example.com/job/123',
                    'org_name': source['org_name'],
                    'location_raw': 'New York, USA',
                }
                job_diagnosis = diagnose_sample_job(conn, sample_job, str(source['id']))
                diagnosis_report['sample_job_diagnoses'].append(job_diagnosis)
        
        conn.close()
        
    except Exception as e:
        logger.error(f"✗ Database check failed: {e}")
        diagnosis_report['database_checks']['error'] = str(e)
        diagnosis_report['findings'].append(f"Database connection failed: {e}")
    
    # Analyze findings
    if diagnosis_report['environment_flags']['EXTRACTION_SHADOW_MODE'].lower() == 'true':
        diagnosis_report['findings'].append("Shadow mode is enabled - jobs would be written to jobs_side table, not jobs table")
    
    if diagnosis_report['environment_flags']['EXTRACTION_USE_STORAGE'].lower() == 'false':
        diagnosis_report['findings'].append("EXTRACTION_USE_STORAGE is false - pipeline storage integration is disabled (this is OK for SimpleCrawler)")
    
    # Generate recommendations
    if 'Missing required columns' in str(diagnosis_report['findings']):
        diagnosis_report['recommendations'].append("Run database migrations to add missing columns")
    
    if 'jobs_side table does not exist' in str(diagnosis_report['findings']):
        diagnosis_report['recommendations'].append("Create jobs_side table or disable EXTRACTION_SHADOW_MODE")
    
    if diagnosis_report['environment_flags']['EXTRACTION_SHADOW_MODE'].lower() == 'true':
        diagnosis_report['recommendations'].append("Check jobs_side table for inserted jobs, not jobs table")
    
    # Save report
    report_path = Path(__file__).parent.parent / "report" / "insertion_diagnosis.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(diagnosis_report, indent=2), encoding='utf-8')
    
    logger.info(f"Diagnosis complete. Report saved to: {report_path}")
    
    # Print summary
    print("\n=== DIAGNOSIS SUMMARY ===")
    print(f"Environment Flags: {json.dumps(diagnosis_report['environment_flags'], indent=2)}")
    print(f"\nFindings ({len(diagnosis_report['findings'])}):")
    for finding in diagnosis_report['findings']:
        print(f"  - {finding}")
    print(f"\nRecommendations ({len(diagnosis_report['recommendations'])}):")
    for rec in diagnosis_report['recommendations']:
        print(f"  - {rec}")
    
    return diagnosis_report


if __name__ == "__main__":
    main()

