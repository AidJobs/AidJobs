"""
Comprehensive normalization module for AidJobs.

Normalizes raw job data to match taxonomy lookup tables with:
- Database-backed validation against lookup tables
- Unknown value capture in raw_metadata.unknown
- Compensation parsing with USD conversion
- Contract duration parsing
- Robust type conversions
"""

from typing import Optional, List, Any, Dict, Tuple
import re
from app.db_config import get_db_connection


# Static currency conversion rates (simplified)
CURRENCY_TO_USD = {
    'USD': 1.0,
    'EUR': 1.1,
    'GBP': 1.27,
    'CHF': 1.13,
    'INR': 0.012,
    'KES': 0.0078,
    'ZAR': 0.055,
    'CAD': 0.73,
    'AUD': 0.65,
}


class LookupCache:
    """
    Cache for lookup table values to avoid repeated DB queries.
    """
    def __init__(self):
        self._countries: Optional[Dict[str, str]] = None  # name_lower -> iso2
        self._levels: Optional[set] = None
        self._missions: Optional[set] = None
        self._modalities: Optional[set] = None
        self._contracts: Optional[set] = None
        self._benefits: Optional[set] = None
        self._policy_flags: Optional[set] = None
        self._donors: Optional[set] = None
        self._synonyms: Optional[Dict[str, Dict[str, str]]] = None  # type -> {raw: canonical}
    
    def load_countries(self) -> Dict[str, str]:
        """Load country name -> ISO2 mapping."""
        if self._countries is not None:
            return self._countries
        
        conn = get_db_connection()
        if not conn:
            self._countries = {}
            return self._countries
        
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT code_iso2, name FROM countries")
            self._countries = {
                row[1].lower(): row[0] 
                for row in cursor.fetchall()
            }
        except Exception:
            self._countries = {}
        finally:
            cursor.close()
            conn.close()
        
        return self._countries
    
    def load_levels(self) -> set:
        """Load valid level keys."""
        if self._levels is not None:
            return self._levels
        
        conn = get_db_connection()
        if not conn:
            self._levels = {'intern', 'junior', 'mid', 'senior', 'lead', 'executive'}
            return self._levels
        
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT key FROM levels")
            self._levels = {row[0] for row in cursor.fetchall()}
        except Exception:
            self._levels = {'intern', 'junior', 'mid', 'senior', 'lead', 'executive'}
        finally:
            cursor.close()
            conn.close()
        
        return self._levels
    
    def load_missions(self) -> set:
        """Load valid mission keys."""
        if self._missions is not None:
            return self._missions
        
        conn = get_db_connection()
        if not conn:
            self._missions = set()
            return self._missions
        
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT key FROM missions")
            self._missions = {row[0] for row in cursor.fetchall()}
        except Exception:
            self._missions = set()
        finally:
            cursor.close()
            conn.close()
        
        return self._missions
    
    def load_modalities(self) -> set:
        """Load valid work modality keys."""
        if self._modalities is not None:
            return self._modalities
        
        conn = get_db_connection()
        if not conn:
            self._modalities = {'remote', 'home_based', 'hybrid', 'onsite', 'field', 'flexible'}
            return self._modalities
        
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT key FROM work_modalities")
            self._modalities = {row[0] for row in cursor.fetchall()}
        except Exception:
            self._modalities = {'remote', 'home_based', 'hybrid', 'onsite', 'field', 'flexible'}
        finally:
            cursor.close()
            conn.close()
        
        return self._modalities
    
    def load_benefits(self) -> set:
        """Load valid benefit keys."""
        if self._benefits is not None:
            return self._benefits
        
        conn = get_db_connection()
        if not conn:
            self._benefits = set()
            return self._benefits
        
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT key FROM benefits")
            self._benefits = {row[0] for row in cursor.fetchall()}
        except Exception:
            self._benefits = set()
        finally:
            cursor.close()
            conn.close()
        
        return self._benefits
    
    def load_policy_flags(self) -> set:
        """Load valid policy flag keys."""
        if self._policy_flags is not None:
            return self._policy_flags
        
        conn = get_db_connection()
        if not conn:
            self._policy_flags = set()
            return self._policy_flags
        
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT key FROM policy_flags")
            self._policy_flags = {row[0] for row in cursor.fetchall()}
        except Exception:
            self._policy_flags = set()
        finally:
            cursor.close()
            conn.close()
        
        return self._policy_flags
    
    def load_donors(self) -> set:
        """Load valid donor keys."""
        if self._donors is not None:
            return self._donors
        
        conn = get_db_connection()
        if not conn:
            self._donors = set()
            return self._donors
        
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT key FROM donors")
            self._donors = {row[0] for row in cursor.fetchall()}
        except Exception:
            self._donors = set()
        finally:
            cursor.close()
            conn.close()
        
        return self._donors
    
    def load_synonyms(self) -> Dict[str, Dict[str, str]]:
        """Load synonym mappings by type."""
        if self._synonyms is not None:
            return self._synonyms
        
        conn = get_db_connection()
        if not conn:
            self._synonyms = self._get_hardcoded_synonyms()
            return self._synonyms
        
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT type, raw_value, canonical_key FROM synonyms")
            self._synonyms = {}
            for row in cursor.fetchall():
                type_name, raw, canonical = row
                if type_name not in self._synonyms:
                    self._synonyms[type_name] = {}
                self._synonyms[type_name][raw.lower()] = canonical
        except Exception:
            self._synonyms = self._get_hardcoded_synonyms()
        finally:
            cursor.close()
            conn.close()
        
        # Add hardcoded synonyms not in DB
        hardcoded = self._get_hardcoded_synonyms()
        for type_name, mappings in hardcoded.items():
            if type_name not in self._synonyms:
                self._synonyms[type_name] = {}
            for raw, canonical in mappings.items():
                if raw not in self._synonyms[type_name]:
                    self._synonyms[type_name][raw] = canonical
        
        return self._synonyms
    
    def _get_hardcoded_synonyms(self) -> Dict[str, Dict[str, str]]:
        """Hardcoded synonym mappings as fallback."""
        return {
            'level': {
                'entry': 'junior',
                'entry-level': 'junior',
                'entry level': 'junior',
                'associate': 'junior',
                'mid-level': 'mid',
                'mid level': 'mid',
                'intermediate': 'mid',
                'staff': 'mid',
                'senior': 'senior',
                'sr': 'senior',
                'sr.': 'senior',
                'senior-level': 'senior',
                'senior level': 'senior',
                'manager': 'senior',
                'principal': 'lead',
            },
            'mission': {
                'healthcare': 'health',
                'medical': 'health',
                'sanitation': 'wash',
                'water': 'wash',
                'human-rights': 'human_rights',
                'humanrights': 'human_rights',
            },
            'modality': {
                'office': 'onsite',
                'on-site': 'onsite',
                'on site': 'onsite',
                'wfh': 'remote',
                'work from home': 'remote',
                'home based': 'home_based',
                'home-based': 'home_based',
            },
        }


