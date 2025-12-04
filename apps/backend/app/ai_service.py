"""
AI Service for OpenRouter integration.
Handles all LLM calls using gpt-4o-mini via OpenRouter.
Includes retry with exponential backoff and circuit breaker for resilience.
"""
import os
import json
import logging
import time
from typing import Any, Optional, Dict, List
from collections import deque
import httpx

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-3-haiku")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Circuit breaker configuration
CIRCUIT_BREAKER_ERROR_THRESHOLD = 0.10  # 10% error rate triggers circuit breaker
CIRCUIT_BREAKER_WINDOW_SECONDS = 300  # 5 minutes
CIRCUIT_BREAKER_RESET_SECONDS = 60  # 1 minute before retry
MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 1.0  # Start with 1 second
MAX_RETRY_DELAY = 10.0  # Max 10 seconds


class CircuitBreaker:
    """Simple circuit breaker pattern for API resilience."""
    
    def __init__(self, error_threshold: float = 0.10, window_seconds: int = 300, reset_seconds: int = 60):
        self.error_threshold = error_threshold
        self.window_seconds = window_seconds
        self.reset_seconds = reset_seconds
        self.error_history = deque()  # (timestamp, is_error)
        self.circuit_open = False
        self.circuit_open_since = None
        self._lock = False  # Simple lock flag
    
    def record_call(self, is_error: bool):
        """Record a call result."""
        now = time.time()
        self.error_history.append((now, is_error))
        
        # Remove old entries outside window
        cutoff = now - self.window_seconds
        while self.error_history and self.error_history[0][0] < cutoff:
            self.error_history.popleft()
        
        # Calculate error rate
        if len(self.error_history) >= 10:  # Need at least 10 calls to evaluate
            errors = sum(1 for _, is_err in self.error_history if is_err)
            error_rate = errors / len(self.error_history)
            
            if error_rate >= self.error_threshold and not self.circuit_open:
                self.circuit_open = True
                self.circuit_open_since = now
                logger.warning(f"[ai_service] Circuit breaker OPENED: error rate {error_rate:.1%} >= {self.error_threshold:.1%}")
    
    def can_make_call(self) -> bool:
        """Check if we can make a call (circuit is closed or reset period passed)."""
        if not self.circuit_open:
            return True
        
        # Check if reset period has passed
        if self.circuit_open_since:
            elapsed = time.time() - self.circuit_open_since
            if elapsed >= self.reset_seconds:
                # Try to close circuit (half-open state)
                self.circuit_open = False
                self.circuit_open_since = None
                logger.info("[ai_service] Circuit breaker CLOSED (half-open state)")
                return True
        
        return False
    
    def record_success(self):
        """Record a successful call (helps close circuit)."""
        if self.circuit_open:
            # If we get a success in half-open state, close the circuit
            self.circuit_open = False
            self.circuit_open_since = None
            logger.info("[ai_service] Circuit breaker CLOSED after successful call")


