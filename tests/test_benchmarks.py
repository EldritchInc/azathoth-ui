"""Tests of benchmarks through the editor's server: their cases, runs and executions (ADR 0012)."""

import base64
import json
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from azathoth.persistence.repositories import open_repositories
from starlette.testclient import TestClient

from azathoth_ui.app import ERROR_STATUSES
from tests.test_browsing import TOOL
from tests.test_live import MISSING_ID, WAIT_SECONDS, WORKFLOW_ID, counting, finished, signed_in
from tests.test_live_invocations import BRIEF_STEP_ID, BRIEF_TOOL, BRIEF_WORKFLOW_ID, POSTED

SECOND_WORKFLOW_ID = "c1000000-0000-4000-8000-000000000011"

SECOND_STEP_ID = "c1000000-0000-4000-8000-000000000012"


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield an instance with two word count workflows and a brief slow one, closed after."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.Azathoth(open_repositories(database)) as opened:
        opened.tools.import_document(json.dumps(TOOL))
        opened.tools.import_document(json.dumps(BRIEF_TOOL))
        opened.workflows.import_document(json.dumps(counting()))
        opened.workflows.import_document(json.dumps(counting(SECOND_WORKFLOW_ID, SECOND_STEP_ID)))
        opened.workflows.import_document(
            json.dumps(counting(BRIEF_WORKFLOW_ID, BRIEF_STEP_ID, "brief_count", "process"))
        )
        yield opened


@pytest.fixture
def client(
    instance: api.Azathoth,
    tmp_path: Path,
) -> TestClient:
    """Return a signed-in client of the editor's server."""

    return signed_in(instance, tmp_path)


def post(
    client: TestClient,
    path: str,
    body: object | None = None,
) -> Any:
    """Post a JSON body as the web app does, and return the response."""

    return client.post(path, content=json.dumps({} if body is None else body), headers=POSTED)


def created(
    client: TestClient,
) -> str:
    """Create an empty benchmark through the editor, and return its id."""

    response = post(client, "/api/benchmarks", {"name": "words", "description": "Count words."})

    assert response.status_code == 201, response.text

    return str(response.json()["benchmark"]["id"])


def added(
    client: TestClient,
    benchmark_id: str,
    body: dict[str, object],
) -> Any:
    """Add a case through the editor, and return the change it answers with."""

    response = post(client, f"/api/benchmarks/{benchmark_id}/cases", body)

    assert response.status_code == 201, response.text

    return response.json()


def counted_benchmark(
    client: TestClient,
) -> str:
    """Return a benchmark the word count workflow passes one case of two."""

    benchmark_id = created(client)
    added(client, benchmark_id, {"input": "one two three", "comparison": "exact", "expected": 3})
    added(client, benchmark_id, {"input": "four five", "comparison": "exact", "expected": 5})

    return benchmark_id


def refused(
    response: Any,
    status: int,
    code: str,
) -> str:
    """Assert a refusal's status and code, and return its message."""

    assert response.status_code == status, response.text

    error = response.json()["error"]

    assert error["code"] == code

    return str(error["message"])


def test_a_semantic_case_no_judge_may_judge_is_a_conflict() -> None:
    assert issubclass(api.JudgeUnavailableError, api.ConflictError)
    assert dict(ERROR_STATUSES)[api.ConflictError] == 409


#
# Creating a benchmark, and its cases
#


def test_a_new_benchmark_is_its_first_revision_with_no_cases(
    client: TestClient,
) -> None:
    response = post(
        client,
        "/api/benchmarks",
        {"name": "words", "description": "Count words.", "version": "2.0.0"},
    )

    assert response.status_code == 201
    benchmark = response.json()["benchmark"]
    assert (benchmark["name"], benchmark["version"], benchmark["case_count"]) == (
        "words",
        "2.0.0",
        0,
    )
    assert benchmark["revision"]["number"] == 1
    assert client.get(f"/api/benchmarks/{benchmark['id']}/cases").json() == {"items": []}


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"name": " ", "description": "Count words."}, "must not be blank"),
        ({"description": "Count words."}, "name must be text"),
        ({"name": "words", "description": "Count.", "cases": []}, "not cases"),
    ],
)
def test_a_benchmark_is_refused_without_a_name_or_with_what_it_does_not_take(
    client: TestClient,
    body: dict[str, object],
    message: str,
) -> None:
    assert message in refused(post(client, "/api/benchmarks", body), 422, "invalid_argument")


