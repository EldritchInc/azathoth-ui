"""A workflow's production through the editor's server: what runs, and how it got there (ADR 0010).

Each endpoint acts on the instance its request is served for, through
`instance.production` and `instance.invocations` (Azathoth's ADR 0128), and
is mounted with the rest of that instance's endpoints (ADR 0009).
"""

from typing import Final
from uuid import UUID

from azathoth import api
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from azathoth_ui.browsing import identifier, instance_of, items, one, whole_number
from azathoth_ui.catalog import body_of

PROMOTE_MESSAGE: Final = 'Send a JSON object: {}, or {"experiment_id": "<EXPERIMENT_ID>"}.'
"""What a promotion is refused with when its body cannot be read."""

ROLLBACK_MESSAGE: Final = 'Send a JSON object: {}, or {"to": "<PRODUCTION_REVISION_ID>"}.'
"""What a rollback is refused with when its body cannot be read."""


def uuid_of(
    text: str,
    what: str,
) -> UUID:
    """Return the id one text names, or refuse it as an invalid argument naming `what` it is."""

    try:
        return UUID(text)
    except ValueError:
        raise api.InvalidArgumentError(f"{text!r} is not {what} id.") from None


def optional_id(
    body: dict[str, object],
    name: str,
    what: str,
    message: str,
) -> UUID | None:
    """Return the id one field of a change names, `None` when it is absent or null."""

    value = body.get(name)

    if value is None:
        return None

    if not isinstance(value, str):
        raise api.InvalidArgumentError(message)

    return uuid_of(value, what)


def workflow_production(
    request: Request,
) -> Response:
    """`GET /api/workflows/{id}/production`: what production runs now, or `null`."""

    workflow_id = identifier(request, "workflow_id", "workflow")
    state = instance_of(request).production.get(workflow_id)

    return JSONResponse({"production": None if state is None else state.model_dump(mode="json")})


def production_revisions(
    request: Request,
) -> Response:
    """`GET /api/workflows/{id}/production/revisions?limit=`: newest first, active marked."""

    workflow_id = identifier(request, "workflow_id", "workflow")
    limit = whole_number(request, "limit")

    return items(instance_of(request).production.revisions(workflow_id, limit=limit))


async def promote(
    request: Request,
) -> Response:
    """`POST /api/workflows/{id}/promote` `{"experiment_id"?}`: promote it: 201."""

    workflow_id = identifier(request, "workflow_id", "workflow")
    body = await body_of(request, message=PROMOTE_MESSAGE)
    experiment_id = optional_id(body, "experiment_id", "an experiment", PROMOTE_MESSAGE)
    production = instance_of(request).production

    promoted = await run_in_threadpool(
        lambda: production.promote(workflow_id, experiment_id=experiment_id)
    )

    return one(promoted, status=201)


async def roll_back(
    request: Request,
) -> Response:
    """`POST /api/workflows/{id}/rollback` `{"to"?}`: restore an earlier revision: 201."""

    workflow_id = identifier(request, "workflow_id", "workflow")
    body = await body_of(request, message=ROLLBACK_MESSAGE)
    to = optional_id(body, "to", "a production revision", ROLLBACK_MESSAGE)
    production = instance_of(request).production

    restored = await run_in_threadpool(lambda: production.roll_back(workflow_id, to=to))

    return one(restored, status=201)


def workflow_invocations(
    request: Request,
) -> Response:
    """`GET /api/workflows/{id}/invocations?limit=`: a workflow's invocations, newest first."""

    workflow_id = identifier(request, "workflow_id", "workflow")
    limit = whole_number(request, "limit")

    return items(instance_of(request).invocations.list(workflow_id, limit=limit))


def get_invocation(
    request: Request,
) -> Response:
    """`GET /api/invocations/{id}`: one invocation, with its input, outcome and run."""

    invocation_id = uuid_of(request.path_params["invocation_id"], "an invocation")

    return one(instance_of(request).invocations.get(invocation_id))


def production_routes() -> list[Route]:
    """Return the production endpoints, below an instance's prefix (ADR 0009)."""

    return [
        Route("/workflows/{workflow_id}/production", workflow_production, methods=["GET"]),
        Route(
            "/workflows/{workflow_id}/production/revisions",
            production_revisions,
            methods=["GET"],
        ),
        Route("/workflows/{workflow_id}/promote", promote, methods=["POST"]),
        Route("/workflows/{workflow_id}/rollback", roll_back, methods=["POST"]),
        Route("/workflows/{workflow_id}/invocations", workflow_invocations, methods=["GET"]),
        Route("/invocations/{invocation_id}", get_invocation, methods=["GET"]),
    ]


__all__ = [
    "PROMOTE_MESSAGE",
    "ROLLBACK_MESSAGE",
    "production_routes",
]
