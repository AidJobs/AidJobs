"""
Database configuration module.
Prefers Supabase when SUPABASE_URL is present.
DATABASE_URL is ignored for application queries by design.
"""

import os
import logging
from urllib.parse import urlparse, unquote

logger = logging.getLogger(__name__)

URL_HINT = "Check the port, and percent-encode special characters in the password (/ as %2F)"


def _parse_url(url: str):
    """urlparse, refusing a URL whose password holds an unencoded /, ? or #.

    urllib then reads the start of the password as the port and the rest as the path, query or
    fragment, so the URL looks valid while the password's tail would be logged as the database.
    A query value may contain "@" (application_name=a@b); a password's tail has no "=" before it.
    A user name with "@" means the ":" before the password is missing, so it would be logged.
    """
    parsed = urlparse(url.replace('[', '').replace(']', ''))
    parsed.port
    query_tail = "@" in parsed.query and "=" not in parsed.query.split("@", 1)[0]
    user_tail = "@" in (parsed.username or "")
    if "@" in parsed.path or query_tail or "@" in parsed.fragment or user_tail:
        raise ValueError("credentials outside the user-information part")
    return parsed


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
        
        # Log the configured database URL (mask password for security)
        if self.supabase_db_url:
            # Mask password in log for security
            try:
                parsed = _parse_url(self.supabase_db_url)
                if parsed.password:
                    masked_url = self.supabase_db_url.replace(parsed.password, '***')
                else:
                    masked_url = self.supabase_db_url
                # The path is not logged: in a malformed URL it can hold the password's tail.
                logger.info(
                    "[db_config] SUPABASE_DB_URL configured: %s://%s:***@%s:%s",
                    parsed.scheme, parsed.username, parsed.hostname, parsed.port or 5432,
                )
            except Exception as e:
                # The parser's message can quote part of the password.
                logger.warning(
                    "[db_config] SUPABASE_DB_URL is set but could not be parsed (%s). %s",
                    type(e).__name__, URL_HINT,
                )
        else:
            logger.warning("[db_config] SUPABASE_DB_URL not set - database connections will fail")
        
        # Set DB driver
        if self.supabase_db_url or (self.supabase_url and self.supabase_service_key):
            self.db_driver = "supabase"
        else:
            self.db_driver = None
    
    @property
    def is_db_enabled(self) -> bool:
        """Check if database is available via Supabase (requires SUPABASE_DB_URL for direct connections)"""
        return bool(self.supabase_db_url)

    @property
    def settings_unreadable(self) -> bool:
        """SUPABASE_DB_URL is set, but no host and port can be read from it."""
        if not self.supabase_db_url:
            return False
        try:
            parsed = _parse_url(self.supabase_db_url)
        except Exception:
            return True
        return not parsed.hostname
    
    def get_connection_params(self) -> dict | None:
        """
        Get database connection parameters for Supabase.
        Returns dict with host, port, database, user, password.
        Requires SUPABASE_DB_URL (PostgreSQL connection string).
        Automatically resolves hostname to IPv4 if needed.
        """
        if not self.supabase_db_url:
            return None
        
        # Square brackets around the host are removed: postgresql://user:pass@[hostname]:port/db
        # Never let a parse error escape or be logged with its text: urllib's and libpq's
        # messages can quote part of the password, and callers once put them in responses.
        try:
            parsed = _parse_url(self.supabase_db_url)
            port = parsed.port or 5432
        except Exception as e:
            logger.error("[db_config] SUPABASE_DB_URL could not be parsed (%s). %s",
                         type(e).__name__, URL_HINT)
            return None
        
        if not parsed.hostname:
            return None
        
        # Try to resolve hostname to IPv4 (for IPv6 compatibility issues)
        hostname = parsed.hostname
        resolved_host = hostname
        
        # Only try IPv4 resolution if hostname is not already an IP address and not a pooler hostname
        # Pooler hostnames (like *.pooler.supabase.com) are already IPv4 compatible
        is_pooler = '.pooler.supabase.com' in hostname or 'pooler' in hostname.lower()
        is_ip_address = hostname.replace('.', '').isdigit()  # Simple check for IPv4
        
        if not is_ip_address and not is_pooler:
            # Try to resolve to IPv4 for direct connections
            try:
                import socket
                # Force IPv4 resolution
                addr_info = socket.getaddrinfo(
                    hostname, 
                    port, 
                    socket.AF_INET,  # Force IPv4
                    socket.SOCK_STREAM
                )
                if addr_info:
                    resolved_host = addr_info[0][4][0]  # Get IPv4 address
                    logger.info(f"[db_config] Resolved {hostname} to IPv4: {resolved_host}")
            except (socket.gaierror, ValueError, OSError) as e:
                logger.warning(
                    "[db_config] Could not resolve %s to IPv4, using original hostname (%s)",
                    hostname, type(e).__name__,
                )
                # Continue with original hostname (pooler should work anyway)
        elif is_pooler:
            logger.debug(f"[db_config] Using pooler hostname (IPv4 compatible): {hostname}")
        
        # Extract all parameters from the parsed URL
        params = {
            "host": resolved_host,  # Use resolved IPv4 address or original hostname
            "port": port,
            "database": parsed.path.lstrip('/') or 'postgres',
            "user": parsed.username or 'postgres',
        }
        
        # Add password if present (URL-decode it to handle special characters)
        if parsed.password:
            params["password"] = unquote(parsed.password)
        
        # Log the connection parameters (mask password)
        logger.info("[db_config] Database connection params: host=%s, port=%s, user=%s",
                    resolved_host, params['port'], params['user'])
        
        return params
    
    def get_migration_connection_params(self) -> dict | None:
        """Get database connection parameters for migrations (direct SQL)"""
        return self.get_connection_params()


# Global instance
db_config = DBConfig()
