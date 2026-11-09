"""The editor's server: its JSON API and the web app, behind the guard of ADR 0001.

The API (ADR 0003) answers from one open Azathoth instance, through
`azathoth.api` only. An `ApiError` answers with its stable code and exact
message, and a status that says which kind of failure it is. Everything under
`/` that is not the API is the built web app: a file it built, or, for any
other address without a file extension, its page, which routes itself. An
installation without a web app answers every page with one that says how to
build it.
"""

from pathlib import Path, PurePosixPath
from typing import Final

from azathoth import api
from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import BaseRoute, Mount, Route
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from azathoth_ui import __version__
from azathoth_ui.browsing import browsing_routes
from azathoth_ui.commands import Shell, command_prefix, local_shell
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


def describe_editor(
    request: Request,
) -> Response:
    """`GET /api/editor`: the editor's version, and how its commands name its database."""

    instance: api.Azathoth = request.app.state.instance
    shell: Shell = request.app.state.shell
    database = instance.describe().database

    return JSONResponse(
        {
            "version": __version__,
            "shell": shell,
            "command_prefix": command_prefix(database, shell),
        }
    )


def no_endpoint(
    request: Request,
) -> Response:
    """Refuse any API path the server does not serve."""

    raise HTTPException(404, f"No API endpoint at {request.url.path}.")


def not_built(
    request: Request,
) -> Response:
    """Any page in an installation without a web app: say how to build one."""

    instance: api.Azathoth = request.app.state.instance

    return HTMLResponse(not_built_page(instance.describe()))


def built_file(
    path: str,
) -> bool:
    """Return whether one path, relative to the build, names a file the build would make.

    Starlette hands `StaticFiles` the path in the platform's own form, with
    backslashes on Windows, so either separator splits it.
    """

    parts = PurePosixPath(path.replace("\\", "/")).parts

    return parts[:1] == ("assets",) or (len(parts) == 1 and "." in parts[0])


class WebApp(StaticFiles):
    """The built web app: its files, and its page for every address it routes itself.

    The build puts its files under `/assets/`, and a few, such as the icon,
    at the top. Any other address, such as `/workflows/<id>` or
    `/tools/<id>/versions/1.0.0`, is one of the web app's own pages, so it gets
    `index.html`. A missing file, such as `/assets/gone.js`, is still 404.
    """

    async def get_response(
        self,
        path: str,
        scope: Scope,
    ) -> Response:
        """Return the file at one path, or the web app's page for an address of its own."""

        try:
            return await super().get_response(path, scope)
        except HTTPException as error:
            if error.status_code != 404 or built_file(path):
                raise

            return await super().get_response("index.html", scope)


def build_app(
    instance: api.Azathoth,
    *,
    token: str,
    port: int,
    static_dir: Path | None = None,
    shell: Shell | None = None,
) -> LocalOnly:
    """Return the editor's server for one open instance, one launch key and one port.

    `static_dir` is the built web app, the package's own by default. When it
    holds no `index.html`, every page says how to build one. `shell` is the
    shell the editor writes commands for, this computer's by default.
    """

    web = STATIC_DIRECTORY if static_dir is None else static_dir
    routes: list[BaseRoute] = [
        Route("/api/instance", describe_instance, methods=["GET"]),
        Route("/api/editor", describe_editor, methods=["GET"]),
        *browsing_routes(),
        Route("/api/{rest:path}", no_endpoint),
        Mount(ASSETS_PATH.rstrip("/"), StaticFiles(directory=ASSETS_DIRECTORY)),
    ]

    if (web / "index.html").is_file():
        routes.append(Mount("/", WebApp(directory=web, html=True)))
    else:
        routes.append(Route("/{path:path}", not_built, methods=["GET"]))

    app = Starlette(
        routes=routes,
        exception_handlers={api.ApiError: api_error, HTTPException: http_error},
    )
    app.state.instance = instance
    app.state.shell = local_shell() if shell is None else shell

    return LocalOnly(app, token=token, port=port)


__all__ = [
    "ASSETS_DIRECTORY",
    "ERROR_STATUSES",
    "HTTP_ERROR_CODES",
    "STATIC_DIRECTORY",
    "WebApp",
    "build_app",
    "error_status",
]
