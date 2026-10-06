"""Extract returns candidates. It does not receive a database connection."""
from collections.abc import Callable


def extract_candidates(content: str, extractor: Callable[[str], list[dict]]) -> list[dict]:
    return list(extractor(content))
