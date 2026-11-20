"""The reusable goals of the instance a request acts on (ADR 0015).

A goal is not revised. Importing one answers with Azathoth's import: 201
when the goal was kept, and 200 when it is the goal already kept under its
ID, unchanged; another goal with that ID is a conflict, and the kept one
is never replaced.
"""

from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from azathoth_ui.browsing import identifier, import_with, instance_of, items, one


def list_goals(
    request: Request,
) -> Response:
    """`GET /api/goals`: every goal, in import order."""

    return items(instance_of(request).goals.list())


def get_goal(
    request: Request,
) -> Response:
    """`GET /api/goals/{id}`: one goal, with its criteria, constraints and document."""

    return one(instance_of(request).goals.get(identifier(request, "goal_id", "goal")))


async def import_goal(
    request: Request,
) -> Response:
    """`POST /api/goals/import`: import one goal document."""

    return await import_with(request, instance_of(request).goals.import_document)


def goal_routes() -> list[Route]:
    """Return the goal endpoints, below an instance's prefix (ADR 0009)."""

    return [
        Route("/goals", list_goals, methods=["GET"]),
        Route("/goals/import", import_goal, methods=["POST"]),
        Route("/goals/{goal_id}", get_goal, methods=["GET"]),
    ]


__all__ = [
    "goal_routes",
]
