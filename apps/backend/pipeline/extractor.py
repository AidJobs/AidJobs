"""
Main extraction orchestrator.

Implements a multi-stage extraction pipeline with deterministic fallbacks:
1. Job page classifier
2. JSON-LD extraction
3. Meta/OpenGraph parsing
4. DOM selectors (site plugins)
5. Label heuristics
6. Regex fallback
7. AI fallback (last resort)
"""

import logging
import hashlib
import json
from typing import Dict, List, Optional, Any
from datetime import datetime
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from .classifier import JobPageClassifier
from .jsonld import JSONLDExtractor
from .heuristics import HeuristicExtractor
from .ai_fallback import AIFallbackExtractor
from .snapshot import SnapshotManager

logger = logging.getLogger(__name__)

# Confidence scores by extraction method
CONFIDENCE_SCORES = {
    'jsonld': 0.90,
    'api': 0.90,
    'meta': 0.80,
    'dom': 0.70,
    'heuristic': 0.60,
    'regex': 0.50,
    'ai': 0.40,
}


class FieldResult:
    """Result for a single extracted field."""
    
    def __init__(self, value: Any = None, source: Optional[str] = None, 
                 confidence: float = 0.0, raw_snippet: Optional[str] = None):
        self.value = value
        self.source = source
        self.confidence = confidence
        self.raw_snippet = raw_snippet
    
    def to_dict(self) -> Dict:
        """Convert to dictionary matching strict schema."""
        return {
            "value": self.value,
            "source": self.source,
            "confidence": round(self.confidence, 2),
            "raw_snippet": self.raw_snippet
        }
    
    def is_valid(self) -> bool:
        """Check if field has a valid value."""
        if self.value is None:
            return False
        if isinstance(self.value, str) and not self.value.strip():
            return False
        if isinstance(self.value, list) and len(self.value) == 0:
            return False
        return True


class ExtractionResult:
    """Complete extraction result matching strict schema."""
    
    def __init__(self, url: str, pipeline_version: str = "1.0.0"):
        self.url = url
        self.canonical_id = self._generate_canonical_id(url)
        self.extracted_at = datetime.utcnow().isoformat() + "Z"
        self.pipeline_version = pipeline_version
        self.fields: Dict[str, FieldResult] = {}
        self.is_job = False
        self.classifier_score = 0.0
        self.dedupe_hash = ""
    
    def _generate_canonical_id(self, url: str) -> str:
        """Generate canonical ID from URL."""
        parsed = urlparse(url)
        # Use domain + path as base
        base = f"{parsed.netloc}{parsed.path}"
        if parsed.query:
            # Include query params that look like job IDs
            query_parts = parsed.query.split('&')
            id_params = [p for p in query_parts if any(k in p.lower() for k in ['id', 'job', 'position', 'vacancy'])]
            if id_params:
                base += "?" + "&".join(id_params)
        return hashlib.sha256(base.encode()).hexdigest()[:16]
    
    def set_field(self, field_name: str, result: FieldResult):
        """Set a field result, keeping the highest confidence value."""
        if field_name not in self.fields:
            self.fields[field_name] = result
        elif result.confidence > self.fields[field_name].confidence:
            self.fields[field_name] = result
    
    def get_field(self, field_name: str) -> Optional[FieldResult]:
        """Get field result."""
        return self.fields.get(field_name)
    
    def compute_dedupe_hash(self) -> str:
        """Compute deduplication hash from normalized fields."""
        parts = []
        
        # Normalize employer
        employer = self.get_field('employer')
        if employer and employer.value:
            parts.append(str(employer.value).lower().strip())
        
        # Normalize title
        title = self.get_field('title')
        if title and title.value:
            parts.append(str(title.value).lower().strip())
        
        # Normalize location
        location = self.get_field('location')
        if location and location.value:
            parts.append(str(location.value).lower().strip())
        
        # Use application URL if available
        application_url = self.get_field('application_url')
        if application_url and application_url.value:
            parts.append(str(application_url.value))
        
        if not parts:
            return ""
        
        combined = "|".join(parts)
        return hashlib.sha256(combined.encode()).hexdigest()
    
    def to_dict(self) -> Dict:
        """Convert to dictionary matching strict schema."""
        # Compute dedupe hash
        self.dedupe_hash = self.compute_dedupe_hash()
        
        # Build fields dict
        fields_dict = {}
        for field_name in ['title', 'employer', 'location', 'posted_on', 'deadline', 
                          'description', 'requirements', 'application_url']:
            field_result = self.get_field(field_name)
            if field_result:
                fields_dict[field_name] = field_result.to_dict()
            else:
                fields_dict[field_name] = {
                    "value": None,
                    "source": None,
                    "confidence": 0.0,
                    "raw_snippet": None
                }
        
        return {
            "url": self.url,
            "canonical_id": self.canonical_id,
            "extracted_at": self.extracted_at,
            "pipeline_version": self.pipeline_version,
            "fields": fields_dict,
            "is_job": self.is_job,
            "classifier_score": round(self.classifier_score, 2),
            "dedupe_hash": self.dedupe_hash
        }


