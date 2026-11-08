"""The editor's server: its JSON API and the web app, behind the guard of ADR 0001.

The API answers from one open Azathoth instance, through `azathoth.api` only.
An `ApiError` answers with its stable code and exact message, and a status
that says which kind of failure it is. Everything under `/` that is not the
API is the built web app, or, in an installation without one, a page that
says how to build it.
"""

from pathlib import Path
from typing import Final

from azathoth import api
from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import BaseRoute, Mount, Route
from starlette.staticfiles import StaticFiles

from azathoth_ui.pages import ASSETS_PATH, not_built_page
from azathoth_ui.security import API_PREFIX, LocalOnly

PACKAGE_DIRECTORY: Final = Path(__file__).parent

ASSETS_DIRECTORY: Final = PACKAGE_DIRECTORY / "assets"
"""The server's own pages' stylesheet and icon."""

STATIC_DIRECTORY: Final = PACKAGE_DIRECTORY / "static"
"""Where the web app is built into the package."""

ERROR_STATUSES: Final[tuple[tuple[type[api.ApiError], int], ...]] = (
    (api.InvalidArgumentError, 422),
    (api.NotFoundError, 404),
    (api.ConflictError, 409),
    (api.RunCancelledError, 409),
    (api.RunNotStartedError, 409),
    (api.ProviderUnavailableError, 502),
    (api.InstanceClosedError, 503),
    (api.InstanceUnavailableError, 503),
)
"""The status of each kind of error a caller can act on; any other is the server's own, 500."""

HTTP_ERROR_CODES: Final = {404: "not_found", 405: "method_not_allowed"}
"""The codes of the API's own HTTP errors."""


def error_status(
    error: api.ApiError,
) -> int:
    """Return the HTTP status one service API error answers with."""

    for kind, status in ERROR_STATUSES:
        if isinstance(error, kind):
            return status

    return 500


def error_response(
    status: int,
    code: str,
    message: str,
) -> JSONResponse:
    """Return the API's answer to one error."""

    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def api_error(
    request: Request,
    error: Exception,
) -> Response:
    """Answer a service API error with its code, message and status."""

    assert isinstance(error, api.ApiError)

    return error_response(error_status(error), error.code, str(error))


def http_error(
    request: Request,
    error: Exception,
) -> Response:
    """Answer an HTTP error in JSON under the API, and in plain text anywhere else."""

    assert isinstance(error, HTTPException)

    if request.url.path.startswith(API_PREFIX):
        code = HTTP_ERROR_CODES.get(error.status_code, "error")

        return error_response(error.status_code, code, error.detail)

    return PlainTextResponse(error.detail, status_code=error.status_code, headers=error.headers)


def describe_instance(
    request: Request,
) -> Response:
    """`GET /api/instance`: describe the instance the editor serves."""

    instance: api.Azathoth = request.app.state.instance

    return JSONResponse(instance.describe().model_dump(mode="json"))


def no_endpoint(
    request: Request,
) -> Response:
    """Refuse any API path the server does not serve."""

    raise HTTPException(404, f"No API endpoint at {request.url.path}.")


def not_built(
    request: Request,
) -> Response:
    """`GET /` in an installation without a web app: say how to build one."""

    instance: api.Azathoth = request.app.state.instance

    return HTMLResponse(not_built_page(instance.describe()))


def build_app(
    instance: api.Azathoth,
    *,
    token: str,
    port: int,
    static_dir: Path | None = None,
) -> LocalOnly:
    """Return the editor's server for one open instance, one launch key and one port.

    `static_dir` is the built web app, the package's own by default. When it
    holds no `index.html`, `/` says how to build one.
    """

    web = STATIC_DIRECTORY if static_dir is None else static_dir
    routes: list[BaseRoute] = [
        Route("/api/instance", describe_instance, methods=["GET"]),
        Route("/api/{rest:path}", no_endpoint),
        Mount(ASSETS_PATH.rstrip("/"), StaticFiles(directory=ASSETS_DIRECTORY)),
    ]

    if (web / "index.html").is_file():
        routes.append(Mount("/", StaticFiles(directory=web, html=True)))
    else:
        routes.append(Route("/", not_built, methods=["GET"]))

    app = Starlette(
        routes=routes,
        exception_handlers={api.ApiError: api_error, HTTPException: http_error},
    )
    app.state.instance = instance

    return LocalOnly(app, token=token, port=port)


__all__ = [
    "ASSETS_DIRECTORY",
    "ERROR_STATUSES",
    "HTTP_ERROR_CODES",
    "STATIC_DIRECTORY",
    "build_app",
    "error_status",
]
