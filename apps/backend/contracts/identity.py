"""Dispatch to the two existing identity algorithms. Do not version the key."""
import hashlib
import os

from core.extraction_heuristics import get_canonical_hash, normalize_url


def algorithm_a(title: str, apply_url: str) -> str:
    """MD5 of lowercase title|apply_url, using the apply URL as given."""
    canonical_text = f"{title}|{apply_url}".lower()
    return hashlib.md5(canonical_text.encode()).hexdigest()


def algorithm_b(title: str, apply_url: str, reference: str | None = None) -> str:
    """Today's heuristics branch: normalise the URL, then get_canonical_hash."""
    normalized_url = normalize_url(apply_url)
    return get_canonical_hash(title, normalized_url, reference)


def heuristics_enabled(flag: str | None = None) -> bool:
    if flag is None:
        flag = os.getenv("EXTRACTION_GLOBAL_HEURISTICS", "true")
    return flag.lower() == "true"


def write_key(
    title: str,
    apply_url: str,
    reference: str | None = None,
    *,
    heuristics: bool | None = None,
) -> str:
    """Store the key today's write branch already stores."""
    if heuristics is None:
        heuristics = heuristics_enabled()
    if heuristics:
        return algorithm_b(title, apply_url, reference)
    return algorithm_a(title, apply_url)


def both_keys(
    title: str,
    apply_url: str,
    reference: str | None = None,
) -> tuple[str, str]:
    return (
        algorithm_a(title, apply_url),
        algorithm_b(title, apply_url, reference),
    )
