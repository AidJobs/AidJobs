#!/usr/bin/env python3
"""
Diagnostic script to analyze enrichment pipeline bias.
Runs database queries to understand current distribution of enrichments.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from psycopg2.extras import RealDictCursor
from app.db_config import db_config

def run_query(cursor, query, description):
    """Run a query and return results."""
    print(f"\n{'='*60}")
    print(f"{description}")
    print('='*60)
    try:
        cursor.execute(query)
        results = cursor.fetchall()
        return results
    except Exception as e:
        print(f"ERROR: {e}")
        return []

def main():
    print("Enrichment Pipeline Bias Diagnosis")
    print("="*60)
    
    # Check database connection
    conn_params = db_config.get_connection_params()
    if not conn_params:
        print("ERROR: Database not configured. Set SUPABASE_DB_URL environment variable.")
        sys.exit(1)
    
    try:
        conn = psycopg2.connect(**conn_params, connect_timeout=5)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query 1: Experience level distribution
        query1 = """
        SELECT experience_level, COUNT(*) as count 
        FROM jobs 
        WHERE experience_level IS NOT NULL 
        GROUP BY experience_level 
        ORDER BY count DESC;
        """
        results1 = run_query(cursor, query1, "Experience Level Distribution")
        total_exp = sum(r['count'] for r in results1)
        for row in results1:
            pct = (row['count'] / total_exp * 100) if total_exp > 0 else 0
            print(f"  {row['experience_level'] or 'NULL'}: {row['count']} ({pct:.1f}%)")
        
        # Query 2: Impact domain distribution
        query2 = """
        SELECT 
            unnest(impact_domain) as domain,
            COUNT(*) as count
        FROM jobs 
        WHERE impact_domain IS NOT NULL AND array_length(impact_domain, 1) > 0
        GROUP BY domain
        ORDER BY count DESC;
        """
        results2 = run_query(cursor, query2, "Impact Domain Distribution")
        total_domains = sum(r['count'] for r in results2)
        for row in results2:
            pct = (row['count'] / total_domains * 100) if total_domains > 0 else 0
            print(f"  {row['domain'] or 'NULL'}: {row['count']} ({pct:.1f}%)")
        
        # Query 3: Low confidence jobs
        query3 = """
        SELECT 
            experience_level, 
            impact_domain, 
            confidence_overall,
            experience_confidence,
            title,
            LENGTH(description_snippet) as desc_length
        FROM jobs 
        WHERE confidence_overall IS NOT NULL AND confidence_overall < 0.70 
        ORDER BY confidence_overall ASC 
        LIMIT 20;
        """
        results3 = run_query(cursor, query3, "Jobs with Low Confidence (< 0.70)")
        if results3:
            for row in results3:
                domains = ', '.join(row['impact_domain'] or [])
                print(f"  Title: {row['title'][:60]}...")
                print(f"    Experience: {row['experience_level']}")
                print(f"    Impact Domain: {domains}")
                print(f"    Confidence: {row['confidence_overall']:.2f} (exp: {row['experience_confidence'] or 'N/A'})")
                print(f"    Description Length: {row['desc_length'] or 0} chars")
                print()
        else:
            print("  No low-confidence jobs found.")
        
        # Query 4: Jobs with empty/short descriptions
        query4 = """
        SELECT 
            id, 
            title, 
            LENGTH(description_snippet) as desc_length,
            experience_level,
            impact_domain,
            confidence_overall
        FROM jobs 
        WHERE LENGTH(description_snippet) < 50 OR description_snippet IS NULL
        ORDER BY COALESCE(LENGTH(description_snippet), 0) ASC 
        LIMIT 20;
        """
        results4 = run_query(cursor, query4, "Jobs with Empty/Short Descriptions (< 50 chars)")
        if results4:
            for row in results4:
                domains = ', '.join(row['impact_domain'] or [])
                print(f"  Title: {row['title'][:60]}...")
                print(f"    Description Length: {row['desc_length'] or 0} chars")
                print(f"    Experience: {row['experience_level']}")
                print(f"    Impact Domain: {domains}")
                print(f"    Confidence: {row['confidence_overall'] or 'N/A'}")
                print()
        else:
            print("  No jobs with short descriptions found.")
        
        # Query 5: Overall statistics
        query5 = """
        SELECT 
            COUNT(*) as total_jobs,
            COUNT(experience_level) as jobs_with_experience,
            COUNT(impact_domain) as jobs_with_impact_domain,
            COUNT(confidence_overall) as jobs_with_confidence,
            AVG(confidence_overall) as avg_confidence,
            AVG(experience_confidence) as avg_experience_confidence,
            COUNT(CASE WHEN confidence_overall < 0.60 THEN 1 END) as low_confidence_count,
            COUNT(CASE WHEN LENGTH(description_snippet) < 50 OR description_snippet IS NULL THEN 1 END) as short_desc_count
        FROM jobs
        WHERE status = 'active';
        """
        results5 = run_query(cursor, query5, "Overall Enrichment Statistics")
        if results5:
            row = results5[0]
            print(f"  Total Active Jobs: {row['total_jobs']}")
            print(f"  Jobs with Experience Level: {row['jobs_with_experience']} ({row['jobs_with_experience']/row['total_jobs']*100:.1f}%)")
            print(f"  Jobs with Impact Domain: {row['jobs_with_impact_domain']} ({row['jobs_with_impact_domain']/row['total_jobs']*100:.1f}%)")
            print(f"  Jobs with Confidence Score: {row['jobs_with_confidence']} ({row['jobs_with_confidence']/row['total_jobs']*100:.1f}%)")
            print(f"  Average Confidence: {row['avg_confidence']:.3f}" if row['avg_confidence'] else "  Average Confidence: N/A")
            print(f"  Average Experience Confidence: {row['avg_experience_confidence']:.3f}" if row['avg_experience_confidence'] else "  Average Experience Confidence: N/A")
            print(f"  Low Confidence Jobs (<0.60): {row['low_confidence_count']} ({row['low_confidence_count']/row['total_jobs']*100:.1f}%)")
            print(f"  Short Description Jobs (<50 chars): {row['short_desc_count']} ({row['short_desc_count']/row['total_jobs']*100:.1f}%)")
        
        cursor.close()
        conn.close()
        
        print("\n" + "="*60)
        print("Diagnosis Complete")
        print("="*60)
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()

