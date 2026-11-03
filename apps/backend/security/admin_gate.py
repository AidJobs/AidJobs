"""Admin requests: the session checked and the body size capped before any route reads the body.

FastAPI reads and validates a request body before a route's dependencies run, so `admin_required`
alone let a caller without a session have any body read and parsed (malformed JSON even got a
422). This gate answers such a caller with 401 without reading the body. The routes keep
`admin_required` as a second check.
"""
from __future__ import annotations

import re

from starlette.requests import Request
from starlette.responses import JSONResponse

from security.admin_auth import get_current_admin

ADMIN_PREFIX = "/api/admin/"
# Reached before signing in: the session check, signing in and signing out.
OPEN_PATHS = frozenset({"/api/admin/session", "/api/admin/login", "/api/admin/logout"})
# The largest admin request is a link check of 100 URLs of at most 2,048 characters (about 210 KB).
MAX_ADMIN_BODY_BYTES = 1024 * 1024

NOT_SIGNED_IN = {"detail": "Authentication required"}
TOO_LARGE = {"detail": "Request too large"}
# A declared length the gate trusts; anything else is left to the streamed count below.
_LENGTH = re.compile(r"[0-9]{1,15}")


def _route_path(scope) -> str:
    """The path the router matches: Starlette's own rule for removing the server's root path."""
    path = scope["path"]
    root = scope.get("root_path", "")
    if root and path.startswith(root) and (path == root or path[len(root)] == "/"):
        return path[len(root):]
    return path


class AdminGateMiddleware:
    """Pure ASGI, inside the CORS middleware, so preflight requests are answered before it.

    A permitted body is read here, stopping at the first piece that passes the limit, and handed
    to the route unchanged; an error raised from inside a route's body reading would reach
    FastAPI as "400 There was an error parsing the body" instead of the 413.
    """

    def __init__(self, app, max_body_bytes: int = MAX_ADMIN_BODY_BYTES):
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope, receive, send):
        path = _route_path(scope) if scope["type"] == "http" else ""
        if not path.startswith(ADMIN_PREFIX):
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        if path not in OPEN_PATHS and get_current_admin(request) is None:
            await JSONResponse(NOT_SIGNED_IN, status_code=401)(scope, receive, send)
            return
        declared = request.headers.get("content-length")
        if (declared is not None and _LENGTH.fullmatch(declared)
                and int(declared) > self.max_body_bytes):
            await JSONResponse(TOO_LARGE, status_code=413)(scope, receive, send)
            return

        chunks = []
        received = 0
        while True:
            message = await receive()
            if message["type"] != "http.request":
                await self.app(scope, _replay([], message, receive), send)
                return
            body = message.get("body", b"")
            received += len(body)
            if received > self.max_body_bytes:
                await JSONResponse(TOO_LARGE, status_code=413)(scope, receive, send)
                return
            chunks.append(body)
            if not message.get("more_body", False):
                break
        await self.app(scope, _replay(chunks, None, receive), send)


def _replay(chunks, first_other, receive):
    """The body already read, as one message; then whatever the client sends next."""
    pending = [{"type": "http.request", "body": b"".join(chunks), "more_body": False}]
    if first_other is not None:
        pending = [first_other]

    async def replayed():
        if pending:
            return pending.pop(0)
        return await receive()

    return replayed
