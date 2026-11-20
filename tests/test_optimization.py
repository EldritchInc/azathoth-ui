"""Tests of optimization through the editor's server, and the experiments it records (ADR 0013)."""

import time
from typing import Any

import pytest
from starlette.testclient import TestClient

from tests.test_benchmarks import (
    added,
    client,
    counted_benchmark,
    created,
    instance,
    post,
    refused,
)
from tests.test_live import MISSING_ID, WAIT_SECONDS, WORKFLOW_ID, finished
from tests.test_live_invocations import BRIEF_WORKFLOW_ID

__all__ = ["client", "instance"]

TARGETS = {"target_latency_seconds": 5, "target_cost_usd": 0.01}


def optimizing(
    client: TestClient,
    benchmark_id: str,
    workflow_id: str = WORKFLOW_ID,
    extra: dict[str, object] | None = None,
) -> Any:
    """Start an optimization through the editor, `extra` in its body, and return the response."""

    return post(
        client,
        "/api/live/optimizations",
        {"workflow_id": workflow_id, "benchmark_id": benchmark_id, **TARGETS, **(extra or {})},
    )


def optimized(
    client: TestClient,
    generations: int = 2,
) -> Any:
    """Optimize the word count workflow to the end, and return the session's summary."""

    response = optimizing(client, counted_benchmark(client), extra={"generations": generations})

    assert response.status_code == 201, response.text

    state = finished(client, response.json()["handle"])

    assert state["state"] == "finished", state

    return state["result"]


#
# Optimizing live
#


def test_a_workflow_is_optimized_live_generation_by_generation(
    client: TestClient,
) -> None:
    benchmark_id = counted_benchmark(client)

    response = optimizing(client, benchmark_id, extra={"generations": 2})

    assert response.status_code == 201, response.text
    live = response.json()
    assert (live["kind"], live["workflow_id"], live["benchmark_id"]) == (
        "optimization",
        WORKFLOW_ID,
        benchmark_id,
    )

    state = finished(client, live["handle"])

    assert state["state"] == "finished", state
    assert state["event_count"] == 6
    summary = state["result"]
    assert [generation["generation"] for generation in summary["generations"]] == [1, 2]
    assert summary["winning_experiment_id"] == summary["generations"][-1]["experiment_id"]

    stream = client.get(f"/api/live/{live['handle']}/events").text
    for event in ("generation_started", "candidate_finished", "generation_finished"):
        assert stream.count(event) == 2, event


def test_generations_default_to_one(
    client: TestClient,
) -> None:
    response = optimizing(client, counted_benchmark(client))
    state = finished(client, response.json()["handle"])

    assert state["state"] == "finished", state
    assert len(state["result"]["generations"]) == 1


@pytest.mark.parametrize(
    "extra",
    [
        {"generations": 1.5},
        {"generations": True},
        {"generations": "2"},
        {"target_latency_seconds": "5"},
        {"target_cost_usd": False},
        {"population": 3},
    ],
)
def test_an_optimization_the_editor_cannot_read_is_refused_before_it_starts(
    client: TestClient,
    extra: dict[str, object],
) -> None:
    benchmark_id = counted_benchmark(client)

    refused(optimizing(client, benchmark_id, extra=extra), 422, "invalid_argument")
    assert client.get("/api/live").json() == {"items": []}


def test_an_unknown_workflow_or_benchmark_is_refused_before_it_starts(
    client: TestClient,
) -> None:
    benchmark_id = counted_benchmark(client)

    refused(optimizing(client, MISSING_ID), 404, "not_found")
    refused(optimizing(client, benchmark_id, MISSING_ID), 404, "not_found")
    assert client.get("/api/live").json() == {"items": []}


def test_what_azathoth_refuses_ends_the_optimization_refused(
    client: TestClient,
) -> None:
    empty = finished(client, optimizing(client, created(client)).json()["handle"])
    none = finished(
        client,
        optimizing(client, counted_benchmark(client), extra={"generations": 0}).json()["handle"],
    )

    assert (empty["state"], empty["error"]["code"]) == ("refused", "invalid_argument")
    assert "has no cases" in empty["error"]["message"]
    assert (none["state"], none["error"]["code"]) == ("refused", "invalid_argument")


