"""
AI-powered job extraction using LLM.

This uses OpenRouter/OpenAI to extract structured job data from HTML,
handling different site structures automatically without hardcoded rules.
"""

import logging
import json
import re
from typing import Dict, List, Optional
from bs4 import BeautifulSoup
import httpx

logger = logging.getLogger(__name__)


class AIJobExtractor:
    """
    Extract job data from HTML using AI/LLM.
    
    This is more reliable than rule-based extraction because:
    1. AI understands context and semantics
    2. Handles different HTML structures automatically
    3. Can extract fields even when structure is unclear
    4. Less brittle than regex/selector-based extraction
    """
    
    def __init__(self, api_key: Optional[str] = None, model: str = "openai/gpt-4o-mini"):
        """
        Initialize AI extractor.
        
        Args:
            api_key: OpenRouter API key (or set OPENROUTER_API_KEY env var)
            model: Model to use (default: gpt-4o-mini for cost-effectiveness)
        """
        import os
        self.api_key = api_key or os.getenv('OPENROUTER_API_KEY')
        self.model = model
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"
        
        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not set - AI extraction will be disabled")
    
    def extract_jobs_from_html(self, html: str, base_url: str, max_jobs: int = 100) -> List[Dict]:
        """
        Extract jobs from HTML using AI.
        
        This is the main entry point - it intelligently finds job listings
        and extracts structured data from them.
        """
        if not self.api_key:
            logger.warning("AI extraction disabled - no API key")
            return []
        
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Step 1: Find job listing containers using AI
            job_containers = self._find_job_containers(soup, base_url)
            
            if not job_containers:
                logger.info("AI found no job containers")
                return []
            
            logger.info(f"AI found {len(job_containers)} potential job containers")
            
            # Step 2: Extract structured data from each container
            jobs = []
            for i, container in enumerate(job_containers[:max_jobs]):
                try:
                    job = self._extract_job_from_container(container, base_url)
                    if job and job.get('title') and job.get('apply_url'):
                        jobs.append(job)
                except Exception as e:
                    logger.warning(f"Error extracting job {i}: {e}")
                    continue
            
            logger.info(f"AI extracted {len(jobs)} jobs")
            return jobs
            
        except Exception as e:
            logger.error(f"Error in AI extraction: {e}", exc_info=True)
            return []
    
    def _find_job_containers(self, soup: BeautifulSoup, base_url: str) -> List:
        """
        Use AI to identify job listing containers in HTML.
        
        Returns list of BeautifulSoup elements that contain job listings.
        """
        # Get a clean text representation of the page structure
        # Limit to first 50KB to avoid token limits
        page_text = soup.get_text()[:50000]
        
        # Also get HTML structure (simplified)
        html_snippet = str(soup)[:30000]  # Limit HTML size
        
        prompt = f"""You are analyzing a job board webpage. Your task is to identify where job listings are located.

HTML Structure (first 30KB):
{html_snippet[:30000]}

Page Text (first 50KB):
{page_text[:50000]}

Instructions:
1. Identify the main container(s) that hold job listings
2. Look for patterns like: tables with job rows, lists of job cards, div containers with job information
3. Return a JSON array with CSS selectors that would match job listing containers
4. Each selector should target a single job listing (not the container of all listings)

Example response:
{{
  "selectors": [
    "table tbody tr",
    "div.job-listing",
    "li.job-item"
  ],
  "strategy": "table-based" // or "card-based", "list-based", etc.
}}

Return ONLY valid JSON, no other text."""

        try:
            response = self._call_llm(prompt)
            result = json.loads(response)
            
            selectors = result.get('selectors', [])
            if not selectors:
                return []
            
            # Try each selector
            containers = []
            for selector in selectors:
                try:
                    elements = soup.select(selector)
                    if elements:
                        containers.extend(elements)
                        logger.info(f"Found {len(elements)} containers with selector: {selector}")
                        break  # Use first successful selector
                except Exception as e:
                    logger.debug(f"Selector failed: {selector} - {e}")
                    continue
            
            return containers[:100]  # Limit to 100 containers
            
        except Exception as e:
            logger.warning(f"AI container finding failed: {e}")
            # Fallback to simple heuristics
            return self._fallback_find_containers(soup)
    
    def _extract_job_from_container(self, container, base_url: str) -> Optional[Dict]:
        """
        Extract structured job data from a single container using AI.
        """
        # Get container HTML and text
        container_html = str(container)[:5000]  # Limit size
        container_text = container.get_text()[:2000]  # Limit text
        
        prompt = f"""Extract job information from this HTML container.

Container HTML:
{container_html[:5000]}

Container Text:
{container_text[:2000]}

Extract the following fields and return as JSON:
{{
  "title": "Job title (MUST be clean - remove ALL metadata)",
  "apply_url": "Full URL to apply/view job details",
  "location_raw": "Job location (city, country, or duty station)",
  "deadline": "Application deadline in YYYY-MM-DD format (or null if not found)",
  "organization": "Organization name (if visible)",
  "description_snippet": "Brief description (first 200 chars, optional)"
}}

CRITICAL RULES:
1. **Title MUST be clean**: Remove ALL of these from title:
   - "Apply by Dec-11-25" or any deadline text
   - "Location SRI LANKA" or any location text
   - "Job Title" prefix
   - Any metadata that's not part of the actual job title
   
   Example: If you see "IC/PPC/2511/105 - IC- Support to develop SoR & HR Rules for CIABOC staff Apply by Dec-11-25 Location SRI LANKA"
   Extract title as: "IC/PPC/2511/105 - IC- Support to develop SoR & HR Rules for CIABOC staff"
   
2. apply_url must be a full URL (use base_url: {base_url} if relative)
3. deadline should be in YYYY-MM-DD format (extract from "Dec-11-25" -> "2025-12-11") or null
4. location_raw should be just the location name (e.g., "SRI LANKA", not "Location: SRI LANKA")
5. If a field is not found, use null

Return ONLY valid JSON, no other text, no markdown, no code blocks."""

        try:
            response = self._call_llm(prompt)
            job = json.loads(response)
            
            # Clean and validate
            if job.get('apply_url') and not job['apply_url'].startswith('http'):
                from urllib.parse import urljoin
                job['apply_url'] = urljoin(base_url, job['apply_url'])
            
            # Clean title - remove common contamination (double-check AI output)
            if job.get('title'):
                title = job['title']
                # Remove metadata that AI might have missed
                title = re.sub(r'\s*Apply by.*$', '', title, flags=re.IGNORECASE)
                title = re.sub(r'\s*Location.*$', '', title, flags=re.IGNORECASE)
                title = re.sub(r'\s*Deadline.*$', '', title, flags=re.IGNORECASE)
                title = re.sub(r'^Job Title\s*', '', title, flags=re.IGNORECASE)
                # Remove any trailing metadata patterns
                title = re.sub(r'\s+(Apply by|Location|Deadline):.*$', '', title, flags=re.IGNORECASE)
                job['title'] = title.strip()
            
            # Parse deadline if it's in a format like "Dec-11-25"
            if job.get('deadline') and not re.match(r'^\d{4}-\d{2}-\d{2}$', str(job['deadline'])):
                # Try to parse common formats
                from datetime import datetime
                deadline_str = str(job['deadline'])
                # Format: "Dec-11-25" -> "2025-12-11"
                match = re.search(r'(\w{3})-(\d{1,2})-(\d{2,4})', deadline_str, re.IGNORECASE)
                if match:
                    month_str, day, year = match.groups()
                    month_map = {
                        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
                        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
                    }
                    month = month_map.get(month_str.lower()[:3])
                    if month:
                        year_int = int(year)
                        if year_int < 100:
                            year_int += 2000 if year_int < 50 else 1900
                        try:
                            job['deadline'] = datetime(year_int, month, int(day)).strftime('%Y-%m-%d')
                        except:
                            job['deadline'] = None
                else:
                    job['deadline'] = None
            
            return job
            
        except Exception as e:
            logger.warning(f"AI extraction failed for container: {e}")
            return None
    
    def _call_llm(self, prompt: str) -> str:
        """Call LLM API via OpenRouter."""
        if not self.api_key:
            raise ValueError("API key not set")
        
        try:
            response = httpx.post(
                self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://aidjobs.app",
                    "X-Title": "AidJobs Crawler"
                },
                json={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a helpful assistant that extracts structured data from HTML. Always return valid JSON only, no markdown, no explanations."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "temperature": 0,
                    "max_tokens": 2000
                },
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            return data['choices'][0]['message']['content'].strip()
            
        except Exception as e:
            logger.error(f"LLM API call failed: {e}")
            raise
    
    def _fallback_find_containers(self, soup: BeautifulSoup) -> List:
        """Fallback: simple heuristics if AI fails."""
        containers = []
        
        # Try common patterns
        for selector in [
            'table tbody tr',
            'div[class*="job"]',
            'li[class*="job"]',
            'article[class*="job"]',
            'div[class*="position"]',
            'div[class*="vacancy"]'
        ]:
            try:
                elements = soup.select(selector)
                if elements and len(elements) >= 3:  # At least 3 potential jobs
                    containers.extend(elements)
                    break
            except Exception:
                continue
        
        return containers[:50]


