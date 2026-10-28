"""Secrets never reach a log line (security stage 3).

Prevention comes first: code logs exceptions through `redact_exception`, never `f"{e}"`.
This module is the safety net under it: every handler's formatter is wrapped so the final
text of each line, tracebacks included, is redacted before it is written. The record itself
is never changed, because uvicorn's access formatter reads `record.args` as a tuple.

Imports nothing from the app, so main.py can install it before importing anything else.
"""
from __future__ import annotations

import logging
import os
import re
from contextvars import ContextVar
from urllib.parse import quote, quote_plus, unquote, urlsplit

URL_MARK = "<redacted-url>"
VALUE_MARK = "<redacted>"

REQUEST_ID: ContextVar[str] = ContextVar("aidjobs_request_id", default="")

_MIN_SECRET_LENGTH = 12
_NOT_SECRETS = frozenset({"true", "false", "yes", "no", "none", "null", "on", "off"})
_SECRET_NAME = re.compile(r"(KEY|SECRET|PASSWORD|PASSWD|TOKEN)", re.IGNORECASE)

# A URL scheme, bounded: an unbounded one makes every pattern below quadratic on long text
# without spaces (16 KB took 9 s), and redaction runs inside every log call.
_SCHEME = r"[a-z][a-z0-9+.-]{0,31}://"

# PR #50's shapes, kept: any URL, and a password= parameter.
_ANY_URL = re.compile(r"\b" + _SCHEME + r"\S+", re.IGNORECASE)
_PASSWORD_PARAM = re.compile(r"(password\s*=\s*)\S+", re.IGNORECASE)

_QUOTED = re.compile(r'"[^"]*"')


def _quoted_parts_redacted(match: re.Match) -> str:
    return _QUOTED.sub('"' + VALUE_MARK + '"', match.group(0))


# Driver and parser messages that quote the connection string or part of it (demonstrated
# with fake values on 28 October 2026, psycopg2 2.9 and Python's urllib). libpq puts the
# offending text in double quotes after "invalid dsn:".
_PATTERNS = (
    (re.compile(r"invalid dsn:[^\n]*", re.IGNORECASE), _quoted_parts_redacted),
    (re.compile(r'(invalid integer value )"[^"]*"( for connection option)', re.IGNORECASE),
     r'\1"' + VALUE_MARK + r'"\2'),
    (re.compile(r"(Port could not be cast to integer value as )'[^']*'"),
     r"\1'" + VALUE_MARK + "'"),
    # user:password@ (the password may contain "/"), then a bare token@.
    (re.compile(r"\b(" + _SCHEME + r")[^\s/@:]*:[^\s@]*@", re.IGNORECASE),
     r"\1" + VALUE_MARK + "@"),
    (re.compile(r"\b(" + _SCHEME + r")[^\s/@:]+@", re.IGNORECASE), r"\1" + VALUE_MARK + "@"),
    (re.compile(r"\b(password|passwd|pwd)(\s*[=:]\s*)(\"[^\"]*\"|'[^']*'|[^\s,;&]+)",
                re.IGNORECASE), r"\1\2" + VALUE_MARK),
    (re.compile(r"\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}", re.IGNORECASE), r"\1" + VALUE_MARK),
    (re.compile(r"([?&](?:key|api_key|apikey|token|access_token|secret|password|sig|signature)=)"
                r"[^&\s'\"]+", re.IGNORECASE), r"\1" + VALUE_MARK),
    (re.compile(r"\bsk-(?:or-)?[A-Za-z0-9_-]{16,}"), VALUE_MARK),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"), VALUE_MARK),
)

_secret_values: tuple[str, ...] = ()


def _forms(value: str) -> set[str]:
    return {value, unquote(value), quote(value, safe=""), quote_plus(value)}


def refresh_secrets(environ=None) -> int:
    """Read the values to redact from the environment. Returns how many; never the values."""
    global _secret_values
    environ = os.environ if environ is None else environ
    found: set[str] = set()
    for name, value in environ.items():
        if not value:
            continue
        if "://" in value:
            try:
                password = urlsplit(value.replace("[", "").replace("]", "")).password
            except ValueError:
                password = None
            if password:
                found.add(value)
                found.update(_forms(password))
        if _SECRET_NAME.search(name):
            found.update(_forms(value))
    _secret_values = tuple(sorted(
        (v for v in found if len(v) >= _MIN_SECRET_LENGTH and v.lower() not in _NOT_SECRETS),
        key=len, reverse=True,
    ))
    return len(_secret_values)


def redact_text(text: str) -> str:
    """Known secret values first, then the shapes that carry secrets."""
    if not text:
        return text
    for value in _secret_values:
        if value in text:
            text = text.replace(value, VALUE_MARK)
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def redact_exception(error: BaseException) -> str:
    """An exception for a log line: its type and its redacted text (PR #50's helper, widened)."""
    text = _PASSWORD_PARAM.sub(r"\1" + VALUE_MARK, str(error))
    text = _ANY_URL.sub(URL_MARK, text)
    return f"{type(error).__name__}: {redact_text(text)}"


def current_request_id() -> str:
    return REQUEST_ID.get()


class RedactingFormatter(logging.Formatter):
    """Wraps a handler's own formatter and redacts the finished line."""

    def __init__(self, inner: logging.Formatter | None):
        super().__init__()
        self.inner = inner or logging.Formatter()

    def format(self, record: logging.LogRecord) -> str:
        text = self.inner.format(record)
        request_id = REQUEST_ID.get()
        if request_id:
            text = f"[{request_id}] {text}"
        return redact_text(text)


def _wrap(handler: logging.Handler) -> None:
    if not isinstance(handler.formatter, RedactingFormatter):
        handler.setFormatter(RedactingFormatter(handler.formatter))


HANDLED_LOGGERS = ("", "uvicorn", "uvicorn.access", "uvicorn.error")


def install() -> None:
    """Wrap every handler that writes our logs. Safe to call more than once."""
    refresh_secrets()
    for name in HANDLED_LOGGERS:
        for handler in logging.getLogger(name).handlers:
            _wrap(handler)
    if logging.lastResort is not None:
        _wrap(logging.lastResort)
    # httpx and httpcore log every request URL at INFO; a URL can carry a key.
    for name in ("httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)
