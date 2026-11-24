"""Benchmarks through the editor's server: their cases, runs and executions (ADR 0012).

Each endpoint acts on the instance its request is served for, through
`instance.benchmarks` (Azathoth's ADR 0130), and is mounted with the rest
of that instance's endpoints (ADR 0009). A benchmark run and a comparison
are live runs (ADR 0007), told case by case and cancelled between cases.

A key a body leaves out and a key it sends as `null` mean different things,
as they do to Azathoth: a case added without `expected` expects its run's
latest correction, and an edit leaves out what it does not change.
"""

from collections.abc import Callable
from typing import Final, cast
from uuid import UUID

from azathoth import api
from pydantic import JsonValue, ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from azathoth_ui.browsing import identifier, instance_of, items, one, refusal, whole_number
from azathoth_ui.labels import sensitivity_of
from azathoth_ui.live import (
    LiveEvent,
    TooManyRunsError,
    live_of,
    run_file,
    start_body,
    started,
    uuid_field,
)
from azathoth_ui.scoping import lasting_of

CREATE_FIELDS: Final = ("name", "description", "version")
"""What a body that creates a benchmark may hold."""

CASE_FIELDS: Final = (
    "run_id",
    "input",
    "file",
    "comparison",
    "expected",
    "description",
    "citations",
    "sensitivity",
)
"""What a body that adds a case may hold."""

EDIT_FIELDS: Final = ("comparison", "expected", "description", "citations", "sensitivity")
"""What a body that edits a case may hold."""

RUN_FIELDS: Final = ("benchmark_id", "workflow_id")
"""What a body that runs a workflow against a benchmark may hold."""

COMPARE_FIELDS: Final = (
    "benchmark_id",
    "workflow_ids",
    "target_latency_seconds",
    "target_cost_usd",
)
"""What a body that compares workflows against a benchmark may hold."""

CITATIONS_MESSAGE: Final = (
    'citations must be {"require": [{"source", "segment"}, ...], '
    '"on_unverified": "fail" | "ignore"}, or null.'
)


def _text(
    body: dict[str, object],
    name: str,
    *,
    required: bool,
) -> str | None:
    """Return one text field of a body, `None` when it is left out and need not be.

    Raises:
        InvalidArgumentError: It is not text, or is left out and must be given.
    """

    value = body.get(name)

    if value is None and not required:
        return None

    if not isinstance(value, str):
        raise api.InvalidArgumentError(f"{name} must be text.")

    return value


def _citations(
    value: object,
) -> api.CaseCitations | None:
    """Return what a case's run must cite, `None` for nothing.

    Raises:
        InvalidArgumentError: It is neither null nor what Azathoth reads.
    """

    if value is None:
        return None

    try:
        return api.CaseCitations.model_validate(value)
    except ValidationError:
        raise api.InvalidArgumentError(CITATIONS_MESSAGE) from None


def _comparison(
    value: object,
) -> api.CaseComparison:
    """Return the comparison a body names; Azathoth decides whether it is one.

    Raises:
        InvalidArgumentError: It is not text.
    """

    if not isinstance(value, str):
        raise api.InvalidArgumentError(
            "comparison must be one of exact, normalized, semantic and schema."
        )

    return cast(api.CaseComparison, value)


async def create_benchmark(
    request: Request,
) -> Response:
    """`POST /api/benchmarks` `{"name", "description", "version"?}`: a new benchmark: 201."""

    body = await start_body(request, CREATE_FIELDS, "benchmark")

    if isinstance(body, Response):
        return body

    name = _text(body, "name", required=True) or ""
    description = _text(body, "description", required=True) or ""
    version = _text(body, "version", required=False)
    benchmarks = instance_of(request).benchmarks
    created = await run_in_threadpool(
        lambda: benchmarks.create(name, description, version=version or "1.0.0")
    )

    return one(created, status=201)


def benchmark_cases(
    request: Request,
) -> Response:
    """`GET /api/benchmarks/{id}/cases?revision=`: a revision's cases, in order."""

    benchmark_id = identifier(request, "benchmark_id", "benchmark")

    return items(
        instance_of(request).benchmarks.cases(
            benchmark_id, revision=whole_number(request, "revision")
        )
    )


def benchmark_case(
    request: Request,
) -> Response:
    """`GET /api/benchmarks/{id}/cases/{case_id}?revision=`: one case, with its input."""

    benchmark_id = identifier(request, "benchmark_id", "benchmark")
    case_id = identifier(request, "case_id", "benchmark case")

    return one(
        instance_of(request).benchmarks.case(
            benchmark_id, case_id, revision=whole_number(request, "revision")
        )
    )


