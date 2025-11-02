import os
from typing import Optional


class Capabilities:
    @staticmethod
    def is_db_enabled() -> bool:
        return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_ANON_KEY"))

    @staticmethod
    def is_search_enabled() -> bool:
        enabled = os.getenv("AIDJOBS_ENABLE_SEARCH", "true").lower() == "true"
        has_config = bool(os.getenv("MEILI_HOST") and os.getenv("MEILI_MASTER_KEY"))
        return enabled and has_config

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

    @classmethod
    def get_status(cls) -> dict:
        db = cls.is_db_enabled()
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
