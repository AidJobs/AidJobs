"""Request IDs and safe 5xx responses (security stage 3).

Every response carries an `X-Request-ID` generated here; an inbound one is never trusted.
`InternalError` is for unexpected failures: the caller gets a fixed message with a short
reference, and the cause goes only to the log, redacted, under the same ID.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.datastructures import MutableHeaders

from app.log_safety import REQUEST_ID, redact_exception

REQUEST_ID_HEADER = "X-Request-ID"

logger = logging.getLogger(__name__)


class RequestIdMiddleware:
    """Pure ASGI, added outermost, so preflight and rate-limit responses carry the header too."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = uuid.uuid4().hex
        token = REQUEST_ID.set(request_id)

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            REQUEST_ID.reset(token)


def log_failure(log: logging.Logger, message: str, error: BaseException) -> None:
    """Log an unexpected failure: the redacted cause, with its traceback (redacted on output)."""
    log.error("%s: %s", message, redact_exception(error),
              exc_info=(type(error), error, error.__traceback__))


class InternalError(Exception):
    """An unexpected failure. `message` is fixed text written by us; `cause` stays in the log."""

    def __init__(self, message: str, cause: BaseException | None = None, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.cause = cause
        self.status_code = status_code


async def internal_error_handler(request: Request, exc: InternalError) -> JSONResponse:
    request_id = REQUEST_ID.get() or uuid.uuid4().hex
    if exc.cause is not None:
        log_failure(logger, exc.message, exc.cause)
    else:
        logger.error("%s", exc.message)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": f"{exc.message} (ref {request_id[:8]})", "request_id": request_id},
    )
