"""
Database configuration module.
Prefers Supabase when SUPABASE_URL is present.
DATABASE_URL is ignored for application queries by design.
"""

import os
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class DBConfig:
    """Database configuration with Supabase-first logic"""
    
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY")
        self.supabase_db_url = os.getenv("SUPABASE_DB_URL")  # For direct SQL migrations only
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
        
        # Set DB driver
        if self.supabase_url:
            self.db_driver = "supabase"
        else:
            self.db_driver = None
    
    @property
    def is_db_enabled(self) -> bool:
        """Check if database is available via Supabase"""
        return bool(self.supabase_url and self.supabase_service_key)
    
    def get_connection_params(self) -> dict | None:
        """
        Get database connection parameters for Supabase.
        Returns dict with host, port, database, user, password.
        """
        if not self.is_db_enabled:
            return None
        
        # If SUPABASE_DB_URL is provided, parse it
        if self.supabase_db_url:
            parsed = urlparse(self.supabase_db_url)
            return {
                "host": parsed.hostname,
                "port": parsed.port or 5432,
                "database": parsed.path.lstrip('/') or 'postgres',
                "user": parsed.username or 'postgres',
                "password": parsed.password or self.supabase_service_key,
            }
        
        # Otherwise, parse SUPABASE_URL
        parsed = urlparse(self.supabase_url)
        
        if not parsed.hostname:
            return None
        
        return {
            "host": parsed.hostname,
            "port": parsed.port or 5432,
            "database": parsed.path.lstrip('/') or 'postgres',
            "user": parsed.username or 'postgres',
            "password": parsed.password or self.supabase_service_key,
        }
    
    def get_migration_connection_params(self) -> dict | None:
        """Get database connection parameters for migrations (direct SQL)"""
        return self.get_connection_params()


# Global instance
db_config = DBConfig()
