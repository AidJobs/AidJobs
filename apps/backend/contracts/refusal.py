"""Refusals and bot challenges, read from a response. The crawler and the employer survey
(tools/survey/confirm.py) share the patterns. A challenge is recorded, never solved or bypassed.
"""
from __future__ import annotations

import re

# Pages that are a challenge, not the page asked for.
CHALLENGES = [
    ("Cloudflare challenge", re.compile(r"<title>\s*(?:just a moment|attention required)"
                                        r"|cf_chl_opt|window\._cf_chl", re.IGNORECASE)),
    ("Akamai", re.compile(r"<title>\s*access denied</title>.{0,600}reference #",
                          re.IGNORECASE | re.DOTALL)),
    ("Imperva", re.compile(r"_incapsula_resource", re.IGNORECASE)),
    ("DataDome", re.compile(r"captcha-delivery\.com", re.IGNORECASE)),
    ("PerimeterX", re.compile(r"px-captcha", re.IGNORECASE)),
    ("AWS WAF", re.compile(r"awswaf\.com|aws-waf-token", re.IGNORECASE)),
]
# Normal pages can carry these (a form's reCAPTCHA, a protection service's script), so they
# count only on a refusal (401, 403, 429).
REFUSAL_HINTS = [("captcha", re.compile(r"captcha", re.IGNORECASE)),
                 ("Cloudflare", re.compile(r"cloudflare", re.IGNORECASE))]
# On an answer of 200 only these count: a normal page can load a protection service's script.
_STRONG = frozenset({"Cloudflare challenge", "Akamai"})
_REFUSED_STATUSES = frozenset({401, 403, 429})
_HEAD_BYTES = 30000


def _challenge(headers: dict, body: str, strong_only: bool) -> str:
    if headers.get("cf-mitigated", "").strip().lower() == "challenge":
        return "Cloudflare challenge"
    if headers.get("x-amzn-waf-action", "").strip():
        return "AWS WAF challenge"
    head = body[:_HEAD_BYTES]
    for name, pattern in CHALLENGES:
        if strong_only and name not in _STRONG:
            continue
        if pattern.search(head):
            return "AWS WAF challenge" if name == "AWS WAF" else name
    return ""


def refusal(status: int, headers: dict, body: str) -> str:
    """Why an answer is a refusal, in fixed words ('' when it is not one): a 401, 403 or 429;
    any 2xx other than 200; or a challenge page at any status. Names only, never a header's or
    the page's own text."""
    lowered = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
    challenge = _challenge(lowered, body or "", strong_only=status == 200)
    if challenge:
        return f"HTTP {status} ({challenge})"
    if status in _REFUSED_STATUSES or (200 < status < 300):
        return f"HTTP {status}"
    return ""
