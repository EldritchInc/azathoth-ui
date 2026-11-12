"""The remotes API: the remotes the editor's instance names (ADR 0008).

A remote is reached by a name the editor's own instance gives it, as
`azathoth remote add` gives one (Azathoth's ADR 0126): a name for its URL
and the environment variable its token is read from. The editor never
handles a token. It reads each name's variable from its own environment,
as the command line does, and says only whether that variable is set, so
no token reaches the browser, its requests or its storage.

Naming and forgetting a name are `POST`s with a JSON body, as every change
to the editor's instance is (ADR 0003). Nothing at a remote changes when a
name is given or forgotten.

A remote's status, a push to it and a pull from it are `POST`s under its
name, each naming the workflows, tool versions and benchmarks it is about,
and each reaching the remote afresh with the token its variable holds now.
A status of a remote that cannot be reached is still a status, its side
unknown (Azathoth's ADR 0125); a push or pull to one answers 502.
"""

import os
from collections.abc import Callable, Mapping, Sequence
from typing import Any, Final
from uuid import UUID

from azathoth import api
from azathoth.api.remote import no_token_message
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import BaseRoute, Route

from azathoth_ui.catalog import body_of

ADD_MESSAGE: Final = 'Send {"name", "url"}, and "token_variable" to read its token from another.'

REMOVE_MESSAGE: Final = 'Send {"name"}, the name to forget.'

SELECTION_MESSAGE: Final = (
    'Send {"workflows": [<id>], "tools": [{"id": <id>, "version": <version>}], '
    '"benchmarks": [<id>]}, each a list that may be left out.'
)

PULL_MESSAGE: Final = (
    'Send {"workflows", "tools", "benchmarks"} as for a push, and "include_restricted": true '
    "to pull restricted benchmarks too."
)


def instance_of(
    request: Request,
) -> api.Azathoth:
    """Return the instance the editor serves."""

    instance: api.Azathoth = request.app.state.instance

    return instance


def environ_of(
    request: Request,
) -> Mapping[str, str]:
    """Return the environment the editor reads tokens from: its own, unless a test gives one."""

    environ: Mapping[str, str] | None = request.app.state.environ

    return os.environ if environ is None else environ


def remote_http_of(
    request: Request,
) -> Callable[[], Any] | None:
    """Return what makes the HTTP client remotes are reached over, unless httpx's."""

    http: Callable[[], Any] | None = request.app.state.remote_http

    return http


def described(
    remote: api.NamedRemote,
    environ: Mapping[str, str],
) -> dict[str, Any]:
    """Return one named remote as the API answers it, with whether its token is set.

    `token_set` says only whether its variable holds anything; the editor
    never reads a token out.
    """

    return {**remote.model_dump(mode="json"), "token_set": bool(environ.get(remote.token_variable))}


def text_of(
    body: dict[str, object],
    name: str,
    message: str,
    *,
    required: bool = True,
) -> str | None:
    """Return one text field of a change's body, or refuse it as an invalid argument."""

    value = body.get(name)

    if value is None and not required:
        return None

    if not isinstance(value, str) or value == "":
        raise api.InvalidArgumentError(message)

    return value


def list_remotes(
    request: Request,
) -> Response:
    """`GET /api/remotes`: each remote the instance names, by name, and whether its token is set."""

    environ = environ_of(request)

    return JSONResponse(
        {"items": [described(remote, environ) for remote in instance_of(request).remotes.list()]}
    )


async def add_remote(
    request: Request,
) -> Response:
    """`POST /api/remotes` `{"name", "url", "token_variable"}`: name a remote: 201.

    Without `token_variable`, its token is read from `AZATHOTH_REMOTE_TOKEN`.
    """

    body = await body_of(request, message=ADD_MESSAGE)

    if not set(body) <= {"name", "url", "token_variable"}:
        raise api.InvalidArgumentError(ADD_MESSAGE)

    name = text_of(body, "name", ADD_MESSAGE)
    url = text_of(body, "url", ADD_MESSAGE)
    variable = text_of(body, "token_variable", ADD_MESSAGE, required=False)

    assert name is not None and url is not None

    remotes = instance_of(request).remotes
    added = await run_in_threadpool(
        lambda: (
            remotes.add(name, url)
            if variable is None
            else remotes.add(name, url, token_variable=variable)
        )
    )

    return JSONResponse(described(added, environ_of(request)), status_code=201)


async def remove_remote(
    request: Request,
) -> Response:
    """`POST /api/remotes/remove` `{"name"}`: forget a name, and its remote's last portfolio.

    Nothing at the remote changes.
    """

    body = await body_of(request, message=REMOVE_MESSAGE)

    if set(body) != {"name"}:
        raise api.InvalidArgumentError(REMOVE_MESSAGE)

    name = text_of(body, "name", REMOVE_MESSAGE)

    assert name is not None

    removed = await run_in_threadpool(instance_of(request).remotes.remove, name)

    return JSONResponse(described(removed, environ_of(request)))


