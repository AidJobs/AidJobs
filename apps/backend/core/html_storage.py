"""
HTML Storage Module
Stores raw HTML content for debugging and re-extraction.

Supports two backends:
1. Supabase Storage (for production/cloud)
2. Filesystem (for local development)
"""

import os
import logging
from typing import Optional, Tuple
from pathlib import Path
from datetime import datetime
import hashlib
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class HTMLStorage:
    """Storage backend for raw HTML content"""
    
    def __init__(self, storage_type: str = "filesystem", storage_path: Optional[str] = None):
        """
        Initialize HTML storage.
        
        Args:
            storage_type: "supabase" or "filesystem"
            storage_path: For filesystem, the base directory. For Supabase, the bucket name.
        """
        self.storage_type = storage_type.lower()
        self.storage_path = storage_path or "raw-html"
        
        if self.storage_type == "filesystem":
            # Create storage directory if it doesn't exist
            self.base_path = Path(self.storage_path)
            self.base_path.mkdir(parents=True, exist_ok=True)
            logger.info(f"HTML storage initialized: filesystem at {self.base_path}")
        elif self.storage_type == "supabase":
            try:
                from supabase import create_client, Client
                supabase_url = os.getenv("SUPABASE_URL")
                supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
                
                if not supabase_url or not supabase_key:
                    logger.warning("Supabase credentials not found, falling back to filesystem")
                    self.storage_type = "filesystem"
                    self.base_path = Path("raw-html")
                    self.base_path.mkdir(parents=True, exist_ok=True)
                else:
                    self.supabase: Client = create_client(supabase_url, supabase_key)
                    self.bucket_name = self.storage_path or "raw-html"
                    logger.info(f"HTML storage initialized: Supabase bucket '{self.bucket_name}'")
            except ImportError:
                logger.warning("supabase-py not installed, falling back to filesystem")
                self.storage_type = "filesystem"
                self.base_path = Path("raw-html")
                self.base_path.mkdir(parents=True, exist_ok=True)
        else:
            raise ValueError(f"Unknown storage type: {storage_type}")
    
    def _generate_path(self, url: str, source_id: Optional[str] = None) -> str:
        """
        Generate a storage path for a URL.
        
        Args:
            url: The URL to store
            source_id: Optional source ID for organization
            
        Returns:
            Storage path (relative to base)
        """
        # Parse URL to get domain
        parsed = urlparse(url)
        domain = parsed.netloc.replace('.', '_').replace(':', '_')
        
        # Generate filename from URL hash
        url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
        timestamp = datetime.utcnow().strftime("%Y%m%d")
        
        # Create path: domain/YYYYMMDD/hash.html
        if source_id:
            path = f"{domain}/{source_id}/{timestamp}/{url_hash}.html"
        else:
            path = f"{domain}/{timestamp}/{url_hash}.html"
        
        return path
    
    def store(self, url: str, html_content: str, source_id: Optional[str] = None) -> Optional[str]:
        """
        Store HTML content.
        
        Args:
            url: The URL that was fetched
            html_content: The HTML content to store
            source_id: Optional source ID for organization
            
        Returns:
            Storage path if successful, None otherwise
        """
        try:
            storage_path = self._generate_path(url, source_id)
            
            if self.storage_type == "filesystem":
                # Store in filesystem
                file_path = self.base_path / storage_path
                file_path.parent.mkdir(parents=True, exist_ok=True)
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(html_content)
                
                logger.debug(f"Stored HTML to filesystem: {file_path}")
                return str(storage_path)
            
            elif self.storage_type == "supabase":
                # Store in Supabase Storage
                try:
                    # Upload to Supabase Storage
                    response = self.supabase.storage.from_(self.bucket_name).upload(
                        storage_path,
                        html_content.encode('utf-8'),
                        file_options={"content-type": "text/html"}
                    )
                    
                    if response:
                        logger.debug(f"Stored HTML to Supabase: {storage_path}")
                        return storage_path
                    else:
                        logger.warning(f"Failed to store HTML to Supabase: {storage_path}")
                        return None
                except Exception as e:
                    logger.error(f"Error storing HTML to Supabase: {e}")
                    return None
            
        except Exception as e:
            logger.error(f"Error storing HTML: {e}")
            return None
    
    def retrieve(self, storage_path: str) -> Optional[str]:
        """
        Retrieve HTML content from storage.
        
        Args:
            storage_path: The storage path returned by store()
            
        Returns:
            HTML content if found, None otherwise
        """
        try:
            if self.storage_type == "filesystem":
                file_path = self.base_path / storage_path
                if file_path.exists():
                    with open(file_path, 'r', encoding='utf-8') as f:
                        return f.read()
                else:
                    logger.warning(f"HTML file not found: {file_path}")
                    return None
            
            elif self.storage_type == "supabase":
                try:
                    response = self.supabase.storage.from_(self.bucket_name).download(storage_path)
                    if response:
                        return response.decode('utf-8')
                    else:
                        logger.warning(f"HTML not found in Supabase: {storage_path}")
                        return None
                except Exception as e:
                    logger.error(f"Error retrieving HTML from Supabase: {e}")
                    return None
        
        except Exception as e:
            logger.error(f"Error retrieving HTML: {e}")
            return None
    
    def delete(self, storage_path: str) -> bool:
        """
        Delete HTML content from storage.
        
        Args:
            storage_path: The storage path to delete
            
        Returns:
            True if deleted, False otherwise
        """
        try:
            if self.storage_type == "filesystem":
                file_path = self.base_path / storage_path
                if file_path.exists():
                    file_path.unlink()
                    logger.debug(f"Deleted HTML from filesystem: {file_path}")
                    return True
                return False
            
            elif self.storage_type == "supabase":
                try:
                    response = self.supabase.storage.from_(self.bucket_name).remove([storage_path])
                    logger.debug(f"Deleted HTML from Supabase: {storage_path}")
                    return True
                except Exception as e:
                    logger.error(f"Error deleting HTML from Supabase: {e}")
                    return False
        
        except Exception as e:
            logger.error(f"Error deleting HTML: {e}")
            return False


# Global instance (lazy initialization)
_html_storage: Optional[HTMLStorage] = None


def get_html_storage() -> HTMLStorage:
    """Get or create the global HTML storage instance"""
    global _html_storage
    
    if _html_storage is None:
        storage_type = os.getenv("HTML_STORAGE_TYPE", "filesystem").lower()
        storage_path = os.getenv("HTML_STORAGE_PATH", "raw-html")
        _html_storage = HTMLStorage(storage_type=storage_type, storage_path=storage_path)
    
    return _html_storage

