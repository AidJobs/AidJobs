"""
Enrichment Preprocessing Service.
Enhances input quality before sending to AI.
"""
import logging
import re
from typing import Dict, Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def normalize_title(title: str) -> str:
    """
    Normalize and clean job title.
    
    - Remove extra whitespace
    - Fix common typos/formatting issues
    - Standardize capitalization
    """
    if not title:
        return ""
    
    # Remove extra whitespace
    title = re.sub(r'\s+', ' ', title).strip()
    
    # Fix common issues
    title = title.replace('  ', ' ')  # Double spaces
    title = title.replace(' - ', ' - ')  # Normalize dashes
    
    # Capitalize first letter of each word (but preserve acronyms)
    words = title.split()
    normalized_words = []
    for word in words:
        # Preserve acronyms (all caps)
        if word.isupper() and len(word) > 1:
            normalized_words.append(word)
        # Preserve mixed case (likely proper nouns)
        elif any(c.isupper() for c in word[1:]):
            normalized_words.append(word)
        else:
            # Capitalize first letter
            normalized_words.append(word.capitalize())
    
    return ' '.join(normalized_words)


def enhance_description(
    description: str,
    apply_url: Optional[str] = None,
    org_name: Optional[str] = None
) -> str:
    """
    Enhance job description by adding context.
    
    - If description is too short, try to extract from apply_url
    - Add organization context
    - Clean and normalize
    """
    if not description:
        description = ""
    
    # Clean description
    description = re.sub(r'\s+', ' ', description).strip()
    
    # If description is very short and we have apply_url, note it
    if len(description) < 50 and apply_url:
        # Could fetch full description from URL in future
        # For now, just note that more info is available
        description += f" [Full description available at: {apply_url}]"
    
    # Add organization context if available
    if org_name and org_name.lower() not in description.lower():
        # Add org context at the beginning if not already present
        description = f"Organization: {org_name}. {description}"
    
    return description.strip()


def build_enrichment_context(
    title: str,
    description: str,
    org_name: Optional[str] = None,
    location: Optional[str] = None,
    apply_url: Optional[str] = None
) -> str:
    """
    Build enhanced context for AI enrichment.
    
    Combines all available information in a structured way.
    """
    context_parts = []
    
    # Normalize title
    normalized_title = normalize_title(title)
    context_parts.append(f"Job Title: {normalized_title}")
    
    # Enhance description
    enhanced_description = enhance_description(description, apply_url, org_name)
    if enhanced_description:
        context_parts.append(f"Job Description: {enhanced_description}")
    
    # Add organization context
    if org_name:
        context_parts.append(f"Organization: {org_name}")
    
    # Add location context
    if location:
        context_parts.append(f"Location: {location}")
    
    return "\n".join(context_parts)


def preprocess_job_for_enrichment(
    title: str,
    description: str,
    org_name: Optional[str] = None,
    location: Optional[str] = None,
    apply_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Preprocess a job before enrichment.
    
    Returns dict with:
    - normalized_title: Cleaned and normalized title
    - enhanced_description: Enhanced description with context
    - context: Full context string for AI
    - input_quality_score: Score 0-1 indicating input quality
    """
    normalized_title = normalize_title(title)
    enhanced_description = enhance_description(description, apply_url, org_name)
    context = build_enrichment_context(
        normalized_title,
        enhanced_description,
        org_name,
        location,
        apply_url
    )
    
    # Calculate input quality score
    quality_score = 1.0
    
    # Penalize short descriptions
    desc_length = len(enhanced_description) if enhanced_description else 0
    if desc_length < 50:
        quality_score *= 0.5
    elif desc_length < 100:
        quality_score *= 0.7
    elif desc_length < 200:
        quality_score *= 0.9
    
    # Penalize missing org_name
    if not org_name:
        quality_score *= 0.9
    
    # Penalize missing location
    if not location:
        quality_score *= 0.95
    
    return {
        "normalized_title": normalized_title,
        "enhanced_description": enhanced_description,
        "context": context,
        "input_quality_score": quality_score,
        "description_length": desc_length,
    }

