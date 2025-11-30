"""
Plugin registry for managing extraction plugins.
"""
import logging
from typing import List, Dict, Optional
from .base import ExtractionPlugin, PluginResult

logger = logging.getLogger(__name__)

# Global registry instance
_registry: Optional['PluginRegistry'] = None


class PluginRegistry:
    """Registry for extraction plugins"""
    
    def __init__(self):
        self._plugins: List[ExtractionPlugin] = []
        self._plugins_by_name: Dict[str, ExtractionPlugin] = {}
    
    def register(self, plugin: ExtractionPlugin):
        """Register a plugin"""
        if plugin.name in self._plugins_by_name:
            logger.warning(f"Plugin {plugin.name} already registered, replacing")
        
        self._plugins_by_name[plugin.name] = plugin
        self._plugins.append(plugin)
        
        # Sort by priority (higher first)
        self._plugins.sort(key=lambda p: p.priority, reverse=True)
        
        logger.info(f"Registered plugin: {plugin.name} (priority={plugin.priority})")
    
    def get_plugin(self, name: str) -> Optional[ExtractionPlugin]:
        """Get plugin by name"""
        return self._plugins_by_name.get(name)
    
    def find_plugin(
        self,
        url: str,
        html: str,
        config: Optional[Dict] = None,
        preferred_plugin: Optional[str] = None
    ) -> Optional[ExtractionPlugin]:
        """
        Find the best plugin for a given URL/HTML.
        
        Args:
            url: Source URL
            html: HTML content
            config: Optional plugin configuration
            preferred_plugin: Preferred plugin name (from database)
        
        Returns:
            Best matching plugin or None
        """
        # If preferred plugin is specified, try it first
        if preferred_plugin:
            plugin = self._plugins_by_name.get(preferred_plugin)
            if plugin and plugin.can_handle(url, html, config):
                logger.debug(f"Using preferred plugin: {preferred_plugin}")
                return plugin
        
        # Try all plugins in priority order
        for plugin in self._plugins:
            if plugin.can_handle(url, html, config):
                logger.debug(f"Selected plugin: {plugin.name} for {url[:80]}")
                return plugin
        
        return None
    
    def extract(
        self,
        html: str,
        base_url: str,
        config: Optional[Dict] = None,
        preferred_plugin: Optional[str] = None
    ) -> PluginResult:
        """
        Extract jobs using the best matching plugin.
        
        Args:
            html: HTML content
            base_url: Base URL
            config: Optional plugin configuration
            preferred_plugin: Preferred plugin name
        
        Returns:
            PluginResult with extracted jobs
        """
        plugin = self.find_plugin(base_url, html, config, preferred_plugin)
        
        if not plugin:
            logger.warning(f"No plugin found for {base_url[:80]}")
            return PluginResult(
                jobs=[],
                confidence=0.0,
                message="No matching plugin found"
            )
        
        try:
            result = plugin.extract(html, base_url, config)
            logger.info(f"Plugin {plugin.name} extracted {len(result.jobs)} jobs (confidence={result.confidence:.2f})")
            return result
        except Exception as e:
            logger.error(f"Plugin {plugin.name} extraction error: {e}", exc_info=True)
            return PluginResult(
                jobs=[],
                confidence=0.0,
                message=f"Extraction error: {str(e)}"
            )
    
    def list_plugins(self) -> List[Dict]:
        """List all registered plugins"""
        return [
            {
                'name': plugin.name,
                'priority': plugin.priority,
                'class': plugin.__class__.__name__
            }
            for plugin in self._plugins
        ]


def get_plugin_registry() -> PluginRegistry:
    """Get or create the global plugin registry"""
    global _registry
    if _registry is None:
        _registry = PluginRegistry()
        # Auto-register built-in plugins
        _register_builtin_plugins(_registry)
    return _registry


def _register_builtin_plugins(registry: PluginRegistry):
    """Register all built-in plugins"""
    try:
        from .undp import UNDPPlugin
        registry.register(UNDPPlugin())
    except ImportError as e:
        logger.warning(f"Could not import UNDP plugin: {e}")
    
    try:
        from .unesco import UNESCOPlugin
        registry.register(UNESCOPlugin())
    except ImportError as e:
        logger.warning(f"Could not import UNESCO plugin: {e}")
    
    try:
        from .generic import GenericPlugin
        registry.register(GenericPlugin())
    except ImportError as e:
        logger.warning(f"Could not import Generic plugin: {e}")