async def add_case(
    request: Request,
) -> Response:
    """`POST /api/benchmarks/{id}/cases`: add a case from a run, JSON or a file: 201.

    Without `expected`, a run's case expects the run's latest correction.
    """

    benchmark_id = identifier(request, "benchmark_id", "benchmark")
    body = await start_body(request, CASE_FIELDS, "benchmark case")

    if isinstance(body, Response):
        return body

    run_id = uuid_field(body, "run_id", "run") if "run_id" in body else None
    given = api.RunInput.model_validate({"payload": body["input"]}) if "input" in body else None
    file = run_file(body["file"]) if "file" in body else None
    comparison = _comparison(body.get("comparison"))
    expected: JsonValue | api.Keep = (
        cast(JsonValue, body["expected"]) if "expected" in body else api.KEEP
    )
    description = _text(body, "description", required=False)
    citations = _citations(body.get("citations"))
    sensitivity = sensitivity_of(body.get("sensitivity"))
    benchmarks = instance_of(request).benchmarks

    change = await run_in_threadpool(
        lambda: benchmarks.add_case(
            benchmark_id,
            run_id=run_id,
            input=given,
            file=file,
            comparison=comparison,
            expected=expected,
            description=description,
            citations=citations,
            sensitivity=sensitivity,
        )
    )

    return one(change, status=201)


async def edit_case(
    request: Request,
) -> Response:
    """`POST /api/benchmarks/{id}/cases/{case_id}`: change what a case expects.

    What is left out stays as it was; `"citations": null` stops requiring
    citations, and `"expected": null` expects null.
    """

    benchmark_id = identifier(request, "benchmark_id", "benchmark")
    case_id = identifier(request, "case_id", "benchmark case")
    body = await start_body(request, EDIT_FIELDS, "benchmark case edit")

    if isinstance(body, Response):
        return body

    comparison = _comparison(body["comparison"]) if "comparison" in body else None
    expected: JsonValue | api.Keep = (
        cast(JsonValue, body["expected"]) if "expected" in body else api.KEEP
    )
    citations: api.CaseCitations | None | api.Keep = (
        _citations(body["citations"]) if "citations" in body else api.KEEP
    )
    description = _text(body, "description", required=False)
    sensitivity = sensitivity_of(body.get("sensitivity"))
    benchmarks = instance_of(request).benchmarks

    change = await run_in_threadpool(
        lambda: benchmarks.update_case(
            benchmark_id,
            case_id,
            comparison=comparison,
            expected=expected,
            description=description,
            citations=citations,
            sensitivity=sensitivity,
        )
    )

    return one(change)


async def remove_case(
    request: Request,
) -> Response:
    """`POST /api/benchmarks/{id}/cases/{case_id}/remove`: the next revision, without it."""

    benchmark_id = identifier(request, "benchmark_id", "benchmark")
    case_id = identifier(request, "case_id", "benchmark case")
    benchmarks = instance_of(request).benchmarks

    return one(await run_in_threadpool(benchmarks.remove_case, benchmark_id, case_id))


def benchmark_executions(
    request: Request,
) -> Response:
    """`GET /api/benchmarks/{id}/executions?limit=`: its runs and comparisons, newest first."""

    benchmark_id = identifier(request, "benchmark_id", "benchmark")

    return items(
        instance_of(request).benchmarks.executions(
            benchmark_id, limit=whole_number(request, "limit")
        )
    )


def benchmark_execution(
    request: Request,
) -> Response:
    """`GET /api/benchmark-executions/{id}`: one, with every workflow and case."""

    execution_id = identifier(request, "execution_id", "benchmark execution")

    return one(instance_of(request).benchmarks.execution(execution_id))


def _workflow_ids(
    value: object,
) -> tuple[UUID, ...]:
    """Return the workflows a comparison names.

    Raises:
        InvalidArgumentError: It is not a list of workflow ids.
    """

    if not isinstance(value, list) or not all(isinstance(each, str) for each in value):
        raise api.InvalidArgumentError("workflow_ids must be a list of workflow ids.")

    return tuple(
        uuid_field({"id": each}, "id", "workflow", label="Each of workflow_ids") for each in value
    )


def target_field(
    body: dict[str, object],
    name: str,
) -> float:
    """Return one scoring target a body names; Azathoth decides whether it is positive.

    Raises:
        InvalidArgumentError: It is not a number.
    """

    value = body.get(name)

    if isinstance(value, bool) or not isinstance(value, int | float):
        raise api.InvalidArgumentError(f"{name} must be a number.")

    return float(value)