# Global cache instance
_cache = LookupCache()


def to_iso_country(country_name: Optional[str]) -> Optional[str]:
    """
    Convert country name to ISO-2 code using countries lookup table.
    
    Args:
        country_name: Country name (e.g., "India", "United States")
    
    Returns:
        ISO-2 code (e.g., "IN", "US") or None if not found
    """
    if not country_name or not isinstance(country_name, str):
        return None
    
    countries = _cache.load_countries()
    normalized = country_name.strip().lower()
    return countries.get(normalized)


def norm_level(level: Optional[str]) -> Optional[str]:
    """
    Normalize job level to standard values.
    
    Maps synonyms to canonical levels: intern, junior, mid, senior, lead, executive
    
    Args:
        level: Raw level string (e.g., "Entry Level", "Sr.", "mid-level")
    
    Returns:
        Normalized level key or None if invalid
    """
    if not level or not isinstance(level, str):
        return None
    
    normalized = level.strip().lower()
    
    # Try synonym mapping first
    synonyms = _cache.load_synonyms()
    if 'level' in synonyms and normalized in synonyms['level']:
        return synonyms['level'][normalized]
    
    # Check if already a valid level
    valid_levels = _cache.load_levels()
    if normalized in valid_levels:
        return normalized
    
    return None


def norm_modality(modality: Optional[str]) -> Optional[str]:
    """
    Normalize work modality.
    
    Valid values: remote, home_based, hybrid, onsite, field, flexible
    
    Args:
        modality: Raw modality string
    
    Returns:
        Normalized modality key or None if invalid
    """
    if not modality or not isinstance(modality, str):
        return None
    
    normalized = modality.strip().lower().replace('-', '_').replace(' ', '_')
    
    # Try synonym mapping
    synonyms = _cache.load_synonyms()
    if 'modality' in synonyms:
        original = modality.strip().lower()
        if original in synonyms['modality']:
            return synonyms['modality'][original]
    
    # Check if valid modality
    valid_modalities = _cache.load_modalities()
    if normalized in valid_modalities:
        return normalized
    
    return None


