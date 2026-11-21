"""Serialise dateparser calls across worker threads (growth plan A2)."""
from __future__ import annotations

import threading

DATEPARSER_LOCK = threading.Lock()
