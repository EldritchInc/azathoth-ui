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
"""

import os
from collections.abc import Mapping
from typing import Any, Final

from azathoth import api
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import BaseRoute, Route

from azathoth_ui.catalog import body_of

ADD_MESSAGE: Final = 'Send {"name", "url"}, and "token_variable" to read its token from another.'

REMOVE_MESSAGE: Final = 'Send {"name"}, the name to forget.'


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


def remote_routes() -> list[BaseRoute]:
    """Return the remotes API's routes."""

    return [
        Route("/api/remotes", list_remotes, methods=["GET"]),
        Route("/api/remotes", add_remote, methods=["POST"]),
        Route("/api/remotes/remove", remove_remote, methods=["POST"]),
    ]


__all__ = [
    "ADD_MESSAGE",
    "REMOVE_MESSAGE",
    "described",
    "remote_routes",
]
