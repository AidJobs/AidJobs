"""
Data normalization module for AidJobs.

Normalizes raw job data to match lookup table values:
- Country names → ISO2 codes
- Level variations → standardized levels
- Tag synonyms → canonical tags
- Boolean strings → bool values
"""

from typing import Optional, List, Any
import re


class Normalizer:
    """
    Normalizes job data fields to match lookup table values.
    
    Normalization rules are hardcoded (no database lookups) for simplicity
    and performance. This module should be kept in sync with lookup tables.
    """
    
    COUNTRY_MAP = {
        'afghanistan': 'AF',
        'bangladesh': 'BD',
        'congo': 'CD',
        'drc': 'CD',
        'democratic republic of congo': 'CD',
        'ethiopia': 'ET',
        'india': 'IN',
        'kenya': 'KE',
        'nigeria': 'NG',
        'pakistan': 'PK',
        'sudan': 'SD',
        'somalia': 'SO',
        'syria': 'SY',
        'syrian arab republic': 'SY',
        'united states': 'US',
        'usa': 'US',
        'us': 'US',
        'yemen': 'YE',
    }
    
    LEVEL_MAP = {
        'intern': 'Intern',
        'internship': 'Intern',
        'junior': 'Junior',
        'entry': 'Junior',
        'entry-level': 'Junior',
        'entry level': 'Junior',
        'mid': 'Mid',
        'mid-level': 'Mid',
        'mid level': 'Mid',
        'intermediate': 'Mid',
        'senior': 'Senior',
        'sr': 'Senior',
        'sr.': 'Senior',
        'lead': 'Lead',
        'principal': 'Lead',
        'staff': 'Lead',
    }
    
    TAG_MAP = {
        'health': 'health',
        'healthcare': 'health',
        'medical': 'health',
        'education': 'education',
        'learning': 'education',
        'teaching': 'education',
        'wash': 'wash',
        'water': 'wash',
        'sanitation': 'wash',
        'hygiene': 'wash',
        'climate': 'climate',
        'environment': 'climate',
        'climate change': 'climate',
        'gender': 'gender',
        'women': 'gender',
        "women's rights": 'gender',
        'protection': 'protection',
        'child protection': 'protection',
        'safeguarding': 'protection',
        'nutrition': 'nutrition',
        'food': 'nutrition',
        'malnutrition': 'nutrition',
        'livelihoods': 'livelihoods',
        'economic': 'livelihoods',
        'employment': 'livelihoods',
        'shelter': 'shelter',
        'housing': 'shelter',
        'food-security': 'food-security',
        'food security': 'food-security',
        'famine': 'food-security',
    }
    
    VALID_TAGS = {
        'health', 'education', 'wash', 'climate', 'gender',
        'protection', 'nutrition', 'livelihoods', 'shelter', 'food-security'
    }
    
    @staticmethod
    def to_iso_country(value: Optional[str]) -> Optional[str]:
        """
        Normalize country name to ISO2 code.
        
        Args:
            value: Country name (e.g., "India", "United States", "Kenya")
        
        Returns:
            ISO2 code (e.g., "IN", "US", "KE") or None if not recognized
        """
        if not value:
            return None
        
        normalized = value.strip().lower()
        return Normalizer.COUNTRY_MAP.get(normalized)
    
    @staticmethod
    def norm_level(value: Optional[str]) -> Optional[str]:
        """
        Normalize job level to standard format.
        
        Args:
            value: Level string (e.g., "mid-level", "senior", "entry")
        
        Returns:
            Normalized level (e.g., "Mid", "Senior", "Junior") or None
        """
        if not value:
            return None
        
        normalized = value.strip().lower()
        return Normalizer.LEVEL_MAP.get(normalized)
    
    @staticmethod
    def norm_tags(values: Optional[List[str]]) -> List[str]:
        """
        Normalize mission tags to canonical format.
        
        Lowercases, trims, maps synonyms, and drops unknown tags.
        
        Args:
            values: List of tag strings (e.g., ["Health", "WASH", "education"])
        
        Returns:
            List of normalized tags (e.g., ["health", "wash", "education"])
        """
        if not values:
            return []
        
        normalized_tags = []
        for tag in values:
            if not tag:
                continue
            
            clean_tag = tag.strip().lower()
            
            canonical_tag = Normalizer.TAG_MAP.get(clean_tag)
            if canonical_tag and canonical_tag in Normalizer.VALID_TAGS:
                if canonical_tag not in normalized_tags:
                    normalized_tags.append(canonical_tag)
        
        return normalized_tags
    
    @staticmethod
    def to_bool(value: Any) -> Optional[bool]:
        """
        Parse boolean from various input types.
        
        Args:
            value: Boolean-like value (bool, str, int, None)
        
        Returns:
            True, False, or None
        
        Examples:
            True, "true", "yes", "1", 1 → True
            False, "false", "no", "0", 0 → False
            None, "", "unknown" → None
        """
        if value is None:
            return None
        
        if isinstance(value, bool):
            return value
        
        if isinstance(value, int):
            if value == 1:
                return True
            elif value == 0:
                return False
            else:
                return None
        
        if isinstance(value, str):
            normalized = value.strip().lower()
            
            if normalized in ('true', 'yes', 'y', '1', 't'):
                return True
            elif normalized in ('false', 'no', 'n', '0', 'f'):
                return False
            else:
                return None
        
        return None


def normalize_job_data(raw_data: dict) -> dict:
    """
    Normalize job data fields.
    
    Args:
        raw_data: Raw job data dictionary
    
    Returns:
        Dictionary with normalized fields
    
    Example:
        >>> raw = {"country": "India", "level_norm": "mid-level", "mission_tags": ["Health", "WASH"]}
        >>> normalize_job_data(raw)
        {"country_iso": "IN", "level_norm": "Mid", "mission_tags": ["health", "wash"]}
    """
    normalized = {}
    
    if 'country' in raw_data:
        normalized['country_iso'] = Normalizer.to_iso_country(raw_data['country'])
    
    if 'level_norm' in raw_data:
        normalized['level_norm'] = Normalizer.norm_level(raw_data['level_norm'])
    
    if 'mission_tags' in raw_data:
        normalized['mission_tags'] = Normalizer.norm_tags(raw_data['mission_tags'])
    
    if 'international_eligible' in raw_data:
        normalized['international_eligible'] = Normalizer.to_bool(raw_data['international_eligible'])
    
    return normalized
