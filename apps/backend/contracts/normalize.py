"""Normalise a new write payload. Do not mutate a stored row."""
import re


def normalize_new_write(payload: dict) -> dict:
    result = dict(payload)
    title = result.get("title")
    if isinstance(title, str):
        result["title"] = re.sub(r"\s+", " ", title).strip()
    return result