def test_json_becomes_a_case_and_is_read_back(
    client: TestClient,
) -> None:
    benchmark_id = created(client)
    change = added(
        client,
        benchmark_id,
        {
            "input": {"text": "one two"},
            "comparison": "normalized",
            "expected": 2,
            "description": "Two words.",
            "sensitivity": "public",
            "citations": {
                "require": [{"source": "poem", "segment": "l1"}],
                "on_unverified": "fail",
            },
        },
    )

    case = change["case"]
    assert change["benchmark"]["revision"]["number"] == 2
    assert (case["source"], case["comparison"], case["sensitivity"]) == (
        "json",
        "normalized",
        "public",
    )
    assert case["citations"]["require"] == [{"source": "poem", "segment": "l1"}]

    (listed,) = client.get(f"/api/benchmarks/{benchmark_id}/cases").json()["items"]
    assert listed["case_id"] == case["case_id"]

    read = client.get(f"/api/benchmarks/{benchmark_id}/cases/{case['case_id']}").json()
    assert (read["input"], read["expected"], read["description"]) == (
        {"text": "one two"},
        2,
        "Two words.",
    )
    first = client.get(f"/api/benchmarks/{benchmark_id}/cases?revision=1").json()
    assert first == {"items": []}


def test_a_file_becomes_a_case(
    client: TestClient,
) -> None:
    benchmark_id = created(client)
    change = added(
        client,
        benchmark_id,
        {
            "file": {
                "media_type": "text/plain",
                "content": base64.b64encode(b"one two three").decode("ascii"),
            },
            "comparison": "exact",
            "expected": 3,
        },
    )

    assert change["case"]["input"] == "one two three"


