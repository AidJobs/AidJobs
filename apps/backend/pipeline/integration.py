"""
Integration layer between new pipeline and existing crawlers.

This module adapts the new extraction pipeline to work with existing
SimpleCrawler, SimpleRSSCrawler, and SimpleAPICrawler.
"""

import logging
from typing import Dict, List, Optional
from bs4 import BeautifulSoup

from .extractor import Extractor

logger = logging.getLogger(__name__)


class PipelineAdapter:
    """Adapts new pipeline to existing crawler interface."""
    
    def __init__(self, db_url: Optional[str] = None, enable_ai: bool = True, 
                 shadow_mode: bool = False):
        self.extractor = Extractor(
            db_url=db_url,
            enable_ai=enable_ai,
            enable_snapshots=True,
            shadow_mode=shadow_mode
        )
        self.shadow_mode = shadow_mode
    
    async def extract_jobs_from_html(self, html: str, base_url: str) -> List[Dict]:
        """
        Extract jobs from HTML using new pipeline.
        
        Returns:
            List of job dictionaries compatible with existing format
        """
        # Use new extractor
        result = await self.extractor.extract_from_html(html, base_url)
        
        # Convert to existing format
        jobs = []
        
        if result.is_job:
            job = {}
            
            # Map fields
            title_field = result.get_field('title')
            if title_field and title_field.value:
                job['title'] = title_field.value
            
            employer_field = result.get_field('employer')
            if employer_field and employer_field.value:
                job['employer'] = employer_field.value
            
            location_field = result.get_field('location')
            if location_field and location_field.value:
                job['location_raw'] = location_field.value
            
            deadline_field = result.get_field('deadline')
            if deadline_field and deadline_field.value:
                job['deadline'] = deadline_field.value
            
            description_field = result.get_field('description')
            if description_field and description_field.value:
                job['description_snippet'] = description_field.value[:500]
            
            application_url_field = result.get_field('application_url')
            if application_url_field and application_url_field.value:
                job['apply_url'] = application_url_field.value
            else:
                # Fallback to base URL if no application URL found
                job['apply_url'] = base_url
            
            # Only add if we have at least a title
            if job.get('title'):
                jobs.append(job)
        
        return jobs
    
    async def extract_from_rss_entry(self, entry: Dict, url: str) -> Dict:
        """Extract from RSS entry."""
        result = await self.extractor.extract_from_rss(entry, url)
        
        # Convert to existing format
        job = {}
        
        title_field = result.get_field('title')
        if title_field and title_field.value:
            job['title'] = title_field.value
        
        application_url_field = result.get_field('application_url')
        if application_url_field and application_url_field.value:
            job['apply_url'] = application_url_field.value
        else:
            job['apply_url'] = url
        
        description_field = result.get_field('description')
        if description_field and description_field.value:
            job['description_snippet'] = description_field.value[:500]
        
        location_field = result.get_field('location')
        if location_field and location_field.value:
            job['location_raw'] = location_field.value
        
        deadline_field = result.get_field('deadline')
        if deadline_field and deadline_field.value:
            job['deadline'] = deadline_field.value
        
        return job
    
    async def extract_from_json(self, json_data: Dict, url: str) -> Dict:
        """Extract from JSON API response."""
        result = await self.extractor.extract_from_json(json_data, url)
        
        # Convert to existing format
        job = {}
        
        for field_name in ['title', 'employer', 'location', 'deadline', 'description', 'application_url']:
            field_result = result.get_field(field_name)
            if field_result and field_result.value:
                if field_name == 'application_url':
                    job['apply_url'] = field_result.value
                elif field_name == 'location':
                    job['location_raw'] = field_result.value
                elif field_name == 'description':
                    job['description_snippet'] = str(field_result.value)[:500]
                else:
                    job[field_name] = field_result.value
        
        return job