def reached(
    request: Request,
) -> api.Remote:
    """Return the remote the path names, with the token its variable holds for the editor.

    Only a name the instance gives is reached, never a URL a request spells
    out.

    Raises:
        NotFoundError: No remote has the name.
        InvalidArgumentError: Its token variable is not set.
    """

    name: str = request.path_params["name"]
    instance = instance_of(request)
    named = instance.remotes.get(name)
    token = environ_of(request).get(named.token_variable)

    if not token:
        raise api.InvalidArgumentError(no_token_message(named.token_variable))

    return instance.remote(named.name, token=token, http=remote_http_of(request))


def ids_of(
    value: object,
    message: str,
) -> tuple[UUID, ...]:
    """Return the ids one list of a selection names, or refuse it as an invalid argument."""

    if value is None:
        return ()

    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise api.InvalidArgumentError(message)

    try:
        return tuple(UUID(item) for item in value)
    except ValueError:
        raise api.InvalidArgumentError(message) from None


def tool_versions_of(
    value: object,
    message: str,
) -> tuple[tuple[UUID, str], ...]:
    """Return the tool versions a selection names, each `{"id", "version"}`, or refuse them."""

    if value is None:
        return ()

    if not isinstance(value, list):
        raise api.InvalidArgumentError(message)

    versions: list[tuple[UUID, str]] = []

    for item in value:
        if not isinstance(item, dict) or set(item) != {"id", "version"}:
            raise api.InvalidArgumentError(message)

        version = item["version"]
        (tool_id,) = ids_of([item["id"]], message)

        if not isinstance(version, str) or version == "":
            raise api.InvalidArgumentError(message)

        versions.append((tool_id, version))

    return tuple(versions)


Selection = tuple[tuple[UUID, ...], tuple[tuple[UUID, str], ...], tuple[UUID, ...]]
"""The workflows, tool versions and benchmarks a status, push or pull is about."""


def selection_of(
    body: dict[str, object],
    message: str,
    *,
    allowed: Sequence[str] = ("workflows", "tools", "benchmarks"),
) -> Selection:
    """Return what a status, push or pull names, refusing a body with anything else."""

    if not set(body) <= set(allowed):
        raise api.InvalidArgumentError(message)

    return (
        ids_of(body.get("workflows"), message),
        tool_versions_of(body.get("tools"), message),
        ids_of(body.get("benchmarks"), message),
    )


async def remote_status(
    request: Request,
) -> Response:
    """`POST /api/remotes/{name}/status`: how what is named relates to the remote's.

    It answers Azathoth's `RemoteStatus`. Naming nothing reports everything
    either side holds. A remote that cannot be reached answers a status
    whose remote side is unknown.
    """

    workflows, tools, benchmarks = selection_of(
        await body_of(request, message=SELECTION_MESSAGE), SELECTION_MESSAGE
    )
    remote = reached(request)
    status = await run_in_threadpool(
        lambda: remote.status(workflows=workflows, tools=tools, benchmarks=benchmarks)
    )

    return JSONResponse(status.model_dump(mode="json"))


async def push_to_remote(
    request: Request,
) -> Response:
    """`POST /api/remotes/{name}/push`: push what is named, with what it needs, as `PushReport`.

    The report carries the warnings Azathoth gives; none refuses the push.
    """

    workflows, tools, benchmarks = selection_of(
        await body_of(request, message=SELECTION_MESSAGE), SELECTION_MESSAGE
    )
    remote = reached(request)
    report = await run_in_threadpool(
        lambda: remote.push(workflows=workflows, tools=tools, benchmarks=benchmarks)
    )

    return JSONResponse(report.model_dump(mode="json"))


async def pull_from_remote(
    request: Request,
) -> Response:
    """`POST /api/remotes/{name}/pull`: pull what is named into this instance, as `PullReport`.

    A restricted benchmark is withheld, and named, unless `include_restricted`.
    """

    body = await body_of(request, message=PULL_MESSAGE)
    workflows, tools, benchmarks = selection_of(
        body,
        PULL_MESSAGE,
        allowed=("workflows", "tools", "benchmarks", "include_restricted"),
    )
    include_restricted = body.get("include_restricted", False)

    if not isinstance(include_restricted, bool):
        raise api.InvalidArgumentError(PULL_MESSAGE)

    remote = reached(request)
    report = await run_in_threadpool(
        lambda: remote.pull(
            workflows=workflows,
            tools=tools,
            benchmarks=benchmarks,
            include_restricted=include_restricted,
        )
    )

    return JSONResponse(report.model_dump(mode="json"))


def remote_routes() -> list[BaseRoute]:
    """Return the remotes API's routes."""

    return [
        Route("/api/remotes", list_remotes, methods=["GET"]),
        Route("/api/remotes", add_remote, methods=["POST"]),
        Route("/api/remotes/remove", remove_remote, methods=["POST"]),
        Route("/api/remotes/{name}/status", remote_status, methods=["POST"]),
        Route("/api/remotes/{name}/push", push_to_remote, methods=["POST"]),
        Route("/api/remotes/{name}/pull", pull_from_remote, methods=["POST"]),
    ]


__all__ = [
    "ADD_MESSAGE",
    "PULL_MESSAGE",
    "REMOVE_MESSAGE",
    "SELECTION_MESSAGE",
    "described",
    "remote_routes",
    "selection_of",
]