def test_a_cancelled_optimization_keeps_the_experiments_it_finished(
    client: TestClient,
) -> None:
    benchmark_id = created(client)
    added(client, benchmark_id, {"input": "one", "comparison": "exact", "expected": 7})
    added(client, benchmark_id, {"input": "two", "comparison": "exact", "expected": 7})
    handle = optimizing(client, benchmark_id, BRIEF_WORKFLOW_ID, {"generations": 3}).json()[
        "handle"
    ]
    deadline = time.monotonic() + WAIT_SECONDS

    while client.get(f"/api/live/{handle}").json()["event_count"] < 1:
        assert time.monotonic() < deadline, "The optimization never started a generation."
        time.sleep(0.02)

    post(client, f"/api/live/{handle}/cancel")
    state = finished(client, handle)

    assert state["state"] == "cancelled"
    assert state["event_count"] == 3
    assert len(client.get(f"/api/workflows/{BRIEF_WORKFLOW_ID}/experiments").json()["items"]) == 1


#
# Experiments
#


def test_a_workflows_experiments_are_listed_and_read(
    client: TestClient,
) -> None:
    summary = optimized(client)
    winning = summary["winning_experiment_id"]

    listed = client.get(f"/api/workflows/{WORKFLOW_ID}/experiments").json()["items"]

    assert {experiment["experiment_id"] for experiment in listed} == {
        generation["experiment_id"] for generation in summary["generations"]
    }
    assert len(client.get(f"/api/workflows/{WORKFLOW_ID}/experiments?limit=1").json()["items"]) == 1

    detail = client.get(f"/api/experiments/{winning}").json()

    assert detail["experiment_id"] == winning
    (candidate,) = detail["candidates"]
    assert (candidate["rank"], candidate["cases_run"], candidate["cases_passed"]) == (1, 2, 1)
    assert len(candidate["cases"]) == 2


def test_an_experiment_is_compared_and_checked_before_promoting(
    client: TestClient,
) -> None:
    winning = optimized(client, generations=1)["winning_experiment_id"]

    comparison = client.get(f"/api/experiments/{winning}/compare").json()

    assert comparison["baseline"] is None
    assert comparison["reason"] == "The winner is the candidate the workflow is configured with."
    assert comparison["command"] == (
        f"azathoth workflow promote {WORKFLOW_ID} --experiment {winning}"
    )

    promotability = client.get(f"/api/experiments/{winning}/promotable").json()

    assert (promotability["promotable"], promotability["code"]) == (True, None)
    assert client.get(f"/api/workflows/{WORKFLOW_ID}/production").json() == {"production": None}

    promoted = post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {"experiment_id": winning})

    assert promoted.status_code == 201, promoted.text


def test_an_unknown_experiment_or_workflow_is_not_found(
    client: TestClient,
) -> None:
    refused(client.get(f"/api/experiments/{MISSING_ID}"), 404, "experiment_not_found")
    refused(client.get(f"/api/experiments/{MISSING_ID}/compare"), 404, "experiment_not_found")
    refused(client.get(f"/api/experiments/{MISSING_ID}/promotable"), 404, "experiment_not_found")
    refused(client.get(f"/api/workflows/{MISSING_ID}/experiments"), 404, "not_found")


def test_an_id_or_limit_the_editor_cannot_read_is_refused(
    client: TestClient,
) -> None:
    refused(client.get("/api/experiments/nope"), 422, "invalid_argument")
    refused(
        client.get(f"/api/workflows/{WORKFLOW_ID}/experiments?limit=0"), 422, "invalid_argument"
    )
    refused(
        client.get(f"/api/workflows/{WORKFLOW_ID}/experiments?limit=two"), 422, "invalid_argument"
    )
    assert client.get(f"/api/workflows/{WORKFLOW_ID}/experiments").json() == {"items": []}