class HybridExtractor:
    """
    Hybrid approach: Try AI first, fallback to rule-based if AI fails or is unavailable.
    """
    
    def __init__(self, db_url: str, use_ai: bool = True):
        self.db_url = db_url
        self.use_ai = use_ai
        self.ai_extractor = None
        
        if use_ai:
            try:
                self.ai_extractor = AIJobExtractor()
            except Exception as e:
                logger.warning(f"AI extractor initialization failed: {e}")
                self.use_ai = False
    
    def extract_jobs(self, html: str, base_url: str) -> List[Dict]:
        """
        Extract jobs using hybrid approach.
        
        1. Try AI extraction first (if available)
        2. Fallback to rule-based extraction if AI fails
        """
        jobs = []
        
        # Try AI first
        if self.use_ai and self.ai_extractor:
            try:
                logger.info("Attempting AI extraction...")
                jobs = self.ai_extractor.extract_jobs_from_html(html, base_url)
                if jobs:
                    logger.info(f"AI extraction successful: {len(jobs)} jobs")
                    return jobs
                else:
                    logger.info("AI extraction returned no jobs, falling back to rule-based")
            except Exception as e:
                logger.warning(f"AI extraction failed: {e}, falling back to rule-based")
        
        # Fallback to rule-based
        logger.info("Using rule-based extraction fallback...")
        from .simple_crawler import SimpleCrawler
        crawler = SimpleCrawler(self.db_url)
        jobs = crawler.extract_jobs_from_html(html, base_url)
        
        return jobs