class AIService:
    """Service for making AI calls via OpenRouter."""
    
    def __init__(self):
        self.api_key = OPENROUTER_API_KEY
        self.model = OPENROUTER_MODEL
        self.base_url = OPENROUTER_BASE_URL
        self.enabled = bool(self.api_key)
        self.circuit_breaker = CircuitBreaker(
            error_threshold=CIRCUIT_BREAKER_ERROR_THRESHOLD,
            window_seconds=CIRCUIT_BREAKER_WINDOW_SECONDS,
            reset_seconds=CIRCUIT_BREAKER_RESET_SECONDS
        )
        
        if not self.enabled:
            logger.warning("[ai_service] OpenRouter API key not configured. AI features disabled.")
    
    def _call_openrouter(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.0,
        response_format: Optional[Dict[str, str]] = None,
        max_tokens: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Make a call to OpenRouter API with retry and circuit breaker.
        
        Implements:
        - Exponential backoff retry (up to 3 attempts)
        - Circuit breaker to stop calling if error rate > 10%
        - Graceful degradation on failures
        """
        if not self.enabled:
            logger.warning("[ai_service] OpenRouter not enabled, skipping call")
            return None
        
        # Check circuit breaker
        if not self.circuit_breaker.can_make_call():
            logger.warning("[ai_service] Circuit breaker is OPEN, skipping call")
            return None
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://aidjobs.app",
            "X-Title": "AidJobs Trinity Search",
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        
        if response_format:
            payload["response_format"] = response_format
        
        if max_tokens:
            payload["max_tokens"] = max_tokens
        
        # Retry with exponential backoff
        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                # Calculate delay for this attempt (exponential backoff)
                if attempt > 0:
                    delay = min(INITIAL_RETRY_DELAY * (2 ** (attempt - 1)), MAX_RETRY_DELAY)
                    logger.info(f"[ai_service] Retry attempt {attempt + 1}/{MAX_RETRIES} after {delay:.1f}s delay")
                    time.sleep(delay)
                
                with httpx.Client(timeout=30.0) as client:
                    response = client.post(
                        f"{self.base_url}/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    response.raise_for_status()
                    data = response.json()
                    
                    if "choices" in data and len(data["choices"]) > 0:
                        content = data["choices"][0]["message"]["content"]
                        if response_format and response_format.get("type") == "json_object":
                            # Parse JSON and return as dict with "content" key for consistency
                            try:
                                parsed = json.loads(content) if isinstance(content, str) else content
                                # Record success
                                self.circuit_breaker.record_call(False)
                                self.circuit_breaker.record_success()
                                return {"content": parsed, "raw": data}
                            except json.JSONDecodeError as e:
                                logger.error(f"[ai_service] Failed to parse JSON response: {e}, content: {content[:200]}")
                                last_error = e
                                self.circuit_breaker.record_call(True)
                                continue  # Retry
                        # Record success
                        self.circuit_breaker.record_call(False)
                        self.circuit_breaker.record_success()
                        return {"content": content, "raw": data}
                    
                    logger.error(f"[ai_service] Unexpected response format: {data}")
                    last_error = ValueError("Unexpected response format")
                    self.circuit_breaker.record_call(True)
                    continue  # Retry
                    
            except httpx.HTTPStatusError as e:
                # HTTP errors (4xx, 5xx) - record and retry
                status_code = e.response.status_code
                if status_code >= 500:
                    # Server errors - retry
                    logger.warning(f"[ai_service] HTTP {status_code} error (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                    last_error = e
                    self.circuit_breaker.record_call(True)
                    continue
                else:
                    # Client errors (4xx) - don't retry
                    logger.error(f"[ai_service] HTTP {status_code} client error: {e}")
                    self.circuit_breaker.record_call(True)
                    return None
                    
            except httpx.TimeoutException as e:
                logger.warning(f"[ai_service] Timeout error (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                last_error = e
                self.circuit_breaker.record_call(True)
                continue  # Retry on timeout
                
            except httpx.NetworkError as e:
                logger.warning(f"[ai_service] Network error (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                last_error = e
                self.circuit_breaker.record_call(True)
                continue  # Retry on network errors
                
            except json.JSONDecodeError as e:
                logger.error(f"[ai_service] JSON decode error (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                last_error = e
                self.circuit_breaker.record_call(True)
                continue  # Retry
                
            except Exception as e:
                logger.error(f"[ai_service] Unexpected error (attempt {attempt + 1}/{MAX_RETRIES}): {e}", exc_info=True)
                last_error = e
                self.circuit_breaker.record_call(True)
                continue  # Retry
        
        # All retries failed
        logger.error(f"[ai_service] All {MAX_RETRIES} retry attempts failed. Last error: {last_error}")
        return None
    
    def enrich_job(
        self,
        title: str,
        description: str,
        org_name: Optional[str] = None,
        location: Optional[str] = None,
        functional_role_hint: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Enrich a job with impact domain, functional role, experience level, and SDGs.
        
        Returns structured enrichment data or None on error.
        """
        if not self.enabled:
            return None
        
        # Build context
        context_parts = []
        if org_name:
            context_parts.append(f"Organization: {org_name}")
        if location:
            context_parts.append(f"Location: {location}")
        if functional_role_hint:
            context_parts.append(f"Role hint: {functional_role_hint}")
        
        context = "\n".join(context_parts) if context_parts else "No additional context."
        
        # Detect if description is too short
        desc_length = len(description) if description else 0
        is_short_description = desc_length < 50
        
        # Build prompt with appropriate warnings
        description_warning = ""
        if is_short_description:
            description_warning = "\n\nWARNING: Job description is very short or missing. Set confidence_overall to a low value (<0.50) and explain why in the response. Do not guess or default to common values."
        
        prompt = f"""You are an expert job classifier for humanitarian and development roles. Analyze the following job posting and extract structured information.

CRITICAL INSTRUCTIONS:
- Analyze the ACTUAL job content, not examples or defaults
- Do NOT default to common values like "Officer / Associate" or "WASH" unless the job actually requires them
- If the job description is insufficient, set low confidence scores (<0.50) and explain why
- Base your classification on the specific job title, description, and context provided
- Use confidence scores to reflect your certainty: high confidence (>0.80) only when very certain, low confidence (<0.60) when uncertain

Job Title: {title}

Job Description:
{description if description else "[No description provided]"}

Additional Context:
{context}
{description_warning}

Extract and return a JSON object with the following structure:
{{
  "impact_domain": ["domain1", "domain2"],  // Array of 1-3 impact domains from the canonical list (empty array if uncertain)
  "impact_confidences": {{"domain1": 0.85, "domain2": 0.75}},  // Confidence scores (0-1) for each domain
  "functional_role": ["role1", "role2"],  // Array of 1-3 functional roles from the canonical list (empty array if uncertain)
  "functional_confidences": {{"role1": 0.90, "role2": 0.70}},  // Confidence scores (0-1) for each role
  "experience_level": "Early / Junior",  // One of: "Early / Junior", "Officer / Associate", "Specialist / Advisor", "Manager / Senior Manager", "Head of Unit / Director", "Expert / Technical Lead" (empty string if uncertain)
  "estimated_experience_years": {{"min": 0, "max": 2}},  // Estimated years of experience required
  "experience_confidence": 0.75,  // Confidence in experience level (0-1)
  "sdgs": [4],  // Array of 0-2 SDG numbers (1-17) that this job contributes to (empty array if uncertain)
  "sdg_confidences": {{"4": 0.85}},  // Confidence scores (0-1) for each SDG
  "sdg_explanation": "Brief explanation of SDG contributions",  // 1-2 sentence explanation (null if no SDGs)
  "matched_keywords": ["keyword1", "keyword2"],  // Up to 10 keywords that justify the classification
  "confidence_overall": 0.80  // Overall confidence in the classification (0-1) - must reflect actual certainty
}}

Canonical Impact Domains (use exact labels):
- Climate & Environment
- Climate Adaptation & Resilience
- Disaster Risk Reduction & Preparedness
- Natural Resource Management & Biodiversity
- Water, Sanitation & Hygiene (WASH)
- Food Security & Nutrition
- Agriculture & Livelihoods
- Public Health & Primary Health Care
- Disease Control & Epidemiology
- Sexual & Reproductive Health (SRH)
- Mental Health & Psychosocial Support (MHPSS)
- Education (Access & Quality)
- Education in Emergencies
- Gender Equality & Women's Empowerment
- Child Protection & Early Childhood Development
- Gender-Based Violence (GBV) Prevention & Response
- Shelter & CCCM
- Migration, Refugees & Displacement
- Humanitarian Response & Emergency Operations
- Peacebuilding, Governance & Rule of Law
- Social Protection & Safety Nets
- Economic Recovery & Jobs / Livelihoods
- Water Resource Management & Irrigation
- Urban Resilience & Sustainable Cities
- Digital Development & Data for Development
- Monitoring, Evaluation, Accountability & Learning (MEAL)
- Human Rights & Advocacy
- Anti-Corruption & Transparency
- Energy Access & Renewable Energy
- Disability Inclusion & Accessibility
- Indigenous Peoples & Cultural Rights
- Innovation & Human-Centred Design

Canonical Functional Roles (use exact labels):
- Program & Field Implementation
- Project Management
- MEAL / Research / Evidence
- Data & GIS
- Communications & Advocacy
- Grants / Partnerships / Fundraising
- Finance, Accounting & Audit
- HR, Admin & Ops
- Logistics, Supply Chain & Procurement
- Technical Specialists
- Policy & Advocacy
- IT / Digital / Systems
- Monitoring Officer / Field Monitoring
- Security & Safety
- Shelter / NFI / CCCM Specialist
- Cash & Voucher Assistance (CVA) Specialist
- Livelihoods & Economic Inclusion Specialist
- Education Specialist / EiE Specialist
- Protection Specialist / Child Protection Specialist
- MHPSS Specialist
- Nutrition Specialist
- Health Technical Advisor
- Geographic / Regional Roles
- Senior Leadership
- Consulting / Short-term Technical Experts
- Legal / Compliance / Donor Compliance

Experience Levels (use exact labels):
- Early / Junior (0–2 yrs)
- Officer / Associate (2–5 yrs)
- Specialist / Advisor (5–8 yrs)
- Manager / Senior Manager (7–12 yrs)
- Head of Unit / Director (10+ yrs)
- Expert / Technical Lead (variable)

Return only valid JSON, no markdown formatting."""

        messages = [
            {"role": "system", "content": "You are a precise job classification system. Analyze each job individually based on its actual content. Do not default to common values. Always return valid JSON. Use confidence scores to reflect your actual certainty."},
            {"role": "user", "content": prompt}
        ]
        
        result = self._call_openrouter(
            messages=messages,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        
        if result and "content" in result:
            # Content is already parsed JSON when response_format is json_object
            content = result["content"]
            if isinstance(content, dict):
                return content
            # Fallback: try to parse if it's a string
            try:
                return json.loads(content) if isinstance(content, str) else content
            except (json.JSONDecodeError, TypeError) as e:
                logger.error(f"[ai_service] Failed to parse enrichment JSON: {e}, content type: {type(content)}")
                return None
        
        logger.warning(f"[ai_service] No content in result: {result}")
        return None
    
    def parse_query(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Parse a natural language search query into structured filters.
        
        Returns structured filter object or None on error.
        """
        if not self.enabled:
            return None
        
        prompt = f"""You are a search query parser for a humanitarian job board. Parse the following user query into structured filters.

User Query: "{query}"

Extract and return a JSON object with the following structure:
{{
  "impact_domain": [],  // Array of 0-2 impact domain labels (from canonical list)
  "functional_role": [],  // Array of 0-2 functional role labels (from canonical list)
  "experience_level": "",  // One experience level label or empty string
  "location": "",  // Country or city name, or empty string
  "is_remote": false,  // Boolean indicating if user wants remote work
  "free_text": ""  // Remaining text for full-text search, or empty if all extracted
}}

Canonical Impact Domains (use exact labels):
- Climate & Environment
- Climate Adaptation & Resilience
- Disaster Risk Reduction & Preparedness
- Natural Resource Management & Biodiversity
- Water, Sanitation & Hygiene (WASH)
- Food Security & Nutrition
- Agriculture & Livelihoods
- Public Health & Primary Health Care
- Disease Control & Epidemiology
- Sexual & Reproductive Health (SRH)
- Mental Health & Psychosocial Support (MHPSS)
- Education (Access & Quality)
- Education in Emergencies
- Gender Equality & Women's Empowerment
- Child Protection & Early Childhood Development
- Gender-Based Violence (GBV) Prevention & Response
- Shelter & CCCM
- Migration, Refugees & Displacement
- Humanitarian Response & Emergency Operations
- Peacebuilding, Governance & Rule of Law
- Social Protection & Safety Nets
- Economic Recovery & Jobs / Livelihoods
- Water Resource Management & Irrigation
- Urban Resilience & Sustainable Cities
- Digital Development & Data for Development
- Monitoring, Evaluation, Accountability & Learning (MEAL)
- Human Rights & Advocacy
- Anti-Corruption & Transparency
- Energy Access & Renewable Energy
- Disability Inclusion & Accessibility
- Indigenous Peoples & Cultural Rights
- Innovation & Human-Centred Design

Canonical Functional Roles (use exact labels):
- Program & Field Implementation
- Project Management
- MEAL / Research / Evidence
- Data & GIS
- Communications & Advocacy
- Grants / Partnerships / Fundraising
- Finance, Accounting & Audit
- HR, Admin & Ops
- Logistics, Supply Chain & Procurement
- Technical Specialists
- Policy & Advocacy
- IT / Digital / Systems
- Monitoring Officer / Field Monitoring
- Security & Safety
- Shelter / NFI / CCCM Specialist
- Cash & Voucher Assistance (CVA) Specialist
- Livelihoods & Economic Inclusion Specialist
- Education Specialist / EiE Specialist
- Protection Specialist / Child Protection Specialist
- MHPSS Specialist
- Nutrition Specialist
- Health Technical Advisor
- Geographic / Regional Roles
- Senior Leadership
- Consulting / Short-term Technical Experts
- Legal / Compliance / Donor Compliance

Experience Levels (use exact labels):
- Early / Junior (0–2 yrs)
- Officer / Associate (2–5 yrs)
- Specialist / Advisor (5–8 yrs)
- Manager / Senior Manager (7–12 yrs)
- Head of Unit / Director (10+ yrs)
- Expert / Technical Lead (variable)

Examples:
- "WASH officer Kenya mid-level" → {{"impact_domain": ["Water, Sanitation & Hygiene (WASH)"], "functional_role": ["Program & Field Implementation"], "experience_level": "Officer / Associate", "location": "Kenya", "is_remote": false, "free_text": ""}}
- "remote gender roles in Nepal" → {{"impact_domain": ["Gender Equality & Women's Empowerment"], "functional_role": [], "experience_level": "", "location": "Nepal", "is_remote": true, "free_text": ""}}
- "entry-level MEAL jobs" → {{"impact_domain": [], "functional_role": ["MEAL / Research / Evidence"], "experience_level": "Early / Junior", "location": "", "is_remote": false, "free_text": ""}}

Return only valid JSON, no markdown formatting."""

        messages = [
            {"role": "system", "content": "You are a precise query parser. Always return valid JSON."},
            {"role": "user", "content": prompt}
        ]
        
        result = self._call_openrouter(
            messages=messages,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        
        if result and "content" in result:
            # Content is already parsed JSON when response_format is json_object
            content = result["content"]
            if isinstance(content, dict):
                return content
            # Fallback: try to parse if it's a string
            try:
                return json.loads(content) if isinstance(content, str) else content
            except (json.JSONDecodeError, TypeError) as e:
                logger.error(f"[ai_service] Failed to parse query JSON: {e}, content type: {type(content)}")
                return None
        
        logger.warning(f"[ai_service] No content in result: {result}")
        return None
    
    def get_autocomplete_suggestions(
        self,
        partial_text: str,
        common_combos: Optional[List[Dict[str, Any]]] = None,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Generate autocomplete suggestions based on partial text and common role+domain combos.
        
        Returns list of suggestion objects with metadata.
        """
        if not self.enabled:
            return None
        
        combos_context = ""
        if common_combos:
            combos_context = "\nCommon role+domain combinations in index:\n"
            for combo in common_combos[:10]:  # Top 10
                combos_context += f"- {combo.get('role', '')} + {combo.get('domain', '')} ({combo.get('count', 0)} jobs)\n"
        
        prompt = f"""You are an autocomplete suggestion generator for a humanitarian job board. Generate intelligent search suggestions based on partial user input.

Partial Text: "{partial_text}"
{combos_context}

Generate up to 8 suggestion chips that would help the user complete their search. Each suggestion should be:
1. Relevant to the partial text
2. Based on the canonical taxonomy (impact domains, functional roles, experience levels)
3. Useful for pre-filling search filters

Return a JSON array of suggestion objects, each with:
{{
  "text": "suggestion text",  // Display text for the chip
  "type": "impact_domain" | "functional_role" | "experience_level" | "location" | "combo",  // Type of suggestion
  "filters": {{  // Pre-filled filters when clicked
    "impact_domain": [],
    "functional_role": [],
    "experience_level": "",
    "location": "",
    "is_remote": false,
    "free_text": ""
  }},
  "confidence": 0.85  // Confidence score (0-1)
}}

Examples:
- Partial: "wash" → suggestions: ["WASH", "WASH Officer", "WASH Specialist", "Water, Sanitation & Hygiene (WASH)"]
- Partial: "mid" → suggestions: ["Mid-level", "Officer / Associate", "Specialist / Advisor"]
- Partial: "remote" → suggestions: ["Remote jobs", "Remote work", "Work from home"]

Return only valid JSON array, no markdown formatting."""

        messages = [
            {"role": "system", "content": "You are a helpful autocomplete generator. Always return valid JSON."},
            {"role": "user", "content": prompt}
        ]
        
        result = self._call_openrouter(
            messages=messages,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        
        if result and "content" in result:
            # Content is already parsed JSON when response_format is json_object
            content = result["content"]
            try:
                # If content is already a dict, use it directly
                if isinstance(content, dict):
                    data = content
                # If content is a string, parse it
                elif isinstance(content, str):
                    data = json.loads(content)
                else:
                    data = content
                
                # Handle both {"suggestions": [...]} and direct array
                if isinstance(data, dict) and "suggestions" in data:
                    return data["suggestions"]
                elif isinstance(data, list):
                    return data
                return None
            except (json.JSONDecodeError, TypeError) as e:
                logger.error(f"[ai_service] Failed to parse autocomplete JSON: {e}, content type: {type(content)}")
                return None
        
        logger.warning(f"[ai_service] No content in result: {result}")
        return None


# Singleton instance
_ai_service_instance: Optional[AIService] = None


def get_ai_service() -> AIService:
    """Get or create the singleton AI service instance."""
    global _ai_service_instance
    if _ai_service_instance is None:
        _ai_service_instance = AIService()
    return _ai_service_instance