class Extractor:
    """Main extraction orchestrator."""
    
    def __init__(self, db_url: Optional[str] = None, enable_ai: bool = True, 
                 enable_snapshots: bool = True, shadow_mode: bool = False,
                 enable_storage: Optional[bool] = None):
        self.db_url = db_url
        self.enable_ai = enable_ai
        self.enable_snapshots = enable_snapshots
        self.shadow_mode = shadow_mode
        
        # Initialize components
        self.classifier = JobPageClassifier()
        self.jsonld_extractor = JSONLDExtractor()
        self.heuristic_extractor = HeuristicExtractor()
        self.ai_extractor = AIFallbackExtractor() if enable_ai else None
        self.snapshot_manager = SnapshotManager() if enable_snapshots else None
        
        # Initialize DB insertion (optional)
        self.db_insert = None
        if db_url and (enable_storage is None or enable_storage):
            try:
                from .db_insert import DBInsert
                self.db_insert = DBInsert(
                    db_url=db_url,
                    use_storage=enable_storage,
                    shadow_mode=shadow_mode
                )
                logger.info("DB insertion enabled for extractor")
            except Exception as e:
                logger.warning(f"Could not initialize DB insertion: {e}")
        
        logger.info(f"Extractor initialized (AI: {enable_ai}, Snapshots: {enable_snapshots}, Shadow: {shadow_mode}, Storage: {self.db_insert is not None})")
    
    async def extract_from_html(self, html: str, url: str, 
                               soup: Optional[BeautifulSoup] = None) -> ExtractionResult:
        """
        Extract job information from HTML.
        
        Args:
            html: Raw HTML content
            url: Source URL
            soup: Pre-parsed BeautifulSoup object (optional)
        
        Returns:
            ExtractionResult matching strict schema
        """
        result = ExtractionResult(url, pipeline_version=__version__)
        
        # Parse HTML if not provided
        if soup is None:
            soup = BeautifulSoup(html, 'html.parser')
        
        # Stage 1: Job page classifier
        is_job, classifier_score = self.classifier.classify(html, soup, url)
        result.is_job = is_job
        result.classifier_score = classifier_score
        
        if not is_job:
            logger.debug(f"Page classified as non-job (score: {classifier_score:.2f}): {url}")
            # Still try to extract, but mark as non-job
        
        # Stage 2: JSON-LD extraction
        jsonld_fields = self.jsonld_extractor.extract(soup, url)
        for field_name, field_result in jsonld_fields.items():
            result.set_field(field_name, field_result)
        
        # Stage 3: Meta/OpenGraph tags
        meta_fields = self._extract_meta_tags(soup, url)
        for field_name, field_result in meta_fields.items():
            result.set_field(field_name, field_result)
        
        # Stage 4: DOM selectors (site plugins)
        # TODO: Integrate with existing plugin system
        dom_fields = self._extract_dom_selectors(soup, url)
        for field_name, field_result in dom_fields.items():
            result.set_field(field_name, field_result)
        
        # Stage 5: Label heuristics
        heuristic_fields = self.heuristic_extractor.extract(soup, url)
        for field_name, field_result in heuristic_fields.items():
            result.set_field(field_name, field_result)
        
        # Stage 6: Regex fallback
        regex_fields = self._extract_regex_fallback(html, soup, url)
        for field_name, field_result in regex_fields.items():
            result.set_field(field_name, field_result)
        
        # Stage 7: AI fallback (only if needed and enabled)
        if self.ai_extractor and self._needs_ai_fallback(result):
            ai_fields = await self.ai_extractor.extract(html, soup, url, result)
            for field_name, field_result in ai_fields.items():
                result.set_field(field_name, field_result)
        
        # Validation: Check for manual review flags
        manual_review = False
        validation_issues = []
        
        # Validate title (required)
        title_field = result.get_field('title')
        if not title_field or not title_field.is_valid():
            manual_review = True
            validation_issues.append('missing_title')
        
        # Validate deadline (if present, must be parseable and after posted_on)
        deadline_field = result.get_field('deadline')
        posted_on_field = result.get_field('posted_on')
        if deadline_field and deadline_field.value:
            try:
                from datetime import datetime
                deadline_date = datetime.strptime(deadline_field.value, '%Y-%m-%d')
                if posted_on_field and posted_on_field.value:
                    posted_date = datetime.strptime(posted_on_field.value, '%Y-%m-%d')
                    if deadline_date < posted_date:
                        manual_review = True
                        validation_issues.append('deadline_before_posted')
            except (ValueError, TypeError):
                manual_review = True
                validation_issues.append('invalid_deadline_format')
        
        # Validate location (not generic)
        location_field = result.get_field('location')
        if location_field and location_field.value:
            generic_locations = ['n/a', 'tbd', 'to be determined', 'multiple', 'various']
            if str(location_field.value).lower().strip() in generic_locations:
                manual_review = True
                validation_issues.append('generic_location')
        
        # Save snapshot with validation metadata
        if self.snapshot_manager:
            snapshot_data = result.to_dict()
            snapshot_data['manual_review'] = manual_review
            snapshot_data['validation_issues'] = validation_issues
            await self.snapshot_manager.save_snapshot(url, html, snapshot_data)
        
        # Optional: Insert into database (if enabled and is_job)
        if self.db_insert and result.is_job:
            try:
                insert_status = self.db_insert.insert_job(result, shadow=self.shadow_mode)
                if insert_status['success']:
                    logger.debug(f"Inserted job into database: {insert_status.get('job_id')}")
                else:
                    logger.warning(f"Failed to insert job: {insert_status.get('error')}")
            except Exception as e:
                logger.error(f"Error inserting job into database: {e}", exc_info=True)
        
        return result
    
    def _extract_meta_tags(self, soup: BeautifulSoup, url: str) -> Dict[str, FieldResult]:
        """Extract from meta tags and OpenGraph."""
        fields = {}
        
        # Title
        title = None
        for selector in ['meta[property="og:title"]', 'meta[name="title"]', 'title']:
            tag = soup.select_one(selector)
            if tag:
                title = tag.get('content') or tag.get_text()
                if title:
                    fields['title'] = FieldResult(
                        value=title.strip(),
                        source='meta',
                        confidence=CONFIDENCE_SCORES['meta'],
                        raw_snippet=title[:200]
                    )
                    break
        
        # Description
        desc = None
        for selector in ['meta[property="og:description"]', 'meta[name="description"]']:
            tag = soup.select_one(selector)
            if tag:
                desc = tag.get('content')
                if desc:
                    fields['description'] = FieldResult(
                        value=desc.strip(),
                        source='meta',
                        confidence=CONFIDENCE_SCORES['meta'],
                        raw_snippet=desc[:500]
                    )
                    break
        
        return fields
    
    def _extract_dom_selectors(self, soup: BeautifulSoup, url: str) -> Dict[str, FieldResult]:
        """Extract using DOM selectors (site-specific plugins)."""
        fields = {}
        
        # Common job title selectors
        title_selectors = [
            'h1.job-title', '.job-title', '.position-title',
            'h1', 'h2.job-title', '[class*="job-title"]'
        ]
        for selector in title_selectors:
            tag = soup.select_one(selector)
            if tag:
                title = tag.get_text().strip()
                if title and len(title) > 5:
                    fields['title'] = FieldResult(
                        value=title,
                        source='dom',
                        confidence=CONFIDENCE_SCORES['dom'],
                        raw_snippet=title[:200]
                    )
                    break
        
        return fields
    
    def _extract_regex_fallback(self, html: str, soup: BeautifulSoup, url: str) -> Dict[str, FieldResult]:
        """Extract using regex patterns as last resort."""
        import re
        fields = {}
        text = soup.get_text() if soup else html
        
        # Date patterns
        date_patterns = [
            r'(?:deadline|closing|apply by|due date)[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
            r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})',
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                date_str = match.group(1)
                fields['deadline'] = FieldResult(
                    value=date_str,
                    source='regex',
                    confidence=CONFIDENCE_SCORES['regex'],
                    raw_snippet=match.group(0)[:100]
                )
                break
        
        return fields
    
    def _needs_ai_fallback(self, result: ExtractionResult) -> bool:
        """Determine if AI fallback is needed."""
        # Use AI if critical fields are missing or low confidence
        critical_fields = ['title', 'employer', 'location']
        missing_critical = sum(1 for f in critical_fields 
                             if not result.get_field(f) or not result.get_field(f).is_valid())
        
        # Use AI if more than 1 critical field is missing
        return missing_critical > 1
    
    async def extract_from_rss(self, feed_data: Dict, url: str) -> ExtractionResult:
        """Extract from RSS feed entry."""
        result = ExtractionResult(url, pipeline_version=__version__)
        
        # RSS entries are typically already structured
        if 'title' in feed_data:
            result.set_field('title', FieldResult(
                value=feed_data['title'],
                source='api',  # RSS is treated as structured API
                confidence=CONFIDENCE_SCORES['api'],
                raw_snippet=feed_data['title']
            ))
        
        if 'link' in feed_data:
            result.set_field('application_url', FieldResult(
                value=feed_data['link'],
                source='api',
                confidence=CONFIDENCE_SCORES['api'],
                raw_snippet=feed_data['link']
            ))
        
        if 'description' in feed_data or 'summary' in feed_data:
            desc = feed_data.get('description') or feed_data.get('summary', '')
            result.set_field('description', FieldResult(
                value=desc,
                source='api',
                confidence=CONFIDENCE_SCORES['api'],
                raw_snippet=desc[:500]
            ))
        
        # Classify as job (RSS feeds are typically job listings)
        result.is_job = True
        result.classifier_score = 0.85
        
        return result
    
    async def extract_from_json(self, json_data: Dict, url: str) -> ExtractionResult:
        """Extract from JSON API response."""
        result = ExtractionResult(url, pipeline_version=__version__)
        
        # JSON APIs are structured, high confidence
        field_mapping = {
            'title': ['title', 'name', 'position', 'job_title'],
            'employer': ['employer', 'organization', 'company', 'org_name'],
            'location': ['location', 'duty_station', 'city', 'country'],
            'deadline': ['deadline', 'closing_date', 'application_deadline'],
            'description': ['description', 'summary', 'details'],
            'application_url': ['url', 'link', 'apply_url', 'application_url']
        }
        
        for field_name, possible_keys in field_mapping.items():
            for key in possible_keys:
                if key in json_data and json_data[key]:
                    result.set_field(field_name, FieldResult(
                        value=json_data[key],
                        source='api',
                        confidence=CONFIDENCE_SCORES['api'],
                        raw_snippet=str(json_data[key])[:200]
                    ))
                    break
        
        result.is_job = True
        result.classifier_score = 0.90
        
        return result


# Pipeline version
__version__ = "1.0.0"

