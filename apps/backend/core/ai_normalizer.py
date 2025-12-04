"""
AI-Assisted Normalization Module
Normalizes ambiguous fields (dates, locations, salary) using AI when heuristics fail.

Cost-optimized: Only uses AI when necessary, with caching to avoid redundant calls.
"""

import logging
import json
import os
import hashlib
from typing import Dict, Optional, Any
from datetime import datetime
import httpx
import asyncio

logger = logging.getLogger(__name__)


class AINormalizer:
    """
    Normalize ambiguous job fields using AI.
    
    Only uses AI when heuristics fail, with caching to minimize API calls.
    """
    
    def __init__(self, api_key: Optional[str] = None, model: str = "openai/gpt-4o-mini"):
        """
        Initialize AI normalizer.
        
        Args:
            api_key: OpenRouter API key (or set OPENROUTER_API_KEY env var)
            model: Model to use (default: gpt-4o-mini for cost-effectiveness)
        """
        self.api_key = api_key or os.getenv('OPENROUTER_API_KEY')
        self.model = model or os.getenv('OPENROUTER_MODEL', 'openai/gpt-4o-mini')
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"
        
        # In-memory cache for normalized values (key: hash of input, value: normalized result)
        self._cache: Dict[str, Dict] = {}
        self._cache_max_size = 1000  # Limit cache size
        
        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not set - AI normalization will be disabled")
    
    def _cache_key(self, field_type: str, raw_value: str) -> str:
        """Generate cache key for a field"""
        key_str = f"{field_type}:{raw_value.lower().strip()}"
        return hashlib.md5(key_str.encode()).hexdigest()
    
    def _get_cached(self, cache_key: str) -> Optional[Dict]:
        """Get cached normalized value"""
        return self._cache.get(cache_key)
    
    def _set_cached(self, cache_key: str, value: Dict):
        """Cache normalized value"""
        if len(self._cache) >= self._cache_max_size:
            # Remove oldest entry (simple FIFO)
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]
        self._cache[cache_key] = value
    
    async def _call_ai(self, prompt: str, timeout: float = 10.0) -> Optional[Dict]:
        """
        Call OpenRouter API for normalization.
        
        Args:
            prompt: The prompt to send
            timeout: Request timeout in seconds
            
        Returns:
            Parsed JSON response or None on error
        """
        if not self.api_key:
            return None
        
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    self.base_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://aidjobs.app",
                        "X-Title": "AidJobs Normalizer"
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are a data normalizer. Return ONLY valid JSON, no other text."
                            },
                            {
                                "role": "user",
                                "content": prompt
                            }
                        ],
                        "temperature": 0.1,  # Low temperature for consistent results
                        "max_tokens": 200
                    }
                )
                
                if response.status_code != 200:
                    logger.warning(f"AI normalization API error: {response.status_code}")
                    return None
                
                data = response.json()
                content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
                
                if not content:
                    return None
                
                # Parse JSON response
                try:
                    return json.loads(content)
                except json.JSONDecodeError:
                    # Try to extract JSON from markdown code blocks
                    import re
                    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', content, re.DOTALL)
                    if json_match:
                        return json.loads(json_match.group(1))
                    return None
        
        except asyncio.TimeoutError:
            logger.warning("AI normalization request timed out")
            return None
        except Exception as e:
            logger.warning(f"AI normalization error: {e}")
            return None
    
    async def normalize_deadline(
        self,
        deadline_raw: str,
        base_date: Optional[datetime] = None
    ) -> Optional[str]:
        """
        Normalize deadline to YYYY-MM-DD format.
        
        Only uses AI if:
        - Date is ambiguous (e.g., "31 Dec" without year)
        - Date format is unclear
        - Heuristic parsing failed
        
        Args:
            deadline_raw: Raw deadline string
            base_date: Base date for relative dates (default: now)
            
        Returns:
            Normalized date in YYYY-MM-DD format or None
        """
        if not deadline_raw or not deadline_raw.strip():
            return None
        
        deadline_raw = deadline_raw.strip()
        
        # Check cache first
        cache_key = self._cache_key("deadline", deadline_raw)
        cached = self._get_cached(cache_key)
        if cached:
            return cached.get('normalized')
        
        # Try heuristic parsing first (using dateparser from Phase 1)
        try:
            import dateparser
            base = base_date or datetime.now()
            parsed = dateparser.parse(
                deadline_raw,
                settings={
                    'PREFER_DAY_OF_MONTH': 'first',
                    'RELATIVE_BASE': base,
                    'PREFER_DATES_FROM': 'future'
                }
            )
            
            if parsed:
                normalized = parsed.strftime('%Y-%m-%d')
                # Cache the result
                self._set_cached(cache_key, {'normalized': normalized, 'method': 'heuristic'})
                return normalized
        except Exception:
            pass
        
        # Heuristic failed, try AI
        if not self.api_key:
            return None
        
        prompt = f"""Normalize this deadline to YYYY-MM-DD format. Today is {datetime.now().strftime('%Y-%m-%d')}.

Input: "{deadline_raw}"

Return JSON with:
{{
  "normalized": "YYYY-MM-DD or null",
  "confidence": "high|medium|low"
}}

If the date is ambiguous or unclear, return null. Only return a date if you're confident."""
        
        result = await self._call_ai(prompt)
        
        if result and result.get('normalized'):
            normalized = result['normalized']
            # Validate format
            if isinstance(normalized, str) and len(normalized) == 10 and normalized.count('-') == 2:
                self._set_cached(cache_key, {'normalized': normalized, 'method': 'ai'})
                return normalized
        
        # Cache failure
        self._set_cached(cache_key, {'normalized': None, 'method': 'failed'})
        return None
    
    async def normalize_location(
        self,
        location_raw: str
    ) -> Optional[Dict[str, Any]]:
        """
        Normalize location to structured format.
        
        Only uses AI if:
        - Location is ambiguous (e.g., "Lagos / Remote")
        - Multiple locations mentioned
        - Format is unclear
        
        Args:
            location_raw: Raw location string
            
        Returns:
            Dict with normalized location fields or None
        """
        if not location_raw or not location_raw.strip():
            return None
        
        location_raw = location_raw.strip()
        
        # Check cache first
        cache_key = self._cache_key("location", location_raw)
        cached = self._get_cached(cache_key)
        if cached:
            return cached.get('normalized')
        
        # Try heuristic parsing first
        location_lower = location_raw.lower()
        
        # Check for remote/work from home
        if any(term in location_lower for term in ['remote', 'work from home', 'wfh', 'virtual', 'online']):
            normalized = {
                'type': 'remote',
                'label': 'Remote',
                'country': None,
                'city': None
            }
            self._set_cached(cache_key, {'normalized': normalized, 'method': 'heuristic'})
            return normalized
        
        # Check for multiple locations
        if '/' in location_raw or ';' in location_raw or ',' in location_raw:
            # Multiple locations - use AI
            pass
        else:
            # Single location - might be parseable with heuristics
            # For now, return simple structure
            normalized = {
                'type': 'onsite',
                'label': location_raw,
                'country': None,
                'city': None
            }
            self._set_cached(cache_key, {'normalized': normalized, 'method': 'heuristic'})
            return normalized
        
        # Heuristic unclear, try AI
        if not self.api_key:
            return None
        
        prompt = f"""Normalize this job location. Return structured JSON.

Input: "{location_raw}"

Return JSON with:
{{
  "type": "remote|onsite|multiple",
  "label": "Human-readable label",
  "country": "Country name or null",
  "city": "City name or null"
}}

If location is unclear or invalid, return null."""
        
        result = await self._call_ai(prompt)
        
        if result and result.get('type'):
            normalized = {
                'type': result.get('type', 'onsite'),
                'label': result.get('label', location_raw),
                'country': result.get('country'),
                'city': result.get('city')
            }
            self._set_cached(cache_key, {'normalized': normalized, 'method': 'ai'})
            return normalized
        
        # Cache failure
        self._set_cached(cache_key, {'normalized': None, 'method': 'failed'})
        return None
    
    async def normalize_salary(
        self,
        salary_raw: str
    ) -> Optional[Dict[str, Any]]:
        """
        Normalize salary to structured format.
        
        Only uses AI if:
        - Salary format is unclear
        - Multiple currencies or ranges
        - Heuristic parsing failed
        
        Args:
            salary_raw: Raw salary string
            
        Returns:
            Dict with normalized salary fields or None
        """
        if not salary_raw or not salary_raw.strip():
            return None
        
        salary_raw = salary_raw.strip()
        
        # Check cache first
        cache_key = self._cache_key("salary", salary_raw)
        cached = self._get_cached(cache_key)
        if cached:
            return cached.get('normalized')
        
        # Try heuristic parsing first
        import re
        
        # Pattern: $50,000 - $70,000 or 50000-70000 USD
        range_match = re.search(r'[\$]?([\d,]+)\s*[-–—]\s*[\$]?([\d,]+)', salary_raw)
        if range_match:
            min_val = int(range_match.group(1).replace(',', ''))
            max_val = int(range_match.group(2).replace(',', ''))
            
            # Extract currency
            currency_match = re.search(r'([A-Z]{3})|([\$€£¥])', salary_raw.upper())
            currency = None
            if currency_match:
                if currency_match.group(1):
                    currency = currency_match.group(1)
                else:
                    symbol_map = {'$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY'}
                    currency = symbol_map.get(currency_match.group(2), 'USD')
            
            normalized = {
                'min': min_val,
                'max': max_val,
                'currency': currency or 'USD',
                'label': salary_raw
            }
            self._set_cached(cache_key, {'normalized': normalized, 'method': 'heuristic'})
            return normalized
        
        # Heuristic failed, try AI
        if not self.api_key:
            return None
        
        prompt = f"""Normalize this salary to structured JSON.

Input: "{salary_raw}"

Return JSON with:
{{
  "min": number or null,
  "max": number or null,
  "currency": "USD|EUR|GBP|etc or null",
  "label": "Human-readable label"
}}

If salary is unclear or invalid, return null."""
        
        result = await self._call_ai(prompt)
        
        if result:
            normalized = {
                'min': result.get('min'),
                'max': result.get('max'),
                'currency': result.get('currency'),
                'label': result.get('label', salary_raw)
            }
            self._set_cached(cache_key, {'normalized': normalized, 'method': 'ai'})
            return normalized
        
        # Cache failure
        self._set_cached(cache_key, {'normalized': None, 'method': 'failed'})
        return None
    
    async def normalize_job_fields(
        self,
        job: Dict[str, Any],
        use_ai_for_deadline: bool = True,
        use_ai_for_location: bool = True,
        use_ai_for_salary: bool = True
    ) -> Dict[str, Any]:
        """
        Normalize all ambiguous fields in a job dict.
        
        Args:
            job: Job dictionary with raw fields
            use_ai_for_deadline: Whether to use AI for deadline normalization
            use_ai_for_location: Whether to use AI for location normalization
            use_ai_for_salary: Whether to use AI for salary normalization
            
        Returns:
            Job dict with normalized fields added
        """
        normalized_job = job.copy()
        
        # Normalize deadline
        if use_ai_for_deadline and job.get('deadline'):
            deadline_raw = str(job['deadline'])
            # Only normalize if it's not already in YYYY-MM-DD format
            if not (isinstance(deadline_raw, str) and len(deadline_raw) == 10 and deadline_raw.count('-') == 2):
                normalized_deadline = await self.normalize_deadline(deadline_raw)
                if normalized_deadline:
                    normalized_job['deadline'] = normalized_deadline
                    normalized_job['deadline_normalized'] = True
        
        # Normalize location
        if use_ai_for_location and job.get('location_raw'):
            normalized_location = await self.normalize_location(job['location_raw'])
            if normalized_location:
                normalized_job['location_normalized'] = normalized_location
        
        # Normalize salary
        if use_ai_for_salary and job.get('salary_raw'):
            normalized_salary = await self.normalize_salary(job['salary_raw'])
            if normalized_salary:
                normalized_job['salary_normalized'] = normalized_salary
        
        return normalized_job


# Global instance (lazy initialization)
_ai_normalizer: Optional[AINormalizer] = None


def get_ai_normalizer() -> Optional[AINormalizer]:
    """Get or create the global AI normalizer instance"""
    global _ai_normalizer
    
    if _ai_normalizer is None:
        api_key = os.getenv('OPENROUTER_API_KEY')
        if api_key:
            model = os.getenv('OPENROUTER_MODEL', 'openai/gpt-4o-mini')
            _ai_normalizer = AINormalizer(api_key=api_key, model=model)
        else:
            logger.debug("AI normalizer not initialized - OPENROUTER_API_KEY not set")
    
    return _ai_normalizer

