"""
Base plugin interface for job extraction.
"""
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Optional
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class PluginResult:
    """Result from plugin extraction"""
    def __init__(
        self,
        jobs: List[Dict],
        confidence: float = 1.0,
        message: Optional[str] = None,
        metadata: Optional[Dict] = None
    ):
        self.jobs = jobs
        self.confidence = confidence  # 0.0 to 1.0
        self.message = message
        self.metadata = metadata or {}
    
    def is_success(self) -> bool:
        """Check if extraction was successful"""
        return len(self.jobs) > 0
    
    def __repr__(self):
        return f"PluginResult(jobs={len(self.jobs)}, confidence={self.confidence:.2f})"


class ExtractionPlugin(ABC):
    """
    Base class for extraction plugins.
    
    Plugins provide source-specific extraction logic for job listings.
    Each plugin should:
    1. Determine if it can handle a given URL/HTML
    2. Extract job listings from HTML
    3. Optionally normalize job data
    """
    
    def __init__(self, name: str, priority: int = 50):
        """
        Initialize plugin.
        
        Args:
            name: Plugin name (e.g., 'undp', 'unesco', 'generic')
            priority: Priority (higher = tried first, default 50)
        """
        self.name = name
        self.priority = priority
        self.logger = logging.getLogger(f"{__name__}.{name}")
    
    @abstractmethod
    def can_handle(self, url: str, html: str, config: Optional[Dict] = None) -> bool:
        """
        Check if this plugin can handle the given URL/HTML.
        
        Args:
            url: Source URL
            html: HTML content
            config: Optional plugin configuration from database
        
        Returns:
            True if this plugin should handle this source
        """
        pass
    
    @abstractmethod
    def extract(
        self,
        html: str,
        base_url: str,
        config: Optional[Dict] = None
    ) -> PluginResult:
        """
        Extract job listings from HTML.
        
        Args:
            html: HTML content
            base_url: Base URL for resolving relative links
            config: Optional plugin configuration from database
        
        Returns:
            PluginResult with extracted jobs
        """
        pass
    
    def normalize(self, job: Dict, org_name: Optional[str] = None) -> Dict:
        """
        Normalize a job dict (optional override).
        
        By default, returns job as-is. Plugins can override to provide
        source-specific normalization.
        
        Args:
            job: Raw job dict from extract()
            org_name: Organization name
        
        Returns:
            Normalized job dict
        """
        return job
    
    def get_soup(self, html: str) -> BeautifulSoup:
        """Helper to create BeautifulSoup instance"""
        return BeautifulSoup(html, 'lxml')
    
    def __repr__(self):
        return f"<{self.__class__.__name__}(name={self.name}, priority={self.priority})>"

