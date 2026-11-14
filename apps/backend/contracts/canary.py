"""Reader canary checks after a crawl (ledger W-35, pull request 2).

A warning is a note only: it never changes crawl status, counts, schedule or lifecycle.
Previous-run numbers come from crawl_logs (admitted + observed). A missing or unreadable
previous run is skipped quietly.
"""
from __future__ import annotations

from typing import Callable, Iterable, List, Optional, Sequence

# Half-drop only when the previous kept count was at least this (plan, W-35).
_MIN_PREVIOUS = 5


def evaluate(
    *,
    page: str,
    readers: Sequence,
    reader_name: str,
    rows_read: int,
    admitted: int,
    observed: int,
    previous_kept: Optional[int] = None,
    previous_reader: Optional[str] = None,
) -> List[str]:
    """Warning phrases for this crawl; empty when the canary is quiet."""
    warnings: List[str] = []
    kept = max(0, int(admitted)) + max(0, int(observed))

    for reader in readers:
        name = getattr(reader, "name", "") or ""
        marks = getattr(reader, "marks", None)
        if not callable(marks):
            continue
        try:
            seen = bool(marks(page))
        except Exception:
            continue
        if not seen:
            continue
        if name and name != reader_name:
            other = reader_name or "another reader"
            warnings.append(f"{name} marks present but {other} read the listing")
        elif rows_read == 0:
            warnings.append(f"{name} marks present but read no rows")

    if rows_read > 0 and kept == 0:
        warnings.append("rows read but none admitted or observed")

    if (
        previous_kept is not None
        and previous_kept >= _MIN_PREVIOUS
        and kept * 2 < previous_kept
    ):
        warnings.append(
            f"kept rows {kept} less than half of previous {previous_kept}"
        )

    if (
        previous_reader
        and reader_name
        and previous_reader != reader_name
        and previous_reader != "unknown"
        and reader_name != "unknown"
    ):
        warnings.append(f"reader changed from {previous_reader} to {reader_name}")

    return warnings


def append_message(message: str, warnings: Iterable[str]) -> str:
    """The crawl message with canary notes only when there are warnings."""
    notes = [w for w in warnings if w]
    if not notes:
        return message
    joined = "; ".join(notes)
    base = (message or "").rstrip()
    if not base:
        return f"canary: {joined}"
    return f"{base}; canary: {joined}"


def previous_kept_from_logs(
    fetch_row: Callable[[], Optional[tuple]],
) -> Optional[int]:
    """valid_count + observed from the previous finished run; None when unknown.

    `fetch_row` returns (valid_count, observed) or None. A null valid_count is treated as
    unknown (skip the half-drop), so older runs without the lifecycle columns do not warn.
    """
    try:
        row = fetch_row()
    except Exception:
        return None
    if not row:
        return None
    valid, observed = row[0], row[1]
    if valid is None:
        return None
    return max(0, int(valid)) + max(0, int(observed or 0))


def previous_reader_from_logs(
    fetch_reader: Callable[[], Optional[str]],
) -> Optional[str]:
    """The last extraction_logs reader for the source; None when none or on error."""
    try:
        name = fetch_reader()
    except Exception:
        return None
    if not name:
        return None
    return str(name)