def norm_tags(tags: Optional[List[str]]) -> List[str]:
    """
    Normalize mission tags.
    
    - Lowercase and trim
    - Replace '-' with '_'
    - Keep only keys present in missions table
    - Drop unknown values
    
    Args:
        tags: List of raw tag strings
    
    Returns:
        List of normalized tag keys
    """
    if not tags or not isinstance(tags, list):
        return []
    
    valid_missions = _cache.load_missions()
    synonyms = _cache.load_synonyms()
    mission_synonyms = synonyms.get('mission', {})
    
    normalized = []
    for tag in tags:
        if not tag or not isinstance(tag, str):
            continue
        
        # Normalize: lowercase, trim, replace hyphens
        clean = tag.strip().lower().replace('-', '_')
        
        # Try synonym mapping
        if tag.strip().lower() in mission_synonyms:
            clean = mission_synonyms[tag.strip().lower()]
        
        # Keep only if valid
        if clean in valid_missions:
            normalized.append(clean)
    
    return normalized


def norm_benefits(benefits: Optional[List[str]]) -> List[str]:
    """
    Normalize benefits to lookup keys, drop unknowns.
    
    Args:
        benefits: List of raw benefit strings
    
    Returns:
        List of normalized benefit keys
    """
    if not benefits or not isinstance(benefits, list):
        return []
    
    valid_benefits = _cache.load_benefits()
    
    normalized = []
    for benefit in benefits:
        if not benefit or not isinstance(benefit, str):
            continue
        
        clean = benefit.strip().lower().replace('-', '_').replace(' ', '_')
        
        if clean in valid_benefits:
            normalized.append(clean)
    
    return normalized


def norm_policy(policies: Optional[List[str]]) -> List[str]:
    """
    Normalize policy flags to lookup keys, drop unknowns.
    
    Args:
        policies: List of raw policy strings
    
    Returns:
        List of normalized policy flag keys
    """
    if not policies or not isinstance(policies, list):
        return []
    
    valid_flags = _cache.load_policy_flags()
    
    normalized = []
    for policy in policies:
        if not policy or not isinstance(policy, str):
            continue
        
        clean = policy.strip().lower().replace('-', '_').replace(' ', '_')
        
        if clean in valid_flags:
            normalized.append(clean)
    
    return normalized


def norm_donors(donors: Optional[List[str]]) -> List[str]:
    """
    Normalize donor names to lookup keys, drop unknowns.
    
    Args:
        donors: List of raw donor strings
    
    Returns:
        List of normalized donor keys
    """
    if not donors or not isinstance(donors, list):
        return []
    
    valid_donors = _cache.load_donors()
    
    normalized = []
    for donor in donors:
        if not donor or not isinstance(donor, str):
            continue
        
        clean = donor.strip().lower().replace('-', '_').replace(' ', '_')
        
        if clean in valid_donors:
            normalized.append(clean)
    
    return normalized


def to_bool(value: Any) -> Optional[bool]:
    """
    Robust boolean parsing.
    
    Args:
        value: String, int, or bool
    
    Returns:
        True, False, or None if unparseable
    """
    if value is None:
        return None
    
    if isinstance(value, bool):
        return value
    
    if isinstance(value, (int, float)):
        return value != 0
    
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ('true', 'yes', '1', 't', 'y'):
            return True
        if normalized in ('false', 'no', '0', 'f', 'n'):
            return False
    
    return None


def parse_contract_duration(duration: Optional[str]) -> Optional[int]:
    """
    Parse contract duration to months as int if derivable.
    
    Examples:
        "6 months" -> 6
        "1 year" -> 12
        "2 years" -> 24
        "3-6 months" -> 6 (take max)
    
    Args:
        duration: Raw duration string
    
    Returns:
        Duration in months as int, or None
    """
    if not duration or not isinstance(duration, str):
        return None
    
    normalized = duration.strip().lower()
    
    # Try to extract months directly
    month_match = re.search(r'(\d+)\s*(?:month|mo)', normalized)
    if month_match:
        return int(month_match.group(1))
    
    # Try to extract years and convert
    year_match = re.search(r'(\d+)\s*(?:year|yr)', normalized)
    if year_match:
        return int(year_match.group(1)) * 12
    
    # Try range (e.g., "3-6 months")
    range_match = re.search(r'(\d+)\s*-\s*(\d+)\s*(?:month|mo)', normalized)
    if range_match:
        return int(range_match.group(2))  # Take max
    
    return None


