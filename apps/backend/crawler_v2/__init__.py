"""
Simple crawler system v2 - rebuilt from scratch.

Clean, focused, easy to understand and debug.
"""

from .simple_crawler import SimpleCrawler
from .rss_crawler import SimpleRSSCrawler
from .api_crawler import SimpleAPICrawler

__all__ = ['SimpleCrawler', 'SimpleRSSCrawler', 'SimpleAPICrawler']

