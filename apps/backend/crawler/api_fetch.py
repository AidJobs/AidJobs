"""
API-based job fetching (JSON endpoints)
"""
import logging
import json
from typing import List, Dict, Optional
import jsonpath_ng
from jsonpath_ng.ext import parse

from core.net import HTTPClient

logger = logging.getLogger(__name__)


class APICrawler:
    """JSON API crawler"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.http_client = HTTPClient()
    
    async def fetch_api(self, url: str, parser_hint: Optional[str] = None) -> List[Dict]:
        """
        Fetch JSON API and extract jobs.
        
        parser_hint format (JSON):
            {
                "jobs_path": "$.data.jobs[*]",
                "title_path": "$.title",
                "url_path": "$.url",
                "location_path": "$.location",
                "description_path": "$.description"
            }
        
        Returns:
            List of raw job dicts
        """
        try:
            status, headers, body, size = await self.http_client.fetch(url, max_size_kb=2048)
            
            if status != 200:
                logger.warning(f"[api_fetch] Non-200 status for {url}: {status}")
                return []
            
            # Parse JSON
            data = json.loads(body.decode('utf-8'))
            
            # Use parser hint if provided
            if parser_hint:
                return self._extract_with_hint(data, parser_hint)
            else:
                # Try common patterns
                return self._extract_auto(data)
        
        except Exception as e:
            logger.error(f"[api_fetch] Error fetching API {url}: {e}")
            return []
    
    def _extract_with_hint(self, data: Dict, hint_json: str) -> List[Dict]:
        """Extract jobs using JSONPath hints"""
        try:
            hint = json.loads(hint_json)
            
            # Get jobs array
            jobs_expr = parse(hint.get('jobs_path', '$[*]'))
            job_items = [match.value for match in jobs_expr.find(data)]
            
            jobs = []
            for item in job_items:
                job = {}
                
                # Extract fields
                if 'title_path' in hint:
                    title_expr = parse(hint['title_path'])
                    matches = title_expr.find(item)
                    if matches:
                        job['title'] = matches[0].value
                
                if 'url_path' in hint:
                    url_expr = parse(hint['url_path'])
                    matches = url_expr.find(item)
                    if matches:
                        job['apply_url'] = matches[0].value
                
                if 'location_path' in hint:
                    loc_expr = parse(hint['location_path'])
                    matches = loc_expr.find(item)
                    if matches:
                        job['location_raw'] = matches[0].value
                
                if 'description_path' in hint:
                    desc_expr = parse(hint['description_path'])
                    matches = desc_expr.find(item)
                    if matches:
                        job['description_snippet'] = str(matches[0].value)[:500]
                
                if job.get('title'):
                    jobs.append(job)
            
            logger.info(f"[api_fetch] Extracted {len(jobs)} jobs using hints")
            return jobs
        
        except Exception as e:
            logger.error(f"[api_fetch] Error extracting with hint: {e}")
            return []
    
    def _extract_auto(self, data: Dict) -> List[Dict]:
        """Auto-detect jobs in common JSON structures"""
        jobs = []
        
        # Common patterns: data.jobs, jobs, results, data.results, items
        job_arrays = []
        
        if isinstance(data, list):
            job_arrays = data
        elif isinstance(data, dict):
            for key in ['jobs', 'results', 'items', 'data', 'positions', 'vacancies']:
                if key in data:
                    val = data[key]
                    if isinstance(val, list):
                        job_arrays = val
                        break
                    elif isinstance(val, dict) and 'jobs' in val:
                        job_arrays = val['jobs']
                        break
        
        if not job_arrays:
            logger.warning("[api_fetch] Could not auto-detect jobs array")
            return []
        
        # Extract from each item
        for item in job_arrays:
            if not isinstance(item, dict):
                continue
            
            job = {}
            
            # Title (common keys)
            for key in ['title', 'name', 'position', 'job_title']:
                if key in item:
                    job['title'] = str(item[key])
                    break
            
            # URL
            for key in ['url', 'link', 'apply_url', 'href', 'job_url']:
                if key in item:
                    job['apply_url'] = str(item[key])
                    break
            
            # Location
            for key in ['location', 'city', 'place', 'country']:
                if key in item:
                    job['location_raw'] = str(item[key])
                    break
            
            # Description
            for key in ['description', 'summary', 'details', 'snippet']:
                if key in item:
                    job['description_snippet'] = str(item[key])[:500]
                    break
            
            if job.get('title'):
                jobs.append(job)
        
        logger.info(f"[api_fetch] Auto-extracted {len(jobs)} jobs")
        return jobs
