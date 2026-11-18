"""Tests of invoking and resuming through production as live runs (ADR 0010)."""

import json
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from starlette.testclient import TestClient

from azathoth_ui.live import EDITOR_CALLER
from tests.test_app import ORIGIN
from tests.test_browsing import TOOL
from tests.test_live import (
    MISSING_ID,
    WORKFLOW_ID,
    counting,
    finished,
    running,
    signed_in,
    stream,
)

POSTED = {"origin": ORIGIN, "content-type": "application/json"}

BRIEF_TOOL_ID = "d8000000-0000-4000-8000-000000000001"

BRIEF_WORKFLOW_ID = "c8000000-0000-4000-8000-000000000001"

BRIEF_STEP_ID = "c8000000-0000-4000-8000-000000000002"

BRIEF_TOOL: dict[str, Any] = {
    "definition": {**TOOL["definition"], "id": BRIEF_TOOL_ID, "name": "brief_count"},
    "implementations": [
        {
            "id": "d8000000-0000-4000-8000-000000000002",
            "tool_id": BRIEF_TOOL_ID,
            "tool_version": "1.0.0",
            "version": "1.0.0",
            "runtime": "process",
            "command": [sys.executable],
            "source": (
                "import json\nimport sys\nimport time\n\n"
                "json.load(sys.stdin)\ntime.sleep(0.5)\njson.dump({'count': 7}, sys.stdout)\n"
            ),
            "timeout_seconds": 60.0,
        }
    ],
    "test_cases": [],
}


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield an instance whose word count workflow, and a brief slow one, are in production."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.open(database) as opened:
        opened.tools.import_document(json.dumps(TOOL))
        opened.tools.import_document(json.dumps(BRIEF_TOOL))
        opened.workflows.import_document(json.dumps(counting()))
        opened.workflows.import_document(
            json.dumps(counting(BRIEF_WORKFLOW_ID, BRIEF_STEP_ID, "brief_count", "process"))
        )
        opened.production.promote(UUID(WORKFLOW_ID))
        opened.production.promote(UUID(BRIEF_WORKFLOW_ID))
        yield opened


@pytest.fixture
def client(
    instance: api.Azathoth,
    tmp_path: Path,
) -> TestClient:
    """Return a signed-in client of the editor's server."""

    return signed_in(instance, tmp_path)


def invoke(
    client: TestClient,
    body: object,
) -> Any:
    """Start an invocation as the web app does, and return the response."""

    return client.post("/api/live/invocations", content=json.dumps(body), headers=POSTED)


def invoked(
    client: TestClient,
    body: object,
) -> str:
    """Start an invocation, and return its live run's handle."""

    response = invoke(client, body)

    assert response.status_code == 201, response.text

    handle: str = response.json()["handle"]

    return handle


def test_an_invocation_runs_through_production_and_streams_to_its_end(
    client: TestClient,
) -> None:
    response = invoke(client, {"workflow_id": WORKFLOW_ID, "input": "one two three"})

    assert response.status_code == 201
    assert response.json()["kind"] == "invocation"

    handle = response.json()["handle"]
    state = finished(client, handle)
    messages = stream(client, handle)

    assert state["state"] == "finished"
    assert state["result"]["status"] == "succeeded"
    assert state["result"]["result"] == {"result": 3}
    assert state["invocation_id"] == state["result"]["invocation_id"]
    assert [event for _, event, _ in messages][-1] == "end"
    assert messages[0][2]["type"] == "run_started"


def test_the_editors_invocation_is_recorded_as_the_editors(
    client: TestClient,
    instance: api.Azathoth,
) -> None:
    handle = invoked(client, {"workflow_id": WORKFLOW_ID, "input": "a"})
    state = finished(client, handle)

    detail = instance.invocations.get(UUID(state["invocation_id"]))

    assert detail.caller_metadata == EDITOR_CALLER
    assert EDITOR_CALLER == {"client": "azathoth-ui"}


def test_an_invocation_under_a_used_key_replays_its_outcome(
    client: TestClient,
) -> None:
    keyed = {"workflow_id": WORKFLOW_ID, "input": "a b", "idempotency_key": "k"}
    first = finished(client, invoked(client, keyed))
    again = finished(client, invoked(client, keyed))

    assert first["result"]["idempotency_key"] == "k"
    assert again["result"]["replayed"] is True
    assert again["invocation_id"] == first["invocation_id"]


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"input": "a"}, "workflow_id must be a workflow id."),
        ({"workflow_id": WORKFLOW_ID, "idempotency_key": 7}, "idempotency_key must be text."),
        ({"workflow_id": WORKFLOW_ID, "caller": "me"}, "not caller"),
    ],
    ids=["no workflow", "a key not text", "a field it does not take"],
)
def test_an_invocation_it_cannot_read_is_refused(
    client: TestClient,
    body: object,
    message: str,
) -> None:
    response = invoke(client, body)

    assert response.status_code == 422
    assert message in response.json()["error"]["message"]


def test_an_unknown_workflow_is_not_invoked(
    client: TestClient,
) -> None:
    response = invoke(client, {"workflow_id": MISSING_ID, "input": "a"})

    assert response.status_code == 404
    assert client.get("/api/live").json() == {"items": []}


def test_a_cancelled_invocation_is_resumed_as_a_live_run(
    client: TestClient,
) -> None:
    handle = invoked(client, {"workflow_id": BRIEF_WORKFLOW_ID, "input": "x"})
    running(client, handle)
    client.post(f"/api/live/{handle}/cancel", headers={"origin": ORIGIN})

    cancelled = finished(client, handle)

    assert cancelled["state"] == "cancelled"

    listed = client.get(f"/api/workflows/{BRIEF_WORKFLOW_ID}/invocations").json()["items"]
    invocation_id = listed[0]["invocation_id"]

    assert listed[0]["status"] == "incomplete"

    response = client.post(
        f"/api/live/invocations/{invocation_id}/resume", headers={"origin": ORIGIN}
    )

    assert response.status_code == 201
    assert response.json()["kind"] == "invocation"
    assert response.json()["invocation_id"] == invocation_id

    resumed = finished(client, response.json()["handle"])

    assert resumed["state"] == "finished"
    assert resumed["result"]["status"] == "succeeded"
    assert resumed["result"]["result"] == {"result": 7}


def test_a_completed_invocation_is_not_resumed(
    client: TestClient,
) -> None:
    state = finished(client, invoked(client, {"workflow_id": WORKFLOW_ID, "input": "a"}))

    response = client.post(
        f"/api/live/invocations/{state['invocation_id']}/resume", headers={"origin": ORIGIN}
    )

    assert response.status_code == 409
    assert response.json()["error"]["message"] == (
        f"Invocation {state['invocation_id']} has already completed."
    )


def test_an_unknown_invocation_is_not_resumed(
    client: TestClient,
) -> None:
    missing = client.post(f"/api/live/invocations/{MISSING_ID}/resume", headers={"origin": ORIGIN})
    malformed = client.post("/api/live/invocations/abc/resume", headers={"origin": ORIGIN})

    assert missing.status_code == 404
    assert malformed.status_code == 422
