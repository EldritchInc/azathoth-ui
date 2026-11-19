"""Every endpoint that acts on an instance, built once and mounted for each (ADR 0009).

`instance_routes(context, prefix=...)` returns the browsing, models,
portfolio and live-run endpoints, and the instance's own description and
command prefix, under one prefix, each bound to one instance. The editor
mounts them at `/api` for its own instance; Azathoth 1.6's remotes are
mounted the same way, under `/api/remotes/{name}`, with nothing rebuilt.
"""

import inspect
from collections.abc import Awaitable, Callable
from typing import cast

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import BaseRoute, Route

from azathoth_ui.browsing import browsing_routes
from azathoth_ui.catalog import catalog_routes
from azathoth_ui.evidence import evidence_routes
from azathoth_ui.live import live_routes
from azathoth_ui.production import production_routes
from azathoth_ui.scoping import INSTANCE_SCOPE_KEY, InstanceContext, context_of

Endpoint = Callable[[Request], Response | Awaitable[Response]]
"""What a route answers a request with, now or once awaited."""


def describe_instance(
    request: Request,
) -> Response:
    """`GET {prefix}/instance`: describe the instance."""

    return JSONResponse(context_of(request).instance.describe().model_dump(mode="json"))


def describe_commands(
    request: Request,
) -> Response:
    """`GET {prefix}/commands`: the instance's name, and what goes before a command for it.

    The server writes the prefix, quoted for this computer's shell, so the
    web app never quotes anything itself.
    """

    context = context_of(request)

    return JSONResponse({"instance": context.name, "prefix": context.command_prefix})


def instance_endpoints() -> list[Route]:
    """Return every endpoint that acts on an instance, at its path below the prefix."""

    return [
        Route("/instance", describe_instance, methods=["GET"]),
        Route("/commands", describe_commands, methods=["GET"]),
        *browsing_routes(),
        *catalog_routes(),
        *live_routes(),
        *production_routes(),
        *evidence_routes(),
    ]


def bound(
    endpoint: Endpoint,
    context: InstanceContext,
) -> Endpoint:
    """Return the endpoint, answering every request it takes for one instance.

    A synchronous endpoint stays synchronous, so Starlette still runs it in
    its thread pool rather than on the event loop.
    """

    if inspect.iscoroutinefunction(endpoint):

        async def answer_async(
            request: Request,
        ) -> Response:
            request.scope[INSTANCE_SCOPE_KEY] = context

            return await cast(Callable[[Request], Awaitable[Response]], endpoint)(request)

        return answer_async

    def answer(
        request: Request,
    ) -> Response:
        request.scope[INSTANCE_SCOPE_KEY] = context

        return cast(Callable[[Request], Response], endpoint)(request)

    return answer


def instance_routes(
    context: InstanceContext,
    *,
    prefix: str,
) -> list[BaseRoute]:
    """Return every endpoint that acts on an instance, under `prefix`, for one instance."""

    return [
        Route(
            f"{prefix}{route.path}",
            bound(cast(Endpoint, route.endpoint), context),
            methods=sorted(route.methods or ()),
            name=route.name,
        )
        for route in instance_endpoints()
    ]


__all__ = [
    "describe_commands",
    "describe_instance",
    "instance_endpoints",
    "instance_routes",
]
