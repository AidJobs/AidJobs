"""
IP-based rate limiting for public endpoints.
"""
import os
from slowapi import Limiter
from slowapi.util import get_remote_address

# Rate limit: 60 requests per minute in dev, 120 in production
RATE_LIMIT_SEARCH = os.getenv("RATE_LIMIT_SEARCH", "60/minute" if os.getenv("AIDJOBS_ENV") == "dev" else "120/minute")
RATE_LIMIT_SUBMIT = os.getenv("RATE_LIMIT_SUBMIT", "10/minute" if os.getenv("AIDJOBS_ENV") == "dev" else "20/minute")

limiter = Limiter(key_func=get_remote_address)
