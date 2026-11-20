"""Where a model or a tool is used, in the instance a request acts on (ADR 0015).

Each answer is Azathoth's own usage: each workflow that configures the
model or tool, where its production uses it, and the runs that used it.
Nothing but the database is read, so no provider is asked. A model's
identifier holds slashes, and `/models/{identifier}` takes the rest of its
path, so a model's usage is asked by query.
"""

from azathoth import api
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from azathoth_ui.browsing import identifier, instance_of, one


def model_usage(
    request: Request,
) -> Response:
    """`GET /api/model-usage?identifier=`: where one exact model is used.

    Raises:
        InvalidArgumentError: No model is named.
    """

    named = request.query_params.get("identifier", "")

    if not named:
        raise api.InvalidArgumentError("identifier must name a model.")

    return one(instance_of(request).models.usage(named))


def tool_usage(
    request: Request,
) -> Response:
    """`GET /api/tools/{id}/usage`: where one tool, in any of its versions, is used."""

    return one(instance_of(request).tools.usage(identifier(request, "tool_id", "tool")))


def usage_routes() -> list[Route]:
    """Return the usage endpoints, below an instance's prefix (ADR 0009)."""

    return [
        Route("/model-usage", model_usage, methods=["GET"]),
        Route("/tools/{tool_id}/usage", tool_usage, methods=["GET"]),
    ]


__all__ = [
    "usage_routes",
]
