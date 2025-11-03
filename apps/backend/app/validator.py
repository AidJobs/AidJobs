"""
Data validation module for AidJobs.

Validates job payloads against lookup tables to ensure data integrity.
"""

from typing import Optional, List, Dict, Any
import psycopg2
from app.db_config import db_config
import logging

logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """Raised when job data validation fails."""
    pass


class Validator:
    """
    Validates job data fields against lookup tables.
    
    Checks that:
    - country_iso exists in countries table
    - level_norm exists in levels table
    - international_eligible is a boolean
    - mission_tags all exist in tags table
    """
    
    def __init__(self):
        """Initialize validator with cached lookup table data."""
        self._valid_countries: Optional[set] = None
        self._valid_levels: Optional[set] = None
        self._valid_tags: Optional[set] = None
    
    def _load_valid_countries(self) -> set:
        """Load valid country codes from database."""
        if self._valid_countries is not None:
            return self._valid_countries
        
        conn_params = db_config.get_connection_params()
        if not conn_params:
            logger.warning("No database connection available for validation")
            return set()
        
        try:
            conn = psycopg2.connect(**conn_params, connect_timeout=2)
            cursor = conn.cursor()
            cursor.execute("SELECT code_iso2 FROM countries")
            self._valid_countries = {row[0] for row in cursor.fetchall()}
            cursor.close()
            conn.close()
            return self._valid_countries
        except Exception as e:
            logger.error(f"Failed to load valid countries: {e}")
            return set()
    
    def _load_valid_levels(self) -> set:
        """Load valid level keys from database."""
        if self._valid_levels is not None:
            return self._valid_levels
        
        conn_params = db_config.get_connection_params()
        if not conn_params:
            logger.warning("No database connection available for validation")
            return set()
        
        try:
            conn = psycopg2.connect(**conn_params, connect_timeout=2)
            cursor = conn.cursor()
            cursor.execute("SELECT key FROM levels")
            self._valid_levels = {row[0] for row in cursor.fetchall()}
            cursor.close()
            conn.close()
            return self._valid_levels
        except Exception as e:
            logger.error(f"Failed to load valid levels: {e}")
            return set()
    
    def _load_valid_tags(self) -> set:
        """Load valid tag keys from database."""
        if self._valid_tags is not None:
            return self._valid_tags
        
        conn_params = db_config.get_connection_params()
        if not conn_params:
            logger.warning("No database connection available for validation")
            return set()
        
        try:
            conn = psycopg2.connect(**conn_params, connect_timeout=2)
            cursor = conn.cursor()
            cursor.execute("SELECT key FROM tags")
            self._valid_tags = {row[0] for row in cursor.fetchall()}
            cursor.close()
            conn.close()
            return self._valid_tags
        except Exception as e:
            logger.error(f"Failed to load valid tags: {e}")
            return set()
    
    def validate_country(self, country_iso: Optional[str]) -> bool:
        """
        Validate that country_iso exists in countries table.
        
        Args:
            country_iso: ISO2 country code (e.g., "IN", "KE")
        
        Returns:
            True if valid, False otherwise
        """
        if not country_iso:
            return True
        
        valid_countries = self._load_valid_countries()
        return country_iso in valid_countries
    
    def validate_level(self, level_norm: Optional[str]) -> bool:
        """
        Validate that level_norm exists in levels table.
        
        Args:
            level_norm: Job level (e.g., "Mid", "Senior")
        
        Returns:
            True if valid, False otherwise
        """
        if not level_norm:
            return True
        
        valid_levels = self._load_valid_levels()
        return level_norm in valid_levels
    
    def validate_international_eligible(self, international_eligible: Any) -> bool:
        """
        Validate that international_eligible is a boolean.
        
        Args:
            international_eligible: Boolean or None
        
        Returns:
            True if valid (bool or None), False otherwise
        """
        return international_eligible is None or isinstance(international_eligible, bool)
    
    def validate_tags(self, mission_tags: Optional[List[str]]) -> bool:
        """
        Validate that all mission_tags exist in tags table.
        
        Args:
            mission_tags: List of tag keys (e.g., ["health", "wash"])
        
        Returns:
            True if all tags are valid, False otherwise
        """
        if not mission_tags:
            return True
        
        valid_tags = self._load_valid_tags()
        
        for tag in mission_tags:
            if tag not in valid_tags:
                return False
        
        return True
    
    def validate_job(self, job_data: dict) -> Dict[str, Any]:
        """
        Validate job payload against lookup tables.
        
        Args:
            job_data: Job data dictionary
        
        Returns:
            Dictionary with validation results:
            {
                "valid": bool,
                "errors": List[str],
                "warnings": List[str]
            }
        
        Example:
            >>> validator = Validator()
            >>> result = validator.validate_job({"country_iso": "XX", "level_norm": "Mid"})
            >>> result["valid"]
            False
            >>> result["errors"]
            ["Invalid country_iso: XX"]
        """
        errors = []
        warnings = []
        
        country_iso = job_data.get('country_iso')
        if country_iso and not self.validate_country(country_iso):
            errors.append(f"Invalid country_iso: {country_iso}")
        
        level_norm = job_data.get('level_norm')
        if level_norm and not self.validate_level(level_norm):
            errors.append(f"Invalid level_norm: {level_norm}")
        
        international_eligible = job_data.get('international_eligible')
        if not self.validate_international_eligible(international_eligible):
            errors.append(f"Invalid international_eligible: {international_eligible} (must be boolean)")
        
        mission_tags = job_data.get('mission_tags')
        if mission_tags and not self.validate_tags(mission_tags):
            valid_tags = self._load_valid_tags()
            invalid_tags = [tag for tag in mission_tags if tag not in valid_tags]
            errors.append(f"Invalid mission_tags: {invalid_tags}")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
    def clear_cache(self):
        """Clear cached lookup data (for testing or when lookup tables change)."""
        self._valid_countries = None
        self._valid_levels = None
        self._valid_tags = None


validator = Validator()
