"""The local server's guard (ADR 0001).

Everything the server answers passes through `LocalOnly`, which:

- answers only requests addressed to `127.0.0.1:<port>` or `localhost:<port>`,
  so a page that rebinds its own domain to this computer is refused;
- refuses any request another site started: an `Origin` that is not this
  server, a `Sec-Fetch-Site` of another site, or a change that names no origin;
- exchanges the launch key in `/?token=` for an HttpOnly, SameSite=Strict
  cookie, and redirects to `/` so the key leaves the address bar;
- refuses whatever has no cookie, except the server's own page styles; and
- puts a strict content security policy, and the headers that go with it, on
  every response.
"""

import hmac
import json
import secrets
from typing import Final

from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from azathoth_ui.pages import ASSETS_PATH, sign_in_page

TOKEN_PARAMETER: Final = "token"
"""The query parameter that carries the launch key, at `/` only."""

PUBLIC_PREFIX: Final = ASSETS_PATH
"""The one path any browser on this computer may fetch without the key."""

API_PREFIX: Final = "/api/"
"""Where the JSON API lives; its refusals and answers are JSON, and never cached."""

SAFE_METHODS: Final = frozenset({"GET", "HEAD", "OPTIONS"})
"""Methods that change nothing, and so may come without an `Origin`."""

OWN_FETCH_SITES: Final = frozenset({"same-origin", "none"})
"""The `Sec-Fetch-Site` values of a request this server's pages, or the person, started."""

UNAUTHENTICATED_MESSAGE: Final = "Open the address azathoth-ui printed when it started."
"""Why a request without the cookie is refused."""

ORIGIN_MESSAGE: Final = "Requests from other sites are refused."
"""Why a request another site started is refused."""

HOST_MESSAGE_TEMPLATE: Final = "This server answers only at 127.0.0.1:{port} and localhost:{port}."
"""Why a request addressed to another host is refused."""

CONTENT_SECURITY_POLICY: Final = (
    "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; "
    "frame-ancestors 'none'; img-src 'self' data:; object-src 'none'"
)
"""What every page may load: only what this server serves."""

SECURITY_HEADERS: Final = (
    ("content-security-policy", CONTENT_SECURITY_POLICY),
    ("x-content-type-options", "nosniff"),
    ("x-frame-options", "DENY"),
    ("referrer-policy", "no-referrer"),
    ("cross-origin-opener-policy", "same-origin"),
    ("cross-origin-resource-policy", "same-origin"),
)
"""The headers every response carries."""

POLICY_VIOLATION: Final = 1008
"""The WebSocket close code for a connection the server refuses."""


def new_token() -> str:
    """Return a new launch key: 256 random bits, safe in a URL."""

    return secrets.token_urlsafe(32)


def cookie_name(
    port: int,
) -> str:
    """Return the cookie one launch's key is kept in.

    Cookies are shared by every port of a host, so each launch names its own,
    and two editors running at once do not overwrite each other's.
    """

    return f"azathoth_ui_{port}"


def same_key(
    given: str,
    token: str,
) -> bool:
    """Return whether one key is the launch key, taking the same time wherever they differ."""

    return hmac.compare_digest(given.encode("utf-8"), token.encode("utf-8"))


def error_body(
    code: str,
    message: str,
) -> bytes:
    """Return the JSON body the API answers an error with."""

    return json.dumps({"error": {"code": code, "message": message}}).encode("utf-8")


class LocalOnly:
    """ASGI middleware that lets only this computer's own browser, holding the key, through."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        token: str,
        port: int,
    ) -> None:
        """Guard one app for one launch: its key and the port it listens on."""

        self.app = app
        self.token = token
        self.port = port
        self.cookie = cookie_name(port)
        self.hosts = frozenset({f"127.0.0.1:{port}", f"localhost:{port}"})
        self.origins = frozenset(f"http://{host}" for host in self.hosts)
        self.host_message = HOST_MESSAGE_TEMPLATE.format(port=port)

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        """Answer one connection: refuse it, exchange its key, or pass it to the app."""

        if scope["type"] == "websocket":
            await receive()
            await send({"type": "websocket.close", "code": POLICY_VIOLATION})
            return

        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        api_path = request.url.path.startswith(API_PREFIX)
        guarded = self.headed(send, no_store=api_path)
        refusal = self.refusal(request, api_path)
        response = refusal if refusal is not None else self.handshake(request)

        if response is not None:
            await response(scope, receive, guarded)
            return

        await self.app(scope, receive, guarded)

    def refusal(
        self,
        request: Request,
        api_path: bool,
    ) -> Response | None:
        """Return the response that refuses one request, or `None` when it may go on."""

        headers = request.headers

        if headers.get("host") not in self.hosts:
            return PlainTextResponse(self.host_message, status_code=400)

        origin = headers.get("origin")
        foreign = (
            (origin is not None and origin not in self.origins)
            or (origin is None and request.method not in SAFE_METHODS)
            or headers.get("sec-fetch-site", "none") not in OWN_FETCH_SITES
        )

        if foreign:
            return refuse(api_path, 403, "forbidden", ORIGIN_MESSAGE)

        if self.handing_over(request) or request.url.path.startswith(PUBLIC_PREFIX):
            return None

        if not same_key(request.cookies.get(self.cookie, ""), self.token):
            if api_path:
                return refuse(api_path, 401, "unauthenticated", UNAUTHENTICATED_MESSAGE)

            return HTMLResponse(sign_in_page(), status_code=401)

        return None

    def handing_over(
        self,
        request: Request,
    ) -> bool:
        """Return whether one request offers a key: a `GET /?token=`."""

        return (
            request.method == "GET"
            and request.url.path == "/"
            and TOKEN_PARAMETER in request.query_params
        )

    def handshake(
        self,
        request: Request,
    ) -> Response | None:
        """Answer one request that offers a key, or return `None` for any other."""

        if not self.handing_over(request):
            return None

        if not same_key(request.query_params[TOKEN_PARAMETER], self.token):
            return HTMLResponse(sign_in_page(), status_code=401)

        response = RedirectResponse("/", status_code=303)
        response.headers["cache-control"] = "no-store"
        response.set_cookie(self.cookie, self.token, httponly=True, samesite="strict", path="/")

        return response

    def headed(
        self,
        send: Send,
        *,
        no_store: bool,
    ) -> Send:
        """Return `send`, putting the security headers on the response it starts."""

        async def send_headed(
            message: Message,
        ) -> None:
            """Add the headers to a response's start, and pass every message on."""

            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)

                for name, value in SECURITY_HEADERS:
                    headers[name] = value

                if no_store:
                    headers["cache-control"] = "no-store"

            await send(message)

        return send_headed


def refuse(
    api_path: bool,
    status: int,
    code: str,
    message: str,
) -> Response:
    """Return a refusal: JSON for the API, plain text for anything else."""

    if api_path:
        body = error_body(code, message)

        return Response(body, status_code=status, media_type="application/json")

    return PlainTextResponse(message, status_code=status)


__all__ = [
    "API_PREFIX",
    "CONTENT_SECURITY_POLICY",
    "HOST_MESSAGE_TEMPLATE",
    "ORIGIN_MESSAGE",
    "OWN_FETCH_SITES",
    "POLICY_VIOLATION",
    "PUBLIC_PREFIX",
    "SAFE_METHODS",
    "SECURITY_HEADERS",
    "TOKEN_PARAMETER",
    "UNAUTHENTICATED_MESSAGE",
    "LocalOnly",
    "cookie_name",
    "error_body",
    "new_token",
    "refuse",
    "same_key",
]
