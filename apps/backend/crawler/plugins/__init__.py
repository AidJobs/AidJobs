"""
Site readers used by the crawler.

Only the UNICEF reader is used; the crawler imports it directly.
"""

from .base import ExtractionPlugin, PluginResult

__all__ = [
    'ExtractionPlugin',
    'PluginResult',
]
