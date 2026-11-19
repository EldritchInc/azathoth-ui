"""Judges and a run's evidence through the editor's server (ADR 0012).

Each endpoint acts on the instance its request is served for, through
`instance.judges`, `runs.feedback`, `runs.annotations`, `runs.children` and
`runs.interrupted` (Azathoth's ADR 0129), and is mounted with the rest of
that instance's endpoints (ADR 0009). Resuming a run is a live run, so it
is with the other live runs.
"""

from typing import Final, cast

from azathoth import api
from pydantic import JsonValue
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from azathoth_ui.browsing import identifier, instance_of, items, one, whole_number
from azathoth_ui.catalog import body_of, text_field
from azathoth_ui.production import uuid_of

JUDGE_MESSAGE: Final = 'Send {"identifier": "<MODEL_IDENTIFIER>"}.'
"""What a change to the rotation is refused with when its body cannot be read."""

FEEDBACK_MESSAGE: Final = (
    'Send {"disposition": "good" | "bad", "reason"?: "...", "corrected_output"?: <JSON>}.'
)
"""What a judgment is refused with when its body cannot be read."""

FEEDBACK_FIELDS: Final = ("disposition", "reason", "corrected_output")
"""What a judgment may hold."""


def list_judges(
    request: Request,
) -> Response:
    """`GET /api/judges`: the rotation, in the order judges are tried."""

    return items(instance_of(request).judges.list())


async def add_judge(
    request: Request,
) -> Response:
    """`POST /api/judges` `{"identifier"}`: append one served, authorized model: 201."""

    model = text_field(await body_of(request, message=JUDGE_MESSAGE), "identifier")
    judge = await run_in_threadpool(instance_of(request).judges.add, model)

    return one(judge, status=201)


async def remove_judge(
    request: Request,
) -> Response:
    """`POST /api/judges/remove` `{"identifier"}`: take one model out of the rotation."""

    model = text_field(await body_of(request, message=JUDGE_MESSAGE), "identifier")

    return one(await run_in_threadpool(instance_of(request).judges.remove, model))


def run_feedback(
    request: Request,
) -> Response:
    """`GET /api/runs/{id}/feedback`: every judgment of a run, newest first."""

    run_id = identifier(request, "run_id", "run")

    return items(instance_of(request).runs.feedback(run_id))


async def record_feedback(
    request: Request,
) -> Response:
    """`POST /api/runs/{id}/feedback` `{"disposition", "reason"?, "corrected_output"?}`: 201.

    Azathoth decides what a judgment may be: a bad one needs a reason, and
    only a bad one takes a corrected output.
    """

    run_id = identifier(request, "run_id", "run")
    body = await body_of(request, message=FEEDBACK_MESSAGE)
    unknown = sorted(name for name in body if name not in FEEDBACK_FIELDS)

    if unknown:
        raise api.InvalidArgumentError(
            f"A judgment takes disposition, reason and corrected_output, not {', '.join(unknown)}."
        )

    disposition = body.get("disposition")
    reason = body.get("reason")

    if not isinstance(disposition, str):
        raise api.InvalidArgumentError("disposition must be good or bad.")

    if reason is not None and not isinstance(reason, str):
        raise api.InvalidArgumentError("reason must be text.")

    corrected = cast(JsonValue, body.get("corrected_output"))
    runs = instance_of(request).runs
    recorded = await run_in_threadpool(
        lambda: runs.record_feedback(
            run_id,
            disposition,
            reason=reason,
            corrected_output=corrected,
        )
    )

    return one(recorded, status=201)


def run_annotations(
    request: Request,
) -> Response:
    """`GET /api/runs/{id}/annotations`: a run's verified citations, as Web Annotations."""

    run_id = identifier(request, "run_id", "run")

    return one(instance_of(request).runs.annotations(run_id))


def invocation_annotations(
    request: Request,
) -> Response:
    """`GET /api/invocations/{id}/annotations`: an invocation's run's citations."""

    invocation_id = uuid_of(request.path_params["invocation_id"], "an invocation")

    return one(instance_of(request).invocations.annotations(invocation_id))


def run_children(
    request: Request,
) -> Response:
    """`GET /api/runs/{id}/children`: the runs a run's steps started, oldest first."""

    run_id = identifier(request, "run_id", "run")

    return items(instance_of(request).runs.children(run_id))


def interrupted_runs(
    request: Request,
) -> Response:
    """`GET /api/workflows/{id}/interrupted?limit=`: runs that never finished, newest first."""

    workflow_id = identifier(request, "workflow_id", "workflow")
    limit = whole_number(request, "limit")

    return items(instance_of(request).runs.interrupted(workflow_id, limit=limit))


def evidence_routes() -> list[Route]:
    """Return the judges and run evidence endpoints, below an instance's prefix (ADR 0009)."""

    return [
        Route("/judges", list_judges, methods=["GET"]),
        Route("/judges", add_judge, methods=["POST"]),
        Route("/judges/remove", remove_judge, methods=["POST"]),
        Route("/runs/{run_id}/feedback", run_feedback, methods=["GET"]),
        Route("/runs/{run_id}/feedback", record_feedback, methods=["POST"]),
        Route("/runs/{run_id}/annotations", run_annotations, methods=["GET"]),
        Route("/runs/{run_id}/children", run_children, methods=["GET"]),
        Route("/invocations/{invocation_id}/annotations", invocation_annotations, methods=["GET"]),
        Route("/workflows/{workflow_id}/interrupted", interrupted_runs, methods=["GET"]),
    ]


__all__ = [
    "FEEDBACK_FIELDS",
    "FEEDBACK_MESSAGE",
    "JUDGE_MESSAGE",
    "evidence_routes",
]
