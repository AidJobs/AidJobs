"""
Domain-specific configuration loader.
Reads from config/domains.yaml and provides per-domain overrides.
"""
import os
import yaml
import logging
from pathlib import Path
from typing import Dict, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Default configuration
DEFAULT_CONFIG = {
    'max_links_per_page': 500,
    'use_playwright': False,
    'smoke_limit': None  # No limit by default
}

# Cache for loaded config
_config_cache: Optional[Dict] = None


def load_domain_config() -> Dict:
    """Load domain configuration from YAML file."""
    global _config_cache
    
    if _config_cache is not None:
        return _config_cache
    
    config_path = Path(__file__).parent.parent / 'config' / 'domains.yaml'
    
    if not config_path.exists():
        logger.warning(f"Domain config file not found: {config_path}. Using defaults.")
        _config_cache = {}
        return _config_cache
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            _config_cache = yaml.safe_load(f) or {}
        logger.info(f"Loaded domain config from {config_path}")
    except Exception as e:
        logger.error(f"Error loading domain config: {e}")
        _config_cache = {}
    
    return _config_cache


def get_domain_config(url: str) -> Dict:
    """
    Get configuration for a specific domain.
    Returns merged config with defaults.
    """
    config = load_domain_config()
    
    # Extract domain from URL
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.replace('www.', '')
    except Exception:
        domain = None
    
    if not domain:
        return DEFAULT_CONFIG.copy()
    
    # Find matching domain config (check both root level and 'overrides' key)
    domain_config = {}
    if 'overrides' in config and isinstance(config['overrides'], dict):
        domain_config = config['overrides'].get(domain, {})
    else:
        domain_config = config.get(domain, {})
    
    # Merge with defaults
    merged = DEFAULT_CONFIG.copy()
    merged.update(domain_config)
    
    return merged

