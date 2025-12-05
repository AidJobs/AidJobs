"""
AI fallback extractor.

Uses LLM (OpenRouter) as last resort for extraction with deterministic prompts.
"""

import os
import json
import logging
import hashlib
from typing import Dict, Optional
from bs4 import BeautifulSoup

from .extractor import FieldResult, ExtractionResult, CONFIDENCE_SCORES

logger = logging.getLogger(__name__)


class AIFallbackExtractor:
    """AI-powered extraction as last resort."""
    
    def __init__(self, api_key: Optional[str] = None, model: str = "anthropic/claude-3-haiku"):
        self.api_key = api_key or os.getenv('OPENROUTER_API_KEY')
        self.model = model
        self.cache = {}  # Simple in-memory cache (should use Redis in production)
        self.max_calls = int(os.getenv('AI_EXTRACTION_MAX_CALLS', '2000'))
        self.call_count = 0
    
    async def extract(self, html: str, soup: BeautifulSoup, url: str, 
                     existing_result: ExtractionResult) -> Dict[str, FieldResult]:
        """
        Extract using AI fallback.
        
        Args:
            html: Raw HTML
            soup: Parsed BeautifulSoup
            url: Source URL
            existing_result: Existing extraction result (to avoid re-extracting)
        
        Returns:
            Dictionary of field results
        """
        if not self.api_key:
            logger.warning("AI extraction disabled: no API key")
            return {}
        
        if self.call_count >= self.max_calls:
            logger.warning(f"AI extraction limit reached ({self.max_calls} calls)")
            return {}
        
        # Check cache
        cache_key = self._get_cache_key(html, url)
        if cache_key in self.cache:
            logger.debug("Using cached AI extraction result")
            return self.cache[cache_key]
        
        # Build prompt
        prompt = self._build_prompt(html, soup, url, existing_result)
        
        # Call AI
        try:
            response = await self._call_ai(prompt)
            fields = self._parse_ai_response(response)
            self.call_count += 1
            
            # Cache result
            self.cache[cache_key] = fields
            
            return fields
        except Exception as e:
            logger.error(f"AI extraction failed: {e}")
            return {}
    
    def _get_cache_key(self, html: str, url: str) -> str:
        """Generate cache key."""
        content = f"{url}:{html[:1000]}"  # Use first 1000 chars for cache key
        return hashlib.sha256(content.encode()).hexdigest()
    
    def _build_prompt(self, html: str, soup: BeautifulSoup, url: str, 
                     existing_result: ExtractionResult) -> str:
        """Build deterministic prompt with few-shot examples."""
        # Get text content (limit size)
        text = soup.get_text()[:5000] if soup else html[:5000]
        
        # Build prompt
        prompt = f"""Extract job information from the following HTML page.

URL: {url}

HTML Content (first 5000 chars):
{text}

Extract the following fields:
- title: Job title
- employer: Organization/company name
- location: Duty station or work location
- posted_on: Date posted (YYYY-MM-DD format)
- deadline: Application deadline (YYYY-MM-DD format)
- description: Job description
- requirements: List of requirements/qualifications
- application_url: URL to apply

Return ONLY valid JSON in this exact format:
{{
  "title": "string or null",
  "employer": "string or null",
  "location": "string or null",
  "posted_on": "YYYY-MM-DD or null",
  "deadline": "YYYY-MM-DD or null",
  "description": "string or null",
  "requirements": ["string"] or null,
  "application_url": "string or null",
  "confidence": 0.0-1.0
}}

Examples:
1. Job posting with all fields:
{{
  "title": "Program Officer - Climate",
  "employer": "UNDP",
  "location": "New York, USA",
  "posted_on": "2025-01-01",
  "deadline": "2025-02-15",
  "description": "Manage climate programs...",
  "requirements": ["Master's degree", "5 years experience"],
  "application_url": "https://jobs.undp.org/apply/123",
  "confidence": 0.9
}}

2. Partial information:
{{
  "title": "Finance Manager",
  "employer": null,
  "location": "Remote",
  "posted_on": null,
  "deadline": "2025-03-01",
  "description": "Manage finance operations...",
  "requirements": null,
  "application_url": "https://example.com/apply",
  "confidence": 0.7
}}

Now extract from the provided HTML:"""
        
        return prompt
    
    async def _call_ai(self, prompt: str) -> Dict:
        """Call OpenRouter API."""
        import httpx
        
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a job extraction assistant. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,  # Low temperature for deterministic output
            "max_tokens": 2000
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            # Extract content
            content = data['choices'][0]['message']['content']
            
            # Parse JSON (may be wrapped in code blocks)
            content = content.strip()
            if content.startswith('```'):
                # Remove code block markers
                lines = content.split('\n')
                content = '\n'.join(lines[1:-1]) if len(lines) > 2 else content
            
            return json.loads(content)
    
    def _parse_ai_response(self, response: Dict) -> Dict[str, FieldResult]:
        """Parse AI response to field results."""
        fields = {}
        confidence = response.get('confidence', 0.4)
        # Adjust confidence based on AI-reported confidence
        if confidence > 0.8:
            final_confidence = min(0.9, CONFIDENCE_SCORES['ai'] + 0.2)
        else:
            final_confidence = CONFIDENCE_SCORES['ai']
        
        field_mapping = {
            'title': 'title',
            'employer': 'employer',
            'location': 'location',
            'posted_on': 'posted_on',
            'deadline': 'deadline',
            'description': 'description',
            'requirements': 'requirements',
            'application_url': 'application_url'
        }
        
        for ai_key, field_name in field_mapping.items():
            value = response.get(ai_key)
            if value is not None:
                # Handle requirements as list
                if field_name == 'requirements' and isinstance(value, list):
                    fields[field_name] = FieldResult(
                        value=value,
                        source='ai',
                        confidence=final_confidence,
                        raw_snippet=json.dumps(value)[:500]
                    )
                elif field_name != 'requirements' and isinstance(value, str) and value.strip():
                    fields[field_name] = FieldResult(
                        value=value.strip(),
                        source='ai',
                        confidence=final_confidence,
                        raw_snippet=value[:200]
                    )
        
        return fields

