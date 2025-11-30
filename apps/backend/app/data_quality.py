"""
Data quality validation module for AidJobs.

Provides validation functions for:
- Pre-upsert validation (duplicate URLs, missing fields, invalid data)
- Post-upsert validation (unique apply_urls, orphaned jobs)
- Data quality reporting
"""
import logging
import re
from typing import List, Dict, Optional, Tuple
from urllib.parse import urlparse
import psycopg2  # type: ignore
from psycopg2.extras import RealDictCursor  # type: ignore

logger = logging.getLogger(__name__)


class DataQualityValidator:
    """Validates job data quality before and after upsert"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
    
    def _get_db_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url)
    
    def validate_job(self, job: Dict, source_base_url: Optional[str] = None) -> Tuple[bool, List[str]]:
        """
        Validate a single job before upsert.
        
        Returns:
            (is_valid, list_of_errors)
        """
        errors = []
        
        # Required fields
        if not job.get('title'):
            errors.append("Missing title")
        elif len(job.get('title', '').strip()) < 5:
            errors.append(f"Title too short: '{job.get('title', '')[:30]}'")
        
        if not job.get('apply_url'):
            errors.append("Missing apply_url")
        else:
            apply_url = job.get('apply_url', '').strip()
            
            # Validate URL format
            try:
                parsed = urlparse(apply_url)
                if not parsed.scheme or not parsed.netloc:
                    errors.append(f"Invalid URL format: {apply_url[:80]}")
            except Exception as e:
                errors.append(f"URL parsing error: {str(e)}")
            
            # Check if URL is a listing page
            if any(kw in apply_url.lower() for kw in ['/jobs', '/careers', '/vacancies', '/opportunities', '/list', '/search', '/all', '/index']):
                errors.append(f"URL appears to be listing page: {apply_url[:80]}")
            
            # Check if URL is base URL
            if source_base_url:
                base_normalized = source_base_url.rstrip('/').split('#')[0].split('?')[0]
                url_normalized = apply_url.rstrip('/').split('#')[0].split('?')[0]
                if base_normalized == url_normalized:
                    errors.append(f"URL is base URL: {apply_url[:80]}")
        
        # Validate canonical_hash
        if not job.get('canonical_hash'):
            errors.append("Missing canonical_hash")
        elif len(job.get('canonical_hash', '')) < 8:
            errors.append("canonical_hash too short")
        
        return len(errors) == 0, errors
    
    def check_duplicate_urls(self, jobs: List[Dict], source_id: Optional[str] = None) -> Dict:
        """
        Check for duplicate URLs within a batch of jobs.
        
        Returns:
            {
                'has_duplicates': bool,
                'duplicate_count': int,
                'duplicate_urls': List[str],
                'url_to_titles': Dict[str, List[str]]
            }
        """
        url_counts = {}
        url_to_titles = {}
        
        for job in jobs:
            url = job.get('apply_url', '').strip()
            if not url:
                continue
            
            # Normalize URL
            normalized = url.rstrip('/').split('#')[0].split('?')[0]
            
            url_counts[normalized] = url_counts.get(normalized, 0) + 1
            if normalized not in url_to_titles:
                url_to_titles[normalized] = []
            url_to_titles[normalized].append(job.get('title', 'Unknown')[:100])
        
        duplicate_urls = [url for url, count in url_counts.items() if count > 1]
        
        return {
            'has_duplicates': len(duplicate_urls) > 0,
            'duplicate_count': len(duplicate_urls),
            'duplicate_urls': duplicate_urls[:10],  # Limit to first 10
            'url_to_titles': {url: url_to_titles[url] for url in duplicate_urls[:10]}
        }
    
    def validate_batch(self, jobs: List[Dict], source_base_url: Optional[str] = None) -> Dict:
        """
        Validate a batch of jobs before upsert.
        
        Returns:
            {
                'valid_count': int,
                'invalid_count': int,
                'invalid_jobs': List[Dict],
                'duplicate_check': Dict,
                'summary': str
            }
        """
        valid_count = 0
        invalid_count = 0
        invalid_jobs = []
        
        for job in jobs:
            is_valid, errors = self.validate_job(job, source_base_url)
            if is_valid:
                valid_count += 1
            else:
                invalid_count += 1
                invalid_jobs.append({
                    'job': {
                        'title': job.get('title', '')[:100],
                        'apply_url': job.get('apply_url', '')[:150]
                    },
                    'errors': errors
                })
        
        # Check for duplicate URLs
        duplicate_check = self.check_duplicate_urls(jobs)
        
        summary = f"Validated {len(jobs)} jobs: {valid_count} valid, {invalid_count} invalid"
        if duplicate_check['has_duplicates']:
            summary += f", {duplicate_check['duplicate_count']} duplicate URLs"
        
        return {
            'valid_count': valid_count,
            'invalid_count': invalid_count,
            'invalid_jobs': invalid_jobs[:20],  # Limit to first 20
            'duplicate_check': duplicate_check,
            'summary': summary
        }
    
    def get_source_quality_report(self, source_id: str) -> Dict:
        """
        Get data quality report for a specific source.
        
        Returns:
            {
                'source_id': str,
                'total_jobs': int,
                'unique_urls': int,
                'null_urls': int,
                'listing_page_urls': int,
                'duplicate_urls': List[Dict],
                'missing_titles': int,
                'short_titles': int
            }
        """
        conn = self._get_db_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Get source info
                cur.execute("""
                    SELECT id, org_name, careers_url
                    FROM sources
                    WHERE id::text = %s
                """, (source_id,))
                source = cur.fetchone()
                
                if not source:
                    return {
                        'error': 'Source not found'
                    }
                
                # Get job statistics
                cur.execute("""
                    SELECT 
                        COUNT(*) as total_jobs,
                        COUNT(DISTINCT apply_url) as unique_urls,
                        COUNT(CASE WHEN apply_url IS NULL THEN 1 END) as null_urls,
                        COUNT(CASE 
                            WHEN apply_url LIKE '%/jobs%' 
                            OR apply_url LIKE '%/careers%'
                            OR apply_url LIKE '%/vacancies%'
                            OR apply_url LIKE '%/opportunities%'
                            OR apply_url LIKE '%/list%'
                            OR apply_url LIKE '%/search%'
                            OR apply_url LIKE '%/all%'
                            OR apply_url LIKE '%/index%'
                            THEN 1 
                        END) as listing_page_urls,
                        COUNT(CASE WHEN title IS NULL OR title = '' THEN 1 END) as missing_titles,
                        COUNT(CASE WHEN LENGTH(title) < 5 THEN 1 END) as short_titles
                    FROM jobs
                    WHERE source_id::text = %s
                    AND deleted_at IS NULL
                """, (source_id,))
                stats = cur.fetchone()
                
                # Ensure stats is not None and has required keys
                if not stats:
                    # Return empty report if no jobs found (not an error)
                    return {
                        'source_id': str(source_id),
                        'source_name': source.get('org_name') if source else None,
                        'source_url': source.get('careers_url') if source else None,
                        'total_jobs': 0,
                        'unique_urls': 0,
                        'null_urls': 0,
                        'listing_page_urls': 0,
                        'missing_titles': 0,
                        'short_titles': 0,
                        'duplicate_urls': [],
                        'quality_score': 0.0
                    }
                
                # Ensure all required keys exist with defaults
                stats_dict = {
                    'total_jobs': stats.get('total_jobs', 0) or 0,
                    'unique_urls': stats.get('unique_urls', 0) or 0,
                    'null_urls': stats.get('null_urls', 0) or 0,
                    'listing_page_urls': stats.get('listing_page_urls', 0) or 0,
                    'missing_titles': stats.get('missing_titles', 0) or 0,
                    'short_titles': stats.get('short_titles', 0) or 0,
                }
                
                # Find duplicate URLs
                cur.execute("""
                    SELECT apply_url, COUNT(*) as count, 
                           array_agg(title ORDER BY fetched_at DESC) as titles
                    FROM jobs
                    WHERE source_id::text = %s
                    AND deleted_at IS NULL
                    AND apply_url IS NOT NULL
                    GROUP BY apply_url
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC
                    LIMIT 10
                """, (source_id,))
                duplicates = cur.fetchall()
                
                # Safely extract duplicate URLs
                duplicate_urls_list = []
                if duplicates:
                    for dup in duplicates:
                        try:
                            apply_url = dup.get('apply_url') or ''
                            duplicate_urls_list.append({
                                'url': apply_url[:150] if apply_url else '',
                                'count': dup.get('count', 0) or 0,
                                'titles': (dup.get('titles') or [])[:3]  # First 3 titles
                            })
                        except Exception as e:
                            # Skip invalid duplicate entries
                            continue
                
                return {
                    'source_id': str(source_id),
                    'source_name': source.get('org_name'),
                    'source_url': source.get('careers_url'),
                    'total_jobs': stats_dict['total_jobs'],
                    'unique_urls': stats_dict['unique_urls'],
                    'null_urls': stats_dict['null_urls'],
                    'listing_page_urls': stats_dict['listing_page_urls'],
                    'missing_titles': stats_dict['missing_titles'],
                    'short_titles': stats_dict['short_titles'],
                    'duplicate_urls': duplicate_urls_list,
                    'quality_score': self._calculate_quality_score(stats_dict, duplicates or [])
                }
        finally:
            conn.close()
    
    def _calculate_quality_score(self, stats: Dict, duplicates: List) -> float:
        """Calculate a quality score (0-100) based on statistics"""
        total = stats['total_jobs']
        if total == 0:
            return 0.0
        
        # Deduct points for issues
        score = 100.0
        
        # Null URLs
        score -= (stats['null_urls'] / total) * 30
        
        # Listing page URLs
        score -= (stats['listing_page_urls'] / total) * 25
        
        # Missing titles
        score -= (stats['missing_titles'] / total) * 20
        
        # Short titles
        score -= (stats['short_titles'] / total) * 10
        
        # Duplicate URLs
        duplicate_count = sum(dup['count'] - 1 for dup in duplicates)  # Count extra occurrences
        score -= (duplicate_count / total) * 15
        
        return max(0.0, min(100.0, score))
    
    def get_global_quality_report(self) -> Dict:
        """
        Get global data quality report across all sources.
        
        Returns:
            {
                'total_jobs': int,
                'total_sources': int,
                'sources_with_issues': int,
                'global_quality_score': float,
                'top_issues': List[Dict]
            }
        """
        conn = self._get_db_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Global statistics
                cur.execute("""
                    SELECT 
                        COUNT(DISTINCT source_id) as total_sources,
                        COUNT(*) as total_jobs,
                        COUNT(DISTINCT apply_url) as unique_urls,
                        COUNT(CASE WHEN apply_url IS NULL THEN 1 END) as null_urls,
                        COUNT(CASE 
                            WHEN apply_url LIKE '%/jobs%' 
                            OR apply_url LIKE '%/careers%'
                            OR apply_url LIKE '%/vacancies%'
                            OR apply_url LIKE '%/opportunities%'
                            OR apply_url LIKE '%/list%'
                            OR apply_url LIKE '%/search%'
                            THEN 1 
                        END) as listing_page_urls
                    FROM jobs
                    WHERE status = 'active'
                    AND deleted_at IS NULL
                """)
                global_stats = cur.fetchone()
                
                # Handle None result
                if not global_stats:
                    global_stats = {
                        'total_sources': 0,
                        'total_jobs': 0,
                        'unique_urls': 0,
                        'null_urls': 0,
                        'listing_page_urls': 0
                    }
                else:
                    # Ensure all keys exist with defaults
                    global_stats = dict(global_stats)
                    global_stats.setdefault('total_sources', 0)
                    global_stats.setdefault('total_jobs', 0)
                    global_stats.setdefault('unique_urls', 0)
                    global_stats.setdefault('null_urls', 0)
                    global_stats.setdefault('listing_page_urls', 0)
                
                # Sources with issues
                cur.execute("""
                    SELECT source_id, COUNT(*) as issue_count
                    FROM (
                        SELECT source_id FROM jobs WHERE apply_url IS NULL AND deleted_at IS NULL
                        UNION ALL
                        SELECT source_id FROM jobs 
                        WHERE deleted_at IS NULL
                        AND (apply_url LIKE '%/jobs%' OR apply_url LIKE '%/careers%')
                    ) issues
                    GROUP BY source_id
                    ORDER BY issue_count DESC
                    LIMIT 10
                """)
                sources_with_issues = cur.fetchall()
                
                # Calculate global quality score
                total = global_stats['total_jobs']
                if total == 0:
                    quality_score = 0.0
                else:
                    quality_score = 100.0
                    quality_score -= (global_stats['null_urls'] / total) * 30
                    quality_score -= (global_stats['listing_page_urls'] / total) * 25
                    quality_score = max(0.0, min(100.0, quality_score))
                
                return {
                    'total_jobs': global_stats['total_jobs'],
                    'total_sources': global_stats['total_sources'],
                    'unique_urls': global_stats['unique_urls'],
                    'null_urls': global_stats['null_urls'],
                    'listing_page_urls': global_stats['listing_page_urls'],
                    'sources_with_issues': len(sources_with_issues),
                    'global_quality_score': round(quality_score, 2),
                    'top_issue_sources': [
                        {
                            'source_id': str(row['source_id']),
                            'issue_count': row['issue_count']
                        }
                        for row in sources_with_issues
                    ]
                }
        finally:
            conn.close()