async def run_benchmark(
    request: Request,
) -> Response:
    """`POST /api/live/benchmarks` `{"benchmark_id", "workflow_id"}`: run one live: 201.

    An unknown benchmark or workflow is refused before anything starts; what
    Azathoth checks before any case runs ends the live run, refused.
    """

    body = await start_body(request, RUN_FIELDS, "benchmark run")

    if isinstance(body, Response):
        return body

    benchmark_id = uuid_field(body, "benchmark_id", "benchmark")
    workflow_id = uuid_field(body, "workflow_id", "workflow")
    instance = instance_of(request)

    await run_in_threadpool(instance.benchmarks.get, benchmark_id)
    await run_in_threadpool(instance.workflows.get, workflow_id)

    opened = lasting_of(request)

    def call(
        on_event: Callable[[LiveEvent], None],
        cancel: api.CancellationToken,
    ) -> api.BenchmarkExecutionDetail:
        """Run the workflow against the benchmark, telling each case, until it ends."""

        with opened() as held:
            return held.benchmarks.run(benchmark_id, workflow_id, on_event=on_event, cancel=cancel)

    try:
        run = live_of(request).start(
            "benchmark",
            call,
            workflow_id=workflow_id,
            benchmark_id=benchmark_id,
        )
    except TooManyRunsError as exc:
        return refusal(429, "too_many_runs", str(exc))

    return started(run)


async def compare_benchmark(
    request: Request,
) -> Response:
    """`POST /api/live/comparisons`: compare workflows against a benchmark, live: 201.

    It names the benchmark, `workflow_ids` and both scoring targets. Each
    workflow must be known before anything starts.
    """

    body = await start_body(request, COMPARE_FIELDS, "comparison")

    if isinstance(body, Response):
        return body

    benchmark_id = uuid_field(body, "benchmark_id", "benchmark")
    workflow_ids = _workflow_ids(body.get("workflow_ids"))
    latency = target_field(body, "target_latency_seconds")
    cost = target_field(body, "target_cost_usd")

    if not workflow_ids:
        raise api.InvalidArgumentError("workflow_ids must name the workflows to compare.")

    instance = instance_of(request)

    await run_in_threadpool(instance.benchmarks.get, benchmark_id)

    for workflow_id in workflow_ids:
        await run_in_threadpool(instance.workflows.get, workflow_id)

    opened = lasting_of(request)

    def call(
        on_event: Callable[[LiveEvent], None],
        cancel: api.CancellationToken,
    ) -> api.BenchmarkExecutionDetail:
        """Compare the workflows against the benchmark, telling each case, until it ends."""

        with opened() as held:
            return held.benchmarks.compare(
                benchmark_id,
                workflow_ids,
                target_latency_seconds=latency,
                target_cost_usd=cost,
                on_event=on_event,
                cancel=cancel,
            )

    try:
        run = live_of(request).start(
            "comparison",
            call,
            workflow_id=workflow_ids[0],
            benchmark_id=benchmark_id,
        )
    except TooManyRunsError as exc:
        return refusal(429, "too_many_runs", str(exc))

    return started(run)


def benchmark_routes() -> list[Route]:
    """Return the benchmark endpoints, below an instance's prefix (ADR 0009)."""

    return [
        Route("/benchmarks", create_benchmark, methods=["POST"]),
        Route("/benchmarks/{benchmark_id}/cases", benchmark_cases, methods=["GET"]),
        Route("/benchmarks/{benchmark_id}/cases", add_case, methods=["POST"]),
        Route("/benchmarks/{benchmark_id}/cases/{case_id}", benchmark_case, methods=["GET"]),
        Route("/benchmarks/{benchmark_id}/cases/{case_id}", edit_case, methods=["POST"]),
        Route(
            "/benchmarks/{benchmark_id}/cases/{case_id}/remove",
            remove_case,
            methods=["POST"],
        ),
        Route(
            "/benchmarks/{benchmark_id}/executions",
            benchmark_executions,
            methods=["GET"],
        ),
        Route(
            "/benchmark-executions/{execution_id}",
            benchmark_execution,
            methods=["GET"],
        ),
        Route("/live/benchmarks", run_benchmark, methods=["POST"]),
        Route("/live/comparisons", compare_benchmark, methods=["POST"]),
    ]


__all__ = [
    "CASE_FIELDS",
    "COMPARE_FIELDS",
    "CREATE_FIELDS",
    "EDIT_FIELDS",
    "RUN_FIELDS",
    "benchmark_routes",
    "target_field",
]