def test_a_run_becomes_a_case_expecting_its_correction_or_null(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    run_id = instance.runs.run(UUID(WORKFLOW_ID), input=api.RunInput(payload="one two")).run_id
    instance.runs.record_feedback(run_id, "bad", reason="It is three.", corrected_output=3)
    benchmark_id = created(client)

    corrected = added(client, benchmark_id, {"run_id": str(run_id), "comparison": "exact"})
    null = added(
        client, benchmark_id, {"run_id": str(run_id), "comparison": "exact", "expected": None}
    )

    assert corrected["case"]["source"] == "run"
    assert corrected["case"]["source_run_id"] == str(run_id)
    assert corrected["case"]["expected"] == 3
    assert corrected["case"]["source_feedback_id"] is not None
    assert null["case"]["expected"] is None


@pytest.mark.parametrize(
    ("body", "code", "status"),
    [
        ({"input": "one", "comparison": "exact"}, "invalid_argument", 422),
        (
            {"input": "one", "run_id": MISSING_ID, "comparison": "exact", "expected": 1},
            "invalid_argument",
            422,
        ),
        ({"input": "one", "comparison": "fuzzy", "expected": 1}, "invalid_argument", 422),
        ({"input": "one", "expected": 1}, "invalid_argument", 422),
        (
            {"input": "one", "comparison": "exact", "expected": 1, "citations": "all"},
            "invalid_argument",
            422,
        ),
        (
            {"input": "one", "comparison": "exact", "expected": 1, "weight": 2},
            "invalid_argument",
            422,
        ),
        ({"run_id": MISSING_ID, "comparison": "exact", "expected": 1}, "not_found", 404),
    ],
)
def test_a_case_azathoth_or_the_editor_refuses_saves_nothing(
    client: TestClient,
    body: dict[str, object],
    code: str,
    status: int,
) -> None:
    benchmark_id = created(client)

    refused(post(client, f"/api/benchmarks/{benchmark_id}/cases", body), status, code)

    assert (
        client.get(f"/api/benchmarks/{benchmark_id}/history").json()["items"][0]["case_count"] == 0
    )


def test_a_duplicate_case_is_a_conflict_and_an_unknown_benchmark_not_found(
    client: TestClient,
) -> None:
    benchmark_id = counted_benchmark(client)
    duplicate = {"input": "one two three", "comparison": "exact", "expected": 3}

    refused(post(client, f"/api/benchmarks/{benchmark_id}/cases", duplicate), 409, "conflict")
    refused(post(client, f"/api/benchmarks/{MISSING_ID}/cases", duplicate), 404, "not_found")


#
# Editing and removing a case
#


def test_an_edit_changes_only_what_it_is_sent(
    client: TestClient,
) -> None:
    benchmark_id = created(client)
    case = added(
        client,
        benchmark_id,
        {
            "input": "one two",
            "comparison": "exact",
            "expected": 2,
            "citations": {
                "require": [{"source": "poem", "segment": "l1"}],
                "on_unverified": "fail",
            },
        },
    )["case"]
    path = f"/api/benchmarks/{benchmark_id}/cases/{case['case_id']}"

    response = post(client, path, {"comparison": "normalized", "citations": None})

    assert response.status_code == 200, response.text
    edited = response.json()["case"]
    assert (edited["comparison"], edited["expected"], edited["citations"]) == (
        "normalized",
        2,
        None,
    )

    nulled = post(client, path, {"expected": None}).json()["case"]
    assert nulled["expected"] is None
    assert nulled["comparison"] == "normalized"


def test_an_edit_that_lowers_a_label_or_names_an_unknown_case_is_refused(
    client: TestClient,
) -> None:
    benchmark_id = created(client)
    case = added(
        client,
        benchmark_id,
        {"input": "one", "comparison": "exact", "expected": 1, "sensitivity": "restricted"},
    )["case"]

    message = refused(
        post(
            client,
            f"/api/benchmarks/{benchmark_id}/cases/{case['case_id']}",
            {"sensitivity": "public"},
        ),
        422,
        "invalid_argument",
    )

    assert "an edit cannot label it public" in message
    refused(
        post(client, f"/api/benchmarks/{benchmark_id}/cases/{MISSING_ID}", {"expected": 1}),
        404,
        "not_found",
    )
    refused(
        post(client, f"/api/benchmarks/{benchmark_id}/cases/{case['case_id']}", {"input": "x"}),
        422,
        "invalid_argument",
    )


def test_a_removed_case_leaves_the_next_revision(
    client: TestClient,
) -> None:
    benchmark_id = counted_benchmark(client)
    first, second = client.get(f"/api/benchmarks/{benchmark_id}/cases").json()["items"]

    response = post(client, f"/api/benchmarks/{benchmark_id}/cases/{second['case_id']}/remove")

    assert response.status_code == 200, response.text
    assert response.json()["case"]["case_id"] == second["case_id"]
    assert [
        case["case_id"]
        for case in client.get(f"/api/benchmarks/{benchmark_id}/cases").json()["items"]
    ] == [first["case_id"]]
    refused(
        post(client, f"/api/benchmarks/{benchmark_id}/cases/{second['case_id']}/remove"),
        404,
        "not_found",
    )


#
# Running live
#


def test_a_benchmark_runs_live_case_by_case_and_is_saved(
    client: TestClient,
) -> None:
    benchmark_id = counted_benchmark(client)

    response = post(
        client, "/api/live/benchmarks", {"benchmark_id": benchmark_id, "workflow_id": WORKFLOW_ID}
    )

    assert response.status_code == 201, response.text
    live = response.json()
    assert (live["kind"], live["benchmark_id"], live["workflow_id"]) == (
        "benchmark",
        benchmark_id,
        WORKFLOW_ID,
    )

    state = finished(client, live["handle"])

    assert state["state"] == "finished", state
    assert state["result"]["kind"] == "run"
    assert state["event_count"] == 4

    stream = client.get(f"/api/live/{live['handle']}/events").text
    assert stream.count("case_started") == 2
    assert stream.count("case_finished") == 2

    (listed,) = client.get(f"/api/benchmarks/{benchmark_id}/executions").json()["items"]
    assert listed["execution_id"] == state["result"]["execution_id"]
    detail = client.get(f"/api/benchmark-executions/{listed['execution_id']}").json()
    assert detail["candidates"][0]["cases_passed"] == 1


def test_workflows_are_compared_live(
    client: TestClient,
) -> None:
    benchmark_id = counted_benchmark(client)

    response = post(
        client,
        "/api/live/comparisons",
        {
            "benchmark_id": benchmark_id,
            "workflow_ids": [WORKFLOW_ID, SECOND_WORKFLOW_ID],
            "target_latency_seconds": 5,
            "target_cost_usd": 0.01,
        },
    )

    assert response.status_code == 201, response.text
    live = response.json()
    assert live["kind"] == "comparison"

    state = finished(client, live["handle"])

    assert state["state"] == "finished", state
    assert state["result"]["kind"] == "compare"
    assert state["event_count"] == 8


@pytest.mark.parametrize(
    "body",
    [
        {"workflow_ids": WORKFLOW_ID, "target_latency_seconds": 5, "target_cost_usd": 0.01},
        {"workflow_ids": [WORKFLOW_ID, "no"], "target_latency_seconds": 5, "target_cost_usd": 0.01},
        {
            "workflow_ids": [WORKFLOW_ID, SECOND_WORKFLOW_ID],
            "target_latency_seconds": "5",
            "target_cost_usd": 0.01,
        },
        {
            "workflow_ids": [WORKFLOW_ID, SECOND_WORKFLOW_ID],
            "target_latency_seconds": True,
            "target_cost_usd": 0.01,
        },
    ],
)
def test_a_comparison_the_editor_cannot_read_is_refused_before_it_starts(
    client: TestClient,
    body: dict[str, object],
) -> None:
    benchmark_id = counted_benchmark(client)

    refused(
        post(client, "/api/live/comparisons", {"benchmark_id": benchmark_id, **body}),
        422,
        "invalid_argument",
    )
    assert client.get("/api/live").json() == {"items": []}


def test_a_benchmark_that_cannot_run_is_refused_live(
    client: TestClient,
) -> None:
    benchmark_id = created(client)

    response = post(
        client, "/api/live/benchmarks", {"benchmark_id": benchmark_id, "workflow_id": WORKFLOW_ID}
    )
    state = finished(client, response.json()["handle"])

    assert state["state"] == "refused"
    assert state["error"]["code"] == "invalid_argument"
    assert "has no cases" in state["error"]["message"]


def test_an_unknown_benchmark_or_workflow_is_refused_before_it_starts(
    client: TestClient,
) -> None:
    benchmark_id = counted_benchmark(client)

    refused(
        post(
            client, "/api/live/benchmarks", {"benchmark_id": MISSING_ID, "workflow_id": WORKFLOW_ID}
        ),
        404,
        "not_found",
    )
    refused(
        post(
            client,
            "/api/live/benchmarks",
            {"benchmark_id": benchmark_id, "workflow_id": MISSING_ID},
        ),
        404,
        "not_found",
    )
    assert client.get("/api/live").json() == {"items": []}


def test_a_cancelled_benchmark_stops_between_cases_and_saves_no_execution(
    client: TestClient,
) -> None:
    benchmark_id = created(client)
    added(client, benchmark_id, {"input": "one", "comparison": "exact", "expected": 7})
    added(client, benchmark_id, {"input": "two", "comparison": "exact", "expected": 7})

    handle = post(
        client,
        "/api/live/benchmarks",
        {"benchmark_id": benchmark_id, "workflow_id": BRIEF_WORKFLOW_ID},
    ).json()["handle"]
    deadline = time.monotonic() + WAIT_SECONDS

    while client.get(f"/api/live/{handle}").json()["event_count"] < 1:
        assert time.monotonic() < deadline, "The benchmark never started a case."
        time.sleep(0.02)

    post(client, f"/api/live/{handle}/cancel")
    state = finished(client, handle)

    assert state["state"] == "cancelled"
    assert state["event_count"] == 2
    assert client.get(f"/api/benchmarks/{benchmark_id}/executions").json() == {"items": []}


#
# Executions
#


def test_an_unknown_execution_is_not_found_and_a_limit_must_be_whole(
    client: TestClient,
) -> None:
    benchmark_id = counted_benchmark(client)

    refused(client.get(f"/api/benchmark-executions/{MISSING_ID}"), 404, "not_found")
    refused(client.get("/api/benchmark-executions/nope"), 422, "invalid_argument")
    refused(
        client.get(f"/api/benchmarks/{benchmark_id}/executions?limit=0"), 422, "invalid_argument"
    )
    assert client.get(f"/api/benchmarks/{benchmark_id}/executions").json() == {"items": []}
