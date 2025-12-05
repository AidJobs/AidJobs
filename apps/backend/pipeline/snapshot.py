"""
Snapshot manager.

Saves raw HTML and extraction metadata for auditing and debugging.
"""

import os
import json
import hashlib
import logging
from pathlib import Path
from typing import Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class SnapshotManager:
    """Manages snapshots of extracted pages."""
    
    def __init__(self, base_path: Optional[str] = None):
        self.base_path = Path(base_path or os.getenv('SNAPSHOT_PATH', 'snapshots'))
        self.base_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Snapshot manager initialized: {self.base_path}")
    
    async def save_snapshot(self, url: str, html: str, extraction_result: Dict):
        """Save HTML snapshot and metadata."""
        try:
            # Get domain for organization
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.netloc.replace('www.', '')
            
            # Create domain directory
            domain_dir = self.base_path / domain
            domain_dir.mkdir(parents=True, exist_ok=True)
            
            # Generate filename from URL hash
            url_hash = hashlib.sha256(url.encode()).hexdigest()
            
            # Save HTML
            html_path = domain_dir / f"{url_hash}.html"
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(html)
            
            # Save metadata
            metadata = {
                "url": url,
                "domain": domain,
                "snapshot_at": datetime.utcnow().isoformat() + "Z",
                "html_size": len(html),
                "extraction_result": extraction_result,
                "pipeline_version": extraction_result.get('pipeline_version', '1.0.0')
            }
            
            meta_path = domain_dir / f"{url_hash}.meta.json"
            with open(meta_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)
            
            logger.debug(f"Saved snapshot: {html_path}")
        except Exception as e:
            logger.error(f"Failed to save snapshot: {e}")
    
    def retrieve_snapshot(self, url: str) -> Optional[Dict]:
        """Retrieve snapshot for a URL."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.netloc.replace('www.', '')
            url_hash = hashlib.sha256(url.encode()).hexdigest()
            
            meta_path = self.base_path / domain / f"{url_hash}.meta.json"
            if meta_path.exists():
                with open(meta_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Failed to retrieve snapshot: {e}")
        
        return None

