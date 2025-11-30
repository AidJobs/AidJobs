"""
Extraction plugin system for AidJobs.

Plugins provide source-specific extraction logic, allowing for:
- Custom HTML parsing strategies
- Source-specific normalization
- Flexible configuration per source
"""

from .base import ExtractionPlugin, PluginResult
from .registry import PluginRegistry, get_plugin_registry

__all__ = [
    'ExtractionPlugin',
    'PluginResult',
    'PluginRegistry',
    'get_plugin_registry'
]

