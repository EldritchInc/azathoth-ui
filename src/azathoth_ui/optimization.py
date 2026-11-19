"""Optimization through the editor's server: live, and the experiments it records (ADR 0013).

Each endpoint acts on the instance its request is served for, through
`instance.optimization` and `instance.experiments` (Azathoth's ADR 0131),
and is mounted with the rest of that instance's endpoints (ADR 0009). An
optimization is a live run (ADR 0007), told generation by generation and
cancelled between candidates. Promoting a winner is production's own
endpoint, given `{"experiment_id"}` (ADR 0010).
"""

from collections.abc import Callable
from typing import Final

from azathoth import api
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from azathoth_ui.benchmarks import target_field
from azathoth_ui.browsing import identifier, instance_of, items, one, refusal, whole_number
from azathoth_ui.live import (
    LiveEvent,
    TooManyRunsError,
    live_of,
    start_body,
    started,
    uuid_field,
)

OPTIMIZE_FIELDS: Final = (
    "workflow_id",
    "benchmark_id",
    "target_latency_seconds",
    "target_cost_usd",
    "generations",
)
"""What a body that optimizes a workflow may hold."""


def _generations(
    body: dict[str, object],
) -> int:
    """Return how many generations a body asks for, 1 when it names none.

    Azathoth decides whether it is enough.

    Raises:
        InvalidArgumentError: It is not a whole number.
    """

    value = body.get("generations", 1)

    if isinstance(value, bool) or not isinstance(value, int):
        raise api.InvalidArgumentError("generations must be a whole number.")

    return value


def workflow_experiments(
    request: Request,
) -> Response:
    """`GET /api/workflows/{id}/experiments?limit=`: its experiments, newest first."""

    workflow_id = identifier(request, "workflow_id", "workflow")

    return items(
        instance_of(request).experiments.list(workflow_id, limit=whole_number(request, "limit"))
    )


def get_experiment(
    request: Request,
) -> Response:
    """`GET /api/experiments/{id}`: one experiment, its candidates ranked."""

    experiment_id = identifier(request, "experiment_id", "experiment")

    return one(instance_of(request).experiments.get(experiment_id))


def compare_experiment(
    request: Request,
) -> Response:
    """`GET /api/experiments/{id}/compare`: its winner beside what promoting it would replace."""

    experiment_id = identifier(request, "experiment_id", "experiment")

    return one(instance_of(request).experiments.compare(experiment_id))


async def promotable_experiment(
    request: Request,
) -> Response:
    """`GET /api/experiments/{id}/promotable`: whether its winner can still be promoted.

    It asks the providers which models they serve now, so it runs off the
    event loop; nothing is saved.
    """

    experiment_id = identifier(request, "experiment_id", "experiment")
    experiments = instance_of(request).experiments

    return one(await run_in_threadpool(experiments.promotable, experiment_id))


async def optimize_workflow(
    request: Request,
) -> Response:
    """`POST /api/live/optimizations`: optimize a workflow against a benchmark, live: 201.

    It names the workflow, the benchmark, both scoring targets, and how many
    generations, 1 when it names none. An unknown workflow or benchmark is
    refused before anything starts; what Azathoth checks before any
    candidate runs ends the live run, refused.
    """

    body = await start_body(request, OPTIMIZE_FIELDS, "optimization")

    if isinstance(body, Response):
        return body

    workflow_id = uuid_field(body, "workflow_id", "workflow")
    benchmark_id = uuid_field(body, "benchmark_id", "benchmark")
    latency = target_field(body, "target_latency_seconds")
    cost = target_field(body, "target_cost_usd")
    generations = _generations(body)
    instance = instance_of(request)

    await run_in_threadpool(instance.workflows.get, workflow_id)
    await run_in_threadpool(instance.benchmarks.get, benchmark_id)

    def call(
        on_event: Callable[[LiveEvent], None],
        cancel: api.CancellationToken,
    ) -> api.OptimizationSummary:
        """Optimize the workflow, telling each generation and candidate, until it ends."""

        return instance.optimization.optimize(
            workflow_id,
            benchmark_id,
            target_latency_seconds=latency,
            target_cost_usd=cost,
            generations=generations,
            on_event=on_event,
            cancel=cancel,
        )

    try:
        run = live_of(request).start(
            "optimization",
            call,
            workflow_id=workflow_id,
            benchmark_id=benchmark_id,
        )
    except TooManyRunsError as exc:
        return refusal(429, "too_many_runs", str(exc))

    return started(run)


def optimization_routes() -> list[Route]:
    """Return the optimization endpoints, below an instance's prefix (ADR 0009)."""

    return [
        Route("/workflows/{workflow_id}/experiments", workflow_experiments, methods=["GET"]),
        Route("/experiments/{experiment_id}", get_experiment, methods=["GET"]),
        Route("/experiments/{experiment_id}/compare", compare_experiment, methods=["GET"]),
        Route(
            "/experiments/{experiment_id}/promotable",
            promotable_experiment,
            methods=["GET"],
        ),
        Route("/live/optimizations", optimize_workflow, methods=["POST"]),
    ]


__all__ = [
    "OPTIMIZE_FIELDS",
    "optimization_routes",
]
