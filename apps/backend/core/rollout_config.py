"""
Rollout configuration for new pipeline extractor.

Controls which domains use the new extractor and rollout percentage.
"""

import os
import logging
from typing import List, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class RolloutConfig:
    """Manages rollout configuration for new extractor."""
    
    def __init__(self):
        self.use_new_extractor = os.getenv('EXTRACTION_USE_NEW_EXTRACTOR', 'false').lower() == 'true'
        self.rollout_percent = int(os.getenv('EXTRACTION_ROLLOUT_PERCENT', '0'))
        self.shadow_mode = os.getenv('EXTRACTION_SHADOW_MODE', 'true').lower() == 'true'
        self.domain_allowlist = self._parse_domain_allowlist()
        self.smoke_limit = int(os.getenv('EXTRACTION_SMOKE_LIMIT', '50'))
        
        logger.info(
            f"RolloutConfig: use_new={self.use_new_extractor}, "
            f"rollout={self.rollout_percent}%, shadow={self.shadow_mode}, "
            f"domains={len(self.domain_allowlist)}, smoke_limit={self.smoke_limit}"
        )
    
    def _parse_domain_allowlist(self) -> List[str]:
        """Parse domain allowlist from environment variable."""
        allowlist_str = os.getenv('EXTRACTION_DOMAIN_ALLOWLIST', '')
        if not allowlist_str:
            return []
        
        # Parse comma-separated list
        domains = [d.strip().lower() for d in allowlist_str.split(',') if d.strip()]
        # Normalize: remove protocol, www, trailing slashes
        normalized = []
        for domain in domains:
            # Remove http://, https://
            domain = domain.replace('http://', '').replace('https://', '')
            # Remove www.
            if domain.startswith('www.'):
                domain = domain[4:]
            # Remove trailing slashes and paths
            domain = domain.split('/')[0]
            normalized.append(domain)
        
        return normalized
    
    def should_use_new_extractor(self, url: str) -> bool:
        """
        Determine if new extractor should be used for this URL.
        
        Args:
            url: URL to check
        
        Returns:
            True if new extractor should be used
        """
        if not self.use_new_extractor:
            return False
        
        # Check domain allowlist
        if self.domain_allowlist:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            # Remove www. prefix for comparison
            if domain.startswith('www.'):
                domain = domain[4:]
            
            if domain not in self.domain_allowlist:
                return False
        
        # Check rollout percentage (simple hash-based selection)
        if self.rollout_percent < 100:
            # Use hash of URL to deterministically select
            import hashlib
            url_hash = int(hashlib.md5(url.encode()).hexdigest(), 16)
            selected = (url_hash % 100) < self.rollout_percent
            if not selected:
                return False
        
        return True
    
    def is_shadow_mode(self) -> bool:
        """Check if shadow mode is enabled."""
        return self.shadow_mode


# Singleton instance
_rollout_config: Optional[RolloutConfig] = None


def get_rollout_config() -> RolloutConfig:
    """Get singleton rollout config instance."""
    global _rollout_config
    if _rollout_config is None:
        _rollout_config = RolloutConfig()
    return _rollout_config

