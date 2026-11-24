"""The editor's server: its JSON API and the web app, behind the guard of ADR 0001.

The API (ADR 0003) answers from one open Azathoth instance, through
`azathoth.api` only. The endpoints that act on an instance are built once,
for that instance, and mounted at `/api` (ADR 0009), and served for each
remote it names under `/api/remotes/{name}` (ADR 0016); the editor's own,
its description and its remotes, stay beside them. An `ApiError` answers
with its stable code and exact message, and a status that says which kind
of failure it is. Everything under
`/` that is not the API is the built web app: a file it built, or, for any
other address without a file extension, its page, which routes itself. An
installation without a web app answers every page with one that says how to
build it.
"""

from collections.abc import Callable, Mapping
from pathlib import Path, PurePosixPath
from typing import Any, Final

from azathoth import api
from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from starlette.routing import BaseRoute, Mount, Route, request_response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from azathoth_ui import __version__
from azathoth_ui.catalog import (
    Catalog,
    ModelSource,
    PortfolioSource,
    model_in_use,
)
from azathoth_ui.commands import Shell, command_prefix, local_shell
from azathoth_ui.instances import instance_endpoints, instance_routes
from azathoth_ui.live import LiveRuns
from azathoth_ui.pages import ASSETS_PATH, not_built_page
from azathoth_ui.remote_instances import REMOTE_PREFIX, RemoteInstances, RemoteLiveRuns
from azathoth_ui.remotes import remote_routes
from azathoth_ui.scoping import LOCAL_INSTANCE, InstanceContext
from azathoth_ui.security import API_PREFIX, LocalOnly

PACKAGE_DIRECTORY: Final = Path(__file__).parent

ASSETS_DIRECTORY: Final = PACKAGE_DIRECTORY / "assets"
"""The server's own pages' stylesheet and icon."""

STATIC_DIRECTORY: Final = PACKAGE_DIRECTORY / "static"
"""Where the web app is built into the package."""

ERROR_STATUSES: Final[tuple[tuple[type[api.ApiError], int], ...]] = (
    (api.InvalidArgumentError, 422),
    (api.WorkflowResultMissingError, 422),
    (api.NotFoundError, 404),
    (api.ConflictError, 409),
    (api.RunCancelledError, 409),
    (api.RunNotStartedError, 409),
    (api.CandidateUnavailableError, 409),
    (api.ProviderUnavailableError, 502),
    (api.McpUnavailableError, 502),
    (api.ContentUnavailableError, 502),
    (api.RemoteUnreachableError, 502),
    (api.RemoteProtocolError, 502),
    (api.RemoteRefusedError, 403),
    (api.PermissionDeniedError, 403),
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


def describe_editor(
    request: Request,
) -> Response:
    """`GET /api/editor`: the editor's version, the shell it writes commands for, its providers.

    The providers are named, never their keys. What goes before a command
    belongs to each instance, at its own `/commands` (ADR 0009).
    """

    shell: Shell = request.app.state.shell
    providers: tuple[str, ...] = request.app.state.providers

    return JSONResponse(
        {
            "version": __version__,
            "shell": shell,
            "providers": list(providers),
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
    providers: tuple[str, ...] = (),
    models: ModelSource | None = None,
    portfolio: PortfolioSource | None = None,
    live: LiveRuns | None = None,
    environ: Mapping[str, str] | None = None,
    remote_http: Callable[[], Any] | None = None,
) -> LocalOnly:
    """Return the editor's server for one open instance, one launch key and one port.

    `static_dir` is the built web app, the package's own by default. When it
    holds no `index.html`, every page says how to build one. `shell` is the
    shell the editor writes commands for, this computer's by default.
    `providers` names the providers the instance was opened with. `models`
    and `portfolio` are where models are listed and authorized, the
    instance's own by default. `live` keeps the runs started from the
    editor, a new keeper by default. `environ` is where remotes' tokens are
    read from, the server's own environment by default. `remote_http` makes
    the HTTP client remotes are reached over, httpx's by default, as tests
    replace it.
    """

    web = STATIC_DIRECTORY if static_dir is None else static_dir
    chosen_shell = local_shell() if shell is None else shell
    local = InstanceContext(
        name=LOCAL_INSTANCE,
        instance=instance,
        catalog=Catalog(instance.models if models is None else models),
        portfolio=instance.portfolio if portfolio is None else portfolio,
        live=LiveRuns() if live is None else live,
        command_prefix=command_prefix(instance.describe().database, chosen_shell),
    )
    routes: list[BaseRoute] = [
        Route("/api/editor", describe_editor, methods=["GET"]),
        *remote_routes(),
        Mount(
            REMOTE_PREFIX,
            app=RemoteInstances(
                instance_endpoints(),
                missing=request_response(no_endpoint),
                live=RemoteLiveRuns(),
            ),
        ),
        *instance_routes(local, prefix=API_PREFIX.rstrip("/")),
        Route("/api/{rest:path}", no_endpoint),
        Mount(ASSETS_PATH.rstrip("/"), StaticFiles(directory=ASSETS_DIRECTORY)),
    ]

    if (web / "index.html").is_file():
        routes.append(Mount("/", WebApp(directory=web, html=True)))
    else:
        routes.append(Route("/{path:path}", not_built, methods=["GET"]))

    app = Starlette(
        routes=routes,
        exception_handlers={
            api.ModelInUseError: model_in_use,
            api.ApiError: api_error,
            HTTPException: http_error,
        },
    )
    app.state.instance = instance
    app.state.local = local
    app.state.shell = chosen_shell
    app.state.providers = providers
    app.state.environ = environ
    app.state.remote_http = remote_http

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
