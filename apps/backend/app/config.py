import os
from typing import Optional

from app.db_config import db_config

try:
    import psycopg2
except ImportError:
    psycopg2 = None


class Capabilities:
    @staticmethod
    def is_db_enabled() -> bool:
        """Check if database is available via Supabase"""
        return db_config.is_db_enabled
    
    @staticmethod
    def check_db_connection() -> bool:
        """Verify database connection with a trivial query"""
        if not Capabilities.is_db_enabled():
            return False
        
        if not psycopg2:
            return False
        
        conn_params = db_config.get_connection_params()
        if not conn_params:
            return False
        
        try:
            # Use very short timeout for health checks (1 second max)
            conn = psycopg2.connect(**conn_params, connect_timeout=1)
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            cursor.close()
            conn.close()
            return True
        except Exception:
            return False

    @staticmethod
    def is_search_enabled() -> bool:
        enabled = os.getenv("AIDJOBS_ENABLE_SEARCH", "true").lower() == "true"
        if not enabled:
            return False
        
        # Check for both new and legacy env var formats
        has_new_config = bool(
            os.getenv("MEILISEARCH_URL") and os.getenv("MEILISEARCH_KEY")
        )
        has_legacy_config = bool(
            os.getenv("MEILI_HOST") and (
                os.getenv("MEILI_MASTER_KEY") or os.getenv("MEILI_API_KEY")
            )
        )
        
        return has_new_config or has_legacy_config

    @staticmethod
    def is_ai_enabled() -> bool:
        return bool(os.getenv("OPENROUTER_API_KEY"))

    @staticmethod
    def is_payments_enabled() -> bool:
        enabled = os.getenv("AIDJOBS_ENABLE_PAYMENTS", "false").lower() == "true"
        provider = os.getenv("PAYMENT_PROVIDER", "auto")
        
        if provider == "paypal":
            has_config = bool(
                os.getenv("PAYPAL_CLIENT_ID") and os.getenv("PAYPAL_CLIENT_SECRET")
            )
        elif provider == "razorpay":
            has_config = bool(
                os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET")
            )
        elif provider == "auto":
            has_config = bool(
                (os.getenv("PAYPAL_CLIENT_ID") and os.getenv("PAYPAL_CLIENT_SECRET"))
                or (os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET"))
            )
        else:
            has_config = False
        
        return enabled and has_config

    @staticmethod
    def is_cv_enabled() -> bool:
        enabled = os.getenv("AIDJOBS_ENABLE_CV", "false").lower() == "true"
        has_config = bool(
            os.getenv("CV_MAX_FILE_MB") and os.getenv("CV_TRANSIENT_HOURS")
        )
        return enabled and has_config

    @staticmethod
    def is_findearn_enabled() -> bool:
        enabled = os.getenv("AIDJOBS_ENABLE_FINDEARN", "true").lower() == "true"
        return enabled

    @classmethod
    def get_status(cls) -> dict:
        # db=true only if SUPABASE_URL is configured and trivial query succeeds
        db = cls.check_db_connection()
        search = cls.is_search_enabled()
        ai = cls.is_ai_enabled()
        payments = cls.is_payments_enabled()
        
        if db and search and ai and payments:
            status = "green"
        else:
            status = "amber"
        
        return {
            "status": status,
            "components": {
                "db": db,
                "search": search,
                "ai": ai,
                "payments": payments,
            },
        }

    @classmethod
    def get_capabilities(cls) -> dict:
        return {
            "search": cls.is_search_enabled(),
            "cv": cls.is_cv_enabled(),
            "payments": cls.is_payments_enabled(),
            "findearn": cls.is_findearn_enabled(),
        }


def get_env_presence() -> dict:
    required_vars = [
        "AIDJOBS_ENV",
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_KEY",
        "MEILI_HOST",
        "MEILI_MASTER_KEY",
        "MEILI_JOBS_INDEX",
        "OPENROUTER_API_KEY",
        "OPENROUTER_MODEL",
        "CV_MAX_FILE_MB",
        "CV_TRANSIENT_HOURS",
        "PAYMENT_PROVIDER",
        "PAYPAL_CLIENT_ID",
        "PAYPAL_CLIENT_SECRET",
        "PAYPAL_MODE",
        "RAZORPAY_KEY_ID",
        "RAZORPAY_KEY_SECRET",
        "ADMIN_PASSWORD",
        "AIDJOBS_ENABLE_SEARCH",
        "AIDJOBS_ENABLE_CV",
        "AIDJOBS_ENABLE_FINDEARN",
        "AIDJOBS_ENABLE_PAYMENTS",
        "NEXT_PUBLIC_AIDJOBS_ENV",
        "NEXT_PUBLIC_MEILI_FALLBACK",
    ]
    
    return {var: bool(os.getenv(var)) for var in required_vars}
