"""
Enterprise-Grade Job Categorization System

Provides intelligent, context-aware job level categorization that:
- Uses AI enrichment data as primary source
- Implements context-aware keyword matching
- Supports UN/INGO-specific hierarchies
- Provides granular, accurate categories
- Makes AidJobs stand out from competitors
"""
import re
import logging
from typing import Optional, Dict, List, Tuple
from enum import Enum

logger = logging.getLogger(__name__)


class JobLevel(Enum):
    """Standardized job levels for AidJobs"""
    ENTRY_INTERN = "Entry / Intern"
    JUNIOR_ASSOCIATE = "Junior / Associate"
    OFFICER_PROFESSIONAL = "Officer / Professional"
    SPECIALIST_ADVISOR = "Specialist / Advisor"
    MANAGER_SENIOR_MANAGER = "Manager / Senior Manager"
    HEAD_DIRECTOR = "Head / Director"
    EXECUTIVE_CHIEF = "Executive / Chief"


class JobCategorizer:
    """
    Enterprise-grade job categorizer with context-aware matching.
    
    Features:
    - Context-aware keyword detection (checks for modifiers)
    - Multi-signal analysis (title + description)
    - UN/INGO hierarchy support
    - Enrichment data integration
    - Word boundary detection
    """
    
    # Context-aware keyword patterns with modifiers
    # Format: (level, keywords, required_modifiers, excluded_modifiers)
    LEVEL_PATTERNS = [
        # Entry/Intern level
        (
            JobLevel.ENTRY_INTERN,
            ['intern', 'internship', 'trainee', 'graduate', 'entry-level', 'entry level'],
            [],  # No required modifiers
            ['senior', 'chief', 'head', 'director', 'manager', 'lead', 'principal']  # Exclude if these present
        ),
        
        # Junior/Associate level
        (
            JobLevel.JUNIOR_ASSOCIATE,
            ['junior', 'entry', 'assistant', 'associate', 'coordinator', 'assistant'],
            [],  # No required modifiers
            ['senior', 'chief', 'head', 'director', 'manager', 'lead', 'principal', 'specialist', 'advisor']
        ),
        
        # Officer/Professional level (MOST COMMON - needs careful handling)
        (
            JobLevel.OFFICER_PROFESSIONAL,
            ['officer', 'professional', 'analyst', 'representative'],
            [],  # No required modifiers
            ['senior', 'chief', 'head', 'director', 'manager', 'lead', 'principal', 'specialist', 'advisor']
        ),
        
        # Specialist/Advisor level
        (
            JobLevel.SPECIALIST_ADVISOR,
            ['specialist', 'advisor', 'adviser', 'expert', 'consultant', 'technical advisor'],
            [],  # No required modifiers
            ['senior', 'chief', 'head', 'director', 'manager']  # But allow "Senior Specialist"
        ),
        
        # Manager/Senior Manager level
        (
            JobLevel.MANAGER_SENIOR_MANAGER,
            ['manager', 'senior manager', 'program manager', 'project manager', 'deputy'],
            [],  # No required modifiers
            ['chief', 'head', 'director', 'executive']  # Exclude if higher level present
        ),
        
        # Head/Director level
        (
            JobLevel.HEAD_DIRECTOR,
            ['head', 'director', 'deputy director', 'country director', 'regional director', 'program director'],
            [],  # No required modifiers
            ['chief', 'executive', 'president']  # Exclude if higher level present
        ),
        
        # Executive/Chief level (highest)
        (
            JobLevel.EXECUTIVE_CHIEF,
            ['chief', 'executive', 'president', 'vice president', 'vp', 'ceo', 'cto', 'cfo', 'country representative'],
            [],  # No required modifiers
            []  # No exclusions (top level)
        ),
    ]
    
    # Seniority modifiers that elevate a level
    SENIORITY_MODIFIERS = {
        'senior': 1,  # Elevates by 1 level
        'lead': 1,
        'principal': 1,
        'chief': 2,  # Elevates by 2 levels
        'head': 2,
        'executive': 2,
        'deputy': 0,  # Doesn't elevate (deputy director is still director level)
        'assistant': -1,  # Lowers by 1 level
        'junior': -1,
        'entry': -1,
    }
    
    @staticmethod
    def _map_un_p_level(p_number: int) -> JobLevel:
        """Map UN P-level to standardized level"""
        if p_number <= 2:
            return JobLevel.JUNIOR_ASSOCIATE
        elif p_number <= 4:
            return JobLevel.OFFICER_PROFESSIONAL
        elif p_number <= 5:
            return JobLevel.SPECIALIST_ADVISOR
        else:  # P6+
            return JobLevel.MANAGER_SENIOR_MANAGER
    
    @staticmethod
    def categorize_from_enrichment(experience_level: Optional[str]) -> Optional[str]:
        """
        Map AI enrichment experience_level to standardized level_norm.
        
        This is the PRIMARY method - use enrichment data when available.
        
        Args:
            experience_level: From AI enrichment (e.g., "Officer / Associate", "Manager / Senior Manager")
        
        Returns:
            Standardized level_norm string or None
        """
        if not experience_level:
            return None
        
        # Map enrichment levels to our standardized levels
        enrichment_mapping = {
            "Early / Junior": JobLevel.JUNIOR_ASSOCIATE.value,
            "Officer / Associate": JobLevel.OFFICER_PROFESSIONAL.value,
            "Specialist / Advisor": JobLevel.SPECIALIST_ADVISOR.value,
            "Manager / Senior Manager": JobLevel.MANAGER_SENIOR_MANAGER.value,
            "Head of Unit / Director": JobLevel.HEAD_DIRECTOR.value,
            "Expert / Technical Lead": JobLevel.SPECIALIST_ADVISOR.value,
        }
        
        # Direct mapping
        if experience_level in enrichment_mapping:
            return enrichment_mapping[experience_level]
        
        # Fuzzy matching for variations
        experience_lower = experience_level.lower()
        for key, value in enrichment_mapping.items():
            if any(word in experience_lower for word in key.lower().split('/')):
                return value
        
        return None
    
    @staticmethod
    def categorize_from_title_and_description(
        title: Optional[str],
        description: Optional[str] = None,
        org_type: Optional[str] = None
    ) -> Optional[str]:
        """
        Context-aware categorization from job title and description.
        
        This is the SECONDARY method - used when enrichment data is not available.
        
        Features:
        - Context-aware matching (checks for modifiers)
        - Word boundary detection
        - Multi-signal analysis (title + description)
        - UN/INGO hierarchy support
        
        Args:
            title: Job title
            description: Job description (optional, for additional context)
            org_type: Organization type (e.g., 'un', 'ingo', 'ngo')
        
        Returns:
            Standardized level_norm string or None
        """
        if not title:
            return None
        
        title_lower = title.lower()
        description_lower = (description or '').lower()
        combined_text = f"{title_lower} {description_lower}".strip()
        
        # Check for UN/INGO specific patterns first
        if org_type in ['un', 'ingo']:
            # Check P-levels
            p_match = re.search(r'p-?\s*(\d+)', combined_text, re.IGNORECASE)
            if p_match:
                p_number = int(p_match.group(1))
                level = JobCategorizer._map_un_p_level(p_number)
                logger.debug(f"[categorizer] UN P-level match: P{p_number} -> {level.value}")
                return level.value
            
            # Check G-levels
            g_match = re.search(r'g-?\s*(\d+)', combined_text, re.IGNORECASE)
            if g_match:
                logger.debug(f"[categorizer] UN G-level match: G{g_match.group(1)} -> {JobLevel.JUNIOR_ASSOCIATE.value}")
                return JobLevel.JUNIOR_ASSOCIATE.value
            
            # Check D-levels
            d_match = re.search(r'd-?\s*(\d+)', combined_text, re.IGNORECASE)
            if d_match:
                logger.debug(f"[categorizer] UN D-level match: D{d_match.group(1)} -> {JobLevel.HEAD_DIRECTOR.value}")
                return JobLevel.HEAD_DIRECTOR.value
            
            # Check ASG/USG
            if re.search(r'(asg|usg)', combined_text, re.IGNORECASE):
                logger.debug(f"[categorizer] UN ASG/USG match -> {JobLevel.EXECUTIVE_CHIEF.value}")
                return JobLevel.EXECUTIVE_CHIEF.value
        
        # Context-aware keyword matching
        best_match = None
        best_score = -1
        
        for level, keywords, required_modifiers, excluded_modifiers in JobCategorizer.LEVEL_PATTERNS:
            # Check if any excluded modifiers are present (skip this level if so)
            if excluded_modifiers:
                if any(mod in title_lower for mod in excluded_modifiers):
                    continue
            
            # Check for required modifiers (if any)
            if required_modifiers:
                if not any(mod in title_lower for mod in required_modifiers):
                    continue
            
            # Check for keywords with word boundary detection
            score = 0
            matched_keyword = None
            
            for keyword in keywords:
                # Use word boundary regex for exact matching
                pattern = r'\b' + re.escape(keyword) + r'\b'
                if re.search(pattern, title_lower, re.IGNORECASE):
                    score = 10  # Base score for keyword match
                    matched_keyword = keyword
                    
                    # Check for seniority modifiers that affect the level
                    for modifier, elevation in JobCategorizer.SENIORITY_MODIFIERS.items():
                        if modifier in title_lower:
                            # Check if modifier is near the keyword (within 3 words)
                            title_words = title_lower.split()
                            keyword_idx = -1
                            modifier_idx = -1
                            
                            for i, word in enumerate(title_words):
                                if keyword in word:
                                    keyword_idx = i
                                if modifier in word:
                                    modifier_idx = i
                            
                            if keyword_idx >= 0 and modifier_idx >= 0:
                                distance = abs(keyword_idx - modifier_idx)
                                if distance <= 3:  # Modifier is near keyword
                                    score += elevation * 5  # Boost score based on elevation
                                    logger.debug(f"[categorizer] Found modifier '{modifier}' near '{keyword}' (elevation: {elevation})")
                    
                    break
            
            # Also check description for additional context
            if description_lower and matched_keyword:
                if matched_keyword in description_lower:
                    score += 2  # Bonus for description match
            
            # Special handling for "officer" - needs extra context
            if matched_keyword == 'officer':
                # Check for seniority indicators
                if any(mod in title_lower for mod in ['senior', 'chief', 'head', 'director', 'manager']):
                    # Skip officer level, let higher level patterns match
                    continue
                
                # Check for junior indicators
                if any(mod in title_lower for mod in ['junior', 'entry', 'assistant', 'associate']):
                    score = 5  # Lower score, might be junior level
                    # Don't break, continue to check other patterns
            
            if score > best_score:
                best_score = score
                best_match = level
        
        if best_match:
            logger.debug(f"[categorizer] Categorized '{title[:50]}...' as {best_match.value} (score: {best_score})")
            return best_match.value
        
        return None
    
    @staticmethod
    def categorize_job(
        title: Optional[str],
        description: Optional[str] = None,
        experience_level: Optional[str] = None,
        org_type: Optional[str] = None,
        current_level_norm: Optional[str] = None
    ) -> Optional[str]:
        """
        Main categorization method - uses enrichment data first, then falls back to analysis.
        
        Priority:
        1. AI enrichment experience_level (if available and confident)
        2. Context-aware title/description analysis
        3. Current level_norm (if exists and seems reasonable)
        
        Args:
            title: Job title
            description: Job description
            experience_level: From AI enrichment
            org_type: Organization type
            current_level_norm: Existing level_norm (for fallback)
        
        Returns:
            Standardized level_norm string or None
        """
        # Priority 1: Use enrichment data if available
        if experience_level:
            enriched_level = JobCategorizer.categorize_from_enrichment(experience_level)
            if enriched_level:
                logger.debug(f"[categorizer] Using enrichment data: {experience_level} -> {enriched_level}")
                return enriched_level
        
        # Priority 2: Context-aware analysis
        analyzed_level = JobCategorizer.categorize_from_title_and_description(
            title, description, org_type
        )
        if analyzed_level:
            logger.debug(f"[categorizer] Using analyzed level: {analyzed_level}")
            return analyzed_level
        
        # Priority 3: Keep existing if reasonable (don't downgrade to None)
        if current_level_norm:
            logger.debug(f"[categorizer] Keeping existing level_norm: {current_level_norm}")
            return current_level_norm
        
        return None

