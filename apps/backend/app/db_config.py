"""
Database configuration module.
Prefers Supabase when SUPABASE_URL is present.
DATABASE_URL is ignored for application queries by design.
"""

import os
import logging
from urllib.parse import urlparse, unquote

logger = logging.getLogger(__name__)


class DBConfig:
    """Database configuration with Supabase-first logic"""
    
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")  # REST API endpoint
        self.supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY")
        self.supabase_db_url = os.getenv("SUPABASE_DB_URL")  # Direct PostgreSQL connection string
        self.database_url = os.getenv("DATABASE_URL")
        
        # Log if DATABASE_URL is set but will be ignored
        if self.database_url and self.supabase_url:
            logger.info(
                "DATABASE_URL is set but ignored by design. Using Supabase for application queries."
            )
        elif self.database_url and not self.supabase_url:
            logger.warning(
                "DATABASE_URL is set but SUPABASE_URL is not configured. "
                "Database queries will not work. Please configure SUPABASE_URL and SUPABASE_SERVICE_KEY."
            )
        
        # Warn if SUPABASE_URL is set but SUPABASE_DB_URL is missing
        if self.supabase_url and not self.supabase_db_url:
            logger.warning(
                "SUPABASE_URL is set but SUPABASE_DB_URL is missing. "
                "Direct database queries will not work. "
                "Please provide SUPABASE_DB_URL for PostgreSQL connection pooler access."
            )
        
        # Set DB driver
        if self.supabase_db_url or (self.supabase_url and self.supabase_service_key):
            self.db_driver = "supabase"
        else:
            self.db_driver = None
    
    @property
    def is_db_enabled(self) -> bool:
        """Check if database is available via Supabase (requires SUPABASE_DB_URL for direct connections)"""
        return bool(self.supabase_db_url)
    
    def get_connection_params(self) -> dict | None:
        """
        Get database connection parameters for Supabase.
        Returns dict with host, port, database, user, password.
        Requires SUPABASE_DB_URL (PostgreSQL connection string).
        """
        if not self.supabase_db_url:
            return None
        
        # Clean up the URL by removing any square brackets around hostname
        # This handles URLs like: postgresql://user:pass@[hostname]:port/db
        cleaned_url = self.supabase_db_url.replace('[', '').replace(']', '')
        
        # Parse the database connection URL
        try:
            parsed = urlparse(cleaned_url)
        except Exception as e:
            logger.error(f"Failed to parse SUPABASE_DB_URL: {e}")
            return None
        
        if not parsed.hostname:
            return None
        
        # Extract all parameters from the parsed URL
        params = {
            "host": parsed.hostname,
            "port": parsed.port or 5432,
            "database": parsed.path.lstrip('/') or 'postgres',
            "user": parsed.username or 'postgres',
        }
        
        # Add password if present (URL-decode it to handle special characters)
        if parsed.password:
            params["password"] = unquote(parsed.password)
        
        return params
    
    def get_migration_connection_params(self) -> dict | None:
        """Get database connection parameters for migrations (direct SQL)"""
        return self.get_connection_params()


# Global instance
db_config = DBConfig()
