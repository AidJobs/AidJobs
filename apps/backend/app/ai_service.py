"""
AI Service for OpenRouter integration.
Handles all LLM calls using gpt-4o-mini via OpenRouter.
"""
import os
import json
import logging
from typing import Any, Optional, Dict, List
import httpx

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class AIService:
    """Service for making AI calls via OpenRouter."""
    
    def __init__(self):
        self.api_key = OPENROUTER_API_KEY
        self.model = OPENROUTER_MODEL
        self.base_url = OPENROUTER_BASE_URL
        self.enabled = bool(self.api_key)
        
        if not self.enabled:
            logger.warning("[ai_service] OpenRouter API key not configured. AI features disabled.")
    
    def _call_openrouter(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.0,
        response_format: Optional[Dict[str, str]] = None,
        max_tokens: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """Make a call to OpenRouter API."""
        if not self.enabled:
            logger.warning("[ai_service] OpenRouter not enabled, skipping call")
            return None
        
        try:
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
                            return {"content": parsed, "raw": data}
                        except json.JSONDecodeError as e:
                            logger.error(f"[ai_service] Failed to parse JSON response: {e}, content: {content[:200]}")
                            return None
                    return {"content": content, "raw": data}
                
                logger.error(f"[ai_service] Unexpected response format: {data}")
                return None
                
        except httpx.HTTPError as e:
            logger.error(f"[ai_service] HTTP error calling OpenRouter: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"[ai_service] JSON decode error: {e}")
            return None
        except Exception as e:
            logger.error(f"[ai_service] Unexpected error: {e}", exc_info=True)
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
        
        prompt = f"""You are an expert job classifier for humanitarian and development roles. Analyze the following job posting and extract structured information.

Job Title: {title}

Job Description:
{description}

Additional Context:
{context}

Extract and return a JSON object with the following structure:
{{
  "impact_domain": ["domain1", "domain2"],  // Array of 1-3 impact domains from the canonical list
  "impact_confidences": {{"domain1": 0.85, "domain2": 0.75}},  // Confidence scores (0-1) for each domain
  "functional_role": ["role1", "role2"],  // Array of 1-3 functional roles from the canonical list
  "functional_confidences": {{"role1": 0.90, "role2": 0.70}},  // Confidence scores (0-1) for each role
  "experience_level": "Officer / Associate",  // One of: "Early / Junior", "Officer / Associate", "Specialist / Advisor", "Manager / Senior Manager", "Head of Unit / Director", "Expert / Technical Lead"
  "estimated_experience_years": {{"min": 2, "max": 5}},  // Estimated years of experience required
  "experience_confidence": 0.80,  // Confidence in experience level (0-1)
  "sdgs": [3, 6],  // Array of 0-2 SDG numbers (1-17) that this job contributes to
  "sdg_confidences": {{"3": 0.88, "6": 0.72}},  // Confidence scores (0-1) for each SDG
  "sdg_explanation": "This role contributes to SDG 3 (Good Health) through primary healthcare delivery and SDG 6 (Clean Water) via WASH interventions.",  // 1-2 sentence explanation
  "matched_keywords": ["health", "WASH", "primary care", "water", "sanitation"],  // Up to 10 keywords that justify the classification
  "confidence_overall": 0.82  // Overall confidence in the classification (0-1)
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
            {"role": "system", "content": "You are a precise job classification system. Always return valid JSON."},
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

