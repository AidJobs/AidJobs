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

# Capture fields for fill-rate quality (growth plan §4.1 item 5 / W-39 D9).
# Measured on admitted (saved) rows only; never gates counting or expiry.
CAPTURE_FILL_FIELDS = (
    ("description", "description"),
    ("posted_on", "posted_on"),
    ("locations", "locations"),
    ("contract_type", "contract_type"),
    ("salary_range_text", "salary_range_text"),
    ("advert_language", "advert_language"),
    ("deadline", "deadline"),
    ("location_raw", "location_raw"),
    ("country", "country"),
    ("city", "city"),
)

# Path words that name a list of jobs rather than one job (UX-04).
LISTING_WORDS = frozenset({
    "jobs", "job", "careers", "career", "vacancies", "vacancy", "opportunities", "listing",
    "listings", "list", "search", "all", "index", "home", "internships", "results", "positions",
})
# Path words that introduce a single vacancy when an identifier follows them.
JOB_MARKERS = frozenset({
    "job", "jobs", "vacancy", "vacancies", "position", "positions", "posting", "requisition",
})
_PAGE_EXTENSION = re.compile(r"\.(html?|aspx?|php|jsp)$")
_IDENTIFIER = re.compile(r"\d{3,}|[0-9a-f]{8,}")


def is_listing_url(url: Optional[str]) -> bool:
    """True when an apply link points at a list of jobs, judged from its path alone.

    A link is a job when a job marker is followed, later in the path, by a segment that carries an
    identifier (three or more digits, or a long hex id); a job link is never a listing, whatever
    word it ends in. Otherwise it is a listing when it has no path or ends in a listing word.
    Host names and query strings are ignored. A value that does not parse as an absolute web
    address returns False: it is not classified here.
    """
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False
    segments = [_PAGE_EXTENSION.sub("", s) for s in parsed.path.lower().split("/") if s]
    for i, segment in enumerate(segments):
        if segment in JOB_MARKERS and any(_IDENTIFIER.search(s) for s in segments[i + 1:]):
            return False
    return not segments or segments[-1] in LISTING_WORDS


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
            except Exception:
                errors.append("URL parsing error")
            
            if is_listing_url(apply_url):
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
                
                # Get job statistics (admitted / saved rows: not deleted)
                cur.execute("""
                    SELECT 
                        COUNT(*) as total_jobs,
                        COUNT(DISTINCT apply_url) as unique_urls,
                        COUNT(CASE WHEN apply_url IS NULL THEN 1 END) as null_urls,
                        COUNT(CASE WHEN title IS NULL OR title = '' THEN 1 END) as missing_titles,
                        COUNT(CASE WHEN LENGTH(title) < 5 THEN 1 END) as short_titles,
                        COUNT(CASE WHEN description IS NOT NULL AND BTRIM(description) <> '' THEN 1 END) AS filled_description,
                        COUNT(CASE WHEN posted_on IS NOT NULL THEN 1 END) AS filled_posted_on,
                        COUNT(CASE WHEN locations IS NOT NULL AND cardinality(locations) > 0 THEN 1 END) AS filled_locations,
                        COUNT(CASE WHEN contract_type IS NOT NULL AND BTRIM(contract_type) <> '' THEN 1 END) AS filled_contract_type,
                        COUNT(CASE WHEN salary_range_text IS NOT NULL AND BTRIM(salary_range_text) <> '' THEN 1 END) AS filled_salary_range_text,
                        COUNT(CASE WHEN advert_language IS NOT NULL AND BTRIM(advert_language) <> '' THEN 1 END) AS filled_advert_language,
                        COUNT(CASE WHEN deadline IS NOT NULL THEN 1 END) AS filled_deadline,
                        COUNT(CASE WHEN location_raw IS NOT NULL AND BTRIM(location_raw) <> '' THEN 1 END) AS filled_location_raw,
                        COUNT(CASE WHEN country IS NOT NULL AND BTRIM(country) <> '' THEN 1 END) AS filled_country,
                        COUNT(CASE WHEN city IS NOT NULL AND BTRIM(city) <> '' THEN 1 END) AS filled_city
                    FROM jobs
                    WHERE source_id::text = %s
                    AND deleted_at IS NULL
                """, (source_id,))
                stats = cur.fetchone()
                if stats:
                    cur.execute("""
                        SELECT apply_url FROM jobs
                        WHERE source_id::text = %s
                        AND deleted_at IS NULL
                    """, (source_id,))
                    stats = dict(stats)
                    stats['listing_page_urls'] = sum(
                        1 for row in cur.fetchall() if is_listing_url(row.get('apply_url'))
                    )
                
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
                        'quality_score': 0.0,
                        'fill_rates': {
                            name: {'filled': 0, 'total': 0, 'rate': None}
                            for name, _ in CAPTURE_FILL_FIELDS
                        },
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
                
                total = stats_dict['total_jobs']
                fill_rates = {}
                for name, _column in CAPTURE_FILL_FIELDS:
                    filled = int(stats.get(f'filled_{name}', 0) or 0)
                    fill_rates[name] = {
                        'filled': filled,
                        'total': total,
                        'rate': round((filled / total) * 100.0, 1) if total else None,
                    }

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
                    'quality_score': self._calculate_quality_score(stats_dict, duplicates or []),
                    'fill_rates': fill_rates,
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
                        COUNT(CASE WHEN apply_url IS NULL THEN 1 END) as null_urls
                    FROM jobs
                    WHERE status = 'active'
                    AND deleted_at IS NULL
                """)
                global_stats = cur.fetchone()
                if global_stats:
                    cur.execute("""
                        SELECT apply_url FROM jobs
                        WHERE status = 'active'
                        AND deleted_at IS NULL
                    """)
                    global_stats = dict(global_stats)
                    global_stats['listing_page_urls'] = sum(
                        1 for row in cur.fetchall() if is_listing_url(row.get('apply_url'))
                    )
                
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
                
                # Sources with issues: jobs without a link, or whose link is a listing page
                cur.execute("""
                    SELECT source_id, apply_url FROM jobs
                    WHERE deleted_at IS NULL
                """)
                issue_counts: Dict = {}
                for row in cur.fetchall():
                    if row.get('apply_url') is None or is_listing_url(row.get('apply_url')):
                        issue_counts[row['source_id']] = issue_counts.get(row['source_id'], 0) + 1
                ranked = sorted(issue_counts.items(), key=lambda item: -item[1])[:10]
                sources_with_issues = [
                    {'source_id': source, 'issue_count': count} for source, count in ranked
                ]
                
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