def parse_compensation(
    text: Optional[str] = None,
    fields: Optional[Dict[str, Any]] = None
) -> Tuple[bool, Optional[str], Optional[float], Optional[float], Optional[str], Optional[float]]:
    """
    Parse compensation information from text or structured fields.
    
    Extracts:
    - Min/max amounts
    - Currency
    - Converts to USD using static conversion rates
    
    Args:
        text: Free-form compensation text (e.g., "50,000 - 70,000 USD")
        fields: Structured fields dict with keys like 'min', 'max', 'currency'
    
    Returns:
        Tuple of (visible, type, min_usd, max_usd, currency, confidence)
        - visible: bool - whether compensation info was found
        - type: str - 'salary', 'hourly', 'daily', etc. (or None)
        - min_usd: float - minimum in USD
        - max_usd: float - maximum in USD
        - currency: str - original currency code
        - confidence: float - 0.0-1.0 confidence score
    """
    visible = False
    comp_type = None
    min_usd = None
    max_usd = None
    currency = None
    confidence = 0.0
    
    # Try structured fields first
    if fields and isinstance(fields, dict):
        if 'min' in fields or 'max' in fields:
            visible = True
            currency = fields.get('currency', 'USD')
            
            min_val = fields.get('min')
            max_val = fields.get('max')
            
            if min_val is not None:
                try:
                    min_amount = float(min_val)
                    rate = CURRENCY_TO_USD.get(currency, 1.0)
                    min_usd = min_amount * rate
                except (ValueError, TypeError):
                    pass
            
            if max_val is not None:
                try:
                    max_amount = float(max_val)
                    rate = CURRENCY_TO_USD.get(currency, 1.0)
                    max_usd = max_amount * rate
                except (ValueError, TypeError):
                    pass
            
            comp_type = fields.get('type', 'salary')
            confidence = 0.9
    
    # Try text parsing
    elif text and isinstance(text, str):
        # Look for currency symbols or codes
        currency_patterns = [
            (r'\$', 'USD'),
            (r'€', 'EUR'),
            (r'£', 'GBP'),
            (r'₹', 'INR'),
            (r'\b(USD|EUR|GBP|INR|CHF|KES|ZAR|CAD|AUD)\b', None),  # Will use matched group
        ]
        
        for pattern, curr in currency_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                if curr:
                    currency = curr
                else:
                    currency = match.group(1).upper()
                break
        
        if not currency:
            currency = 'USD'  # Default
        
        # Look for amounts (with optional commas)
        amount_pattern = r'([\d,]+(?:\.\d{2})?)'
        amounts = re.findall(amount_pattern, text)
        
        if amounts:
            visible = True
            cleaned_amounts = [float(a.replace(',', '')) for a in amounts[:2]]  # Take first 2
            
            rate = CURRENCY_TO_USD.get(currency, 1.0)
            
            if len(cleaned_amounts) >= 2:
                min_usd = min(cleaned_amounts) * rate
                max_usd = max(cleaned_amounts) * rate
            elif len(cleaned_amounts) == 1:
                min_usd = cleaned_amounts[0] * rate
                max_usd = cleaned_amounts[0] * rate
            
            # Detect type
            if re.search(r'\b(hour|hourly|hr)\b', text, re.IGNORECASE):
                comp_type = 'hourly'
            elif re.search(r'\b(day|daily)\b', text, re.IGNORECASE):
                comp_type = 'daily'
            elif re.search(r'\b(month|monthly)\b', text, re.IGNORECASE):
                comp_type = 'monthly'
            else:
                comp_type = 'salary'
            
            confidence = 0.7  # Medium confidence from text parsing
    
    return (visible, comp_type, min_usd, max_usd, currency, confidence)


def capture_unknowns(
    raw_data: Dict[str, Any],
    normalized_data: Dict[str, Any],
    field_mappings: Dict[str, str]
) -> List[Dict[str, str]]:
    """
    Capture unknown values that were dropped during normalization.
    
    Args:
        raw_data: Original raw data
        normalized_data: Normalized data
        field_mappings: Map of raw field name -> normalized field name
    
    Returns:
        List of {field, value} dicts for unknown values
    """
    unknowns = []
    
    for raw_field, norm_field in field_mappings.items():
        if raw_field not in raw_data:
            continue
        
        raw_value = raw_data[raw_field]
        norm_value = normalized_data.get(norm_field)
        
        # For list fields, find dropped values
        if isinstance(raw_value, list) and isinstance(norm_value, list):
            raw_set = {str(v).strip().lower() for v in raw_value if v}
            norm_set = {str(v).strip().lower() for v in norm_value if v}
            dropped = raw_set - norm_set
            
            for value in dropped:
                unknowns.append({'field': norm_field, 'value': value})
        
        # For scalar fields, check if value was dropped
        elif raw_value and not norm_value:
            unknowns.append({'field': norm_field, 'value': str(raw_value)})
    
    return unknowns
