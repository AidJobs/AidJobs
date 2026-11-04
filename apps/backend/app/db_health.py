"""The public database check (security stage 7): yes or no, quickly, without stalling the server.

`GET /api/db/status` answers `{"ok": true}`, or a fixed failure answer; no IDs, names or counts.
The detail is for the admin only, at `GET /api/admin/db/status`.

The check runs `SELECT 1` on its own worker thread, so the event loop (and `/api/healthz`, which
Render checks every 5 seconds) keeps answering while it waits. Limits: 3 seconds to connect,
2 seconds for the statement, 5 seconds overall, and TCP keepalives so a silent connection fails
within seconds. Its answer, success or failure, is kept for 30 seconds, and callers that arrive
while a check runs wait for that check instead of starting their own. A worker still stuck after
its limit is never joined by a second one: until it ends, the answer is the failure answer.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import os
import time
from typing import TYPE_CHECKING, Callable

from app.db_config import db_config
from app.log_safety import redact_exception

if TYPE_CHECKING:
    import psycopg2
else:
    try:
        import psycopg2
    except ImportError:
        psycopg2 = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT_SECONDS = 3
STATEMENT_TIMEOUT_MS = 2000
OVERALL_TIMEOUT_SECONDS = 5.0
CACHE_SECONDS = 30.0
# libpq options: a dead or silent peer is noticed in about 10 seconds instead of the system's
# default of minutes.
KEEPALIVES = {
    "keepalives": 1,
    "keepalives_idle": 5,
    "keepalives_interval": 2,
    "keepalives_count": 2,
    "tcp_user_timeout": 5000,
}

OK = {"ok": True}
UNAVAILABLE = {"ok": False, "error": "Database unavailable"}
NOT_CONFIGURED = {"ok": False, "error": "Database not configured"}
NO_DRIVER = {"ok": False, "error": "psycopg2 not installed"}


def log_cause(error: BaseException) -> str:
    """For a log line: the exception's type in production; its redacted text in development.

    Driver messages name the database host (`connection to server at "..."`), which the
    redaction does not mask.
    """
    if os.getenv("AIDJOBS_ENV", "production").lower() == "dev":
        return redact_exception(error)
    return type(error).__name__


def _select_one() -> dict:
    """Blocking; runs on the check's worker thread."""
    params = db_config.get_connection_params()
    if not params:
        return UNAVAILABLE
    conn = psycopg2.connect(**params, connect_timeout=CONNECT_TIMEOUT_SECONDS, **KEEPALIVES)
    try:
        cursor = conn.cursor()
        # LOCAL: the setting ends with this transaction, so it never reaches a pooled session.
        cursor.execute(f"SET LOCAL statement_timeout = {int(STATEMENT_TIMEOUT_MS)}")
        cursor.execute("SELECT 1")
        row = cursor.fetchone()
        cursor.close()
    finally:
        conn.close()
    return OK if row and row[0] == 1 else UNAVAILABLE


class DatabaseCheck:
    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._answer: dict | None = None
        self._checked_at = 0.0
        self._lock: asyncio.Lock | None = None
        self._lock_loop: asyncio.AbstractEventLoop | None = None
        self._executor: concurrent.futures.ThreadPoolExecutor | None = None
        self._worker: concurrent.futures.Future | None = None

    def _fresh(self) -> dict | None:
        if self._answer is not None and self._clock() - self._checked_at < CACHE_SECONDS:
            return dict(self._answer)
        return None

    def _loop_lock(self) -> asyncio.Lock:
        # One lock per event loop: a lock that once waited stays tied to that loop.
        loop = asyncio.get_running_loop()
        if self._lock is None or self._lock_loop is not loop:
            self._lock = asyncio.Lock()
            self._lock_loop = loop
        return self._lock

    async def status(self) -> dict:
        cached = self._fresh()
        if cached is not None:
            return cached
        async with self._loop_lock():
            cached = self._fresh()
            if cached is not None:
                return cached
            answer = await self._check()
            self._answer = answer
            self._checked_at = self._clock()
            return dict(answer)

    async def _check(self) -> dict:
        if not db_config.is_db_enabled:
            return NOT_CONFIGURED
        if psycopg2 is None:
            return NO_DRIVER
        if self._worker is not None and not self._worker.done():
            logger.error("Database check skipped: the previous check is still running")
            return UNAVAILABLE
        if self._executor is None:
            self._executor = concurrent.futures.ThreadPoolExecutor(
                max_workers=1, thread_name_prefix="db-check")
        self._worker = self._executor.submit(_select_one)
        try:
            return await asyncio.wait_for(asyncio.wrap_future(self._worker),
                                          timeout=OVERALL_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            logger.error("Database check timed out after %s s", OVERALL_TIMEOUT_SECONDS)
        except Exception as e:
            logger.error("Database check failed: %s", log_cause(e))
        return UNAVAILABLE


db_check = DatabaseCheck()
