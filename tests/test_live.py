"""Tests of live runs: started from the editor, watched as they run, and cancelled (ADR 0007)."""

import base64
import json
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from starlette.testclient import TestClient

from azathoth_ui.app import build_app
from azathoth_ui.live import DOCUMENT_MESSAGE, MAX_START_BYTES, TOO_LARGE_MESSAGE, LiveRuns
from tests.test_app import ORIGIN, PORT, TOKEN
from tests.test_browsing import TOOL

WORKFLOW_ID = "c1000000-0000-4000-8000-000000000001"

STEP_ID = "c1000000-0000-4000-8000-000000000002"

SLOW_TOOL_ID = "d7000000-0000-4000-8000-000000000001"

SLOW_WORKFLOW_ID = "c1000000-0000-4000-8000-000000000003"

SLOW_STEP_ID = "c1000000-0000-4000-8000-000000000004"

MISSING_ID = "00000000-0000-4000-8000-000000000000"

WAIT_SECONDS = 20.0


def counting(
    workflow_id: str = WORKFLOW_ID,
    step_id: str = STEP_ID,
    tool: str = "count_words",
    runtime: str = "python",
) -> dict[str, Any]:
    """Return a workflow that counts the words of its input with one tool."""

    return {
        "metadata": {
            "id": workflow_id,
            "name": "count",
            "description": "Count the words of the input.",
            "version": "1.0.0",
        },
        "steps": [
            {
                "id": step_id,
                "specification": {
                    "requirement": {"name": tool, "version": "1.0.0", "runtime": runtime},
                },
                "inputs": [
                    {
                        "name": "text",
                        "source": {"event_type": "workflow.input.received", "field_name": "input"},
                    }
                ],
                "outputs": [{"name": "count", "path": ["count"]}],
            }
        ],
        "result": {"name": "count"},
    }


SLOW_TOOL: dict[str, Any] = {
    "definition": {
        **TOOL["definition"],
        "id": SLOW_TOOL_ID,
        "name": "slow_count",
    },
    "implementations": [
        {
            "id": "d7000000-0000-4000-8000-000000000002",
            "tool_id": SLOW_TOOL_ID,
            "tool_version": "1.0.0",
            "version": "1.0.0",
            "runtime": "process",
            "command": [sys.executable],
            "source": "import time\n\ntime.sleep(30)\n",
            "timeout_seconds": 60.0,
        }
    ],
    "test_cases": [],
}


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield an instance holding a word count workflow and a slow one, closed afterwards."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.open(database) as opened:
        opened.tools.import_document(json.dumps(TOOL))
        opened.tools.import_document(json.dumps(SLOW_TOOL))
        opened.workflows.import_document(json.dumps(counting()))
        opened.workflows.import_document(
            json.dumps(counting(SLOW_WORKFLOW_ID, SLOW_STEP_ID, "slow_count", "process"))
        )
        yield opened


def signed_in(
    instance: api.Azathoth,
    tmp_path: Path,
    live: LiveRuns | None = None,
) -> TestClient:
    """Return a signed-in client of an editor keeping its live runs in `live`."""

    app = build_app(
        instance,
        token=TOKEN,
        port=PORT,
        static_dir=tmp_path / "missing",
        live=live,
    )
    client = TestClient(app, base_url=ORIGIN, follow_redirects=False)

    assert client.get(f"/?token={TOKEN}").status_code == 303

    return client


@pytest.fixture
def client(
    instance: api.Azathoth,
    tmp_path: Path,
) -> TestClient:
    """Return a signed-in client of the editor's server."""

    return signed_in(instance, tmp_path)


def start(
    client: TestClient,
    body: object,
) -> Any:
    """Start a run as the web app does, and return the response."""

    return client.post(
        "/api/live/runs",
        content=json.dumps(body),
        headers={"origin": ORIGIN, "content-type": "application/json"},
    )


def started(
    client: TestClient,
    body: object,
) -> str:
    """Start a run, and return its handle."""

    response = start(client, body)

    assert response.status_code == 201, response.text

    handle: str = response.json()["handle"]

    return handle


def finished(
    client: TestClient,
    handle: str,
) -> Any:
    """Wait for a live run to finish, and return what the editor says of it."""

    deadline = time.monotonic() + WAIT_SECONDS

    while time.monotonic() < deadline:
        state = client.get(f"/api/live/{handle}").json()

        if state["state"] != "running":
            return state

        time.sleep(0.02)

    raise AssertionError(f"Live run {handle} did not finish.")


def running(
    client: TestClient,
    handle: str,
) -> None:
    """Wait for a live run's first step to start: a run's second event, a tried step's first."""

    deadline = time.monotonic() + WAIT_SECONDS

    while time.monotonic() < deadline:
        state = client.get(f"/api/live/{handle}").json()

        if state["event_count"] >= (1 if state["kind"] == "step" else 2):
            return

        time.sleep(0.02)

    raise AssertionError(f"Live run {handle} never started a step.")


def stream(
    client: TestClient,
    handle: str,
    *,
    headers: dict[str, str] | None = None,
    query: str = "",
) -> list[tuple[str | None, str, Any]]:
    """Read a live run's event stream to its end, as (id, event, data) triples."""

    messages: list[tuple[str | None, str, Any]] = []

    with client.stream("GET", f"/api/live/{handle}/events{query}", headers=headers) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["cache-control"] == "no-store"

        fields: dict[str, str] = {}

        for line in response.iter_lines():
            if line.startswith(":"):
                continue

            if line == "":
                if fields:
                    messages.append((fields.get("id"), fields["event"], json.loads(fields["data"])))
                    fields = {}
                continue

            name, _, value = line.partition(": ")
            fields[name] = value

    return messages


def file(
    content: bytes,
    media_type: str,
) -> dict[str, str]:
    """Return a file as the web app sends one."""

    return {"media_type": media_type, "content": base64.b64encode(content).decode("ascii")}


def kept(
    state: Any,
) -> UUID:
    """Return the kept run a finished live run names."""

    return UUID(state["result"]["run_id"])


def refused(
    response: Any,
    status: int,
    code: str,
) -> str:
    """Assert a refusal's status and code, and return its message."""

    assert response.status_code == status, response.text

    error = response.json()["error"]

    assert error["code"] == code

    message: str = error["message"]

    return message


#
# Starting and watching a run
#


def test_a_run_is_started_and_its_events_streamed_to_its_end(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    response = start(client, {"workflow_id": WORKFLOW_ID, "input": "that is not dead"})

    assert response.status_code == 201

    handle = response.json()["handle"]

    assert response.json()["kind"] == "run"
    assert response.json()["workflow_id"] == WORKFLOW_ID
    assert response.json()["step_id"] is None

    messages = stream(client, handle)

    assert [(number, event, data["type"]) for number, event, data in messages[:-1]] == [
        ("1", "run_event", "run_started"),
        ("2", "run_event", "step_started"),
        ("3", "run_event", "step_finished"),
        ("4", "run_event", "context_changed"),
        ("5", "run_event", "run_finished"),
    ]
    assert messages[3][2]["values"] == {"count": 4}

    number, event, end = messages[-1]

    assert (number, event) == (None, "end")
    assert end["state"] == "finished"
    assert end["event_count"] == 5
    assert end["error"] is None
    assert end["result"]["succeeded"] is True
    assert end["result"]["result"] == 4
    assert instance.runs.get(kept(end)).succeeded


def test_a_finished_run_is_described_with_its_result(
    client: TestClient,
) -> None:
    handle = started(client, {"workflow_id": WORKFLOW_ID, "input": "one two"})

    state = finished(client, handle)

    assert state["handle"] == handle
    assert state["state"] == "finished"
    assert state["event_count"] == 5
    assert state["result"]["result"] == 2
    assert state["started_at"] <= state["finished_at"]


def test_a_stream_resumes_after_the_last_event_seen(
    client: TestClient,
) -> None:
    handle = started(client, {"workflow_id": WORKFLOW_ID, "input": "one"})
    finished(client, handle)

    by_header = stream(client, handle, headers={"last-event-id": "3"})
    by_query = stream(client, handle, query="?after=4")

    assert [number for number, _, _ in by_header] == ["4", "5", None]
    assert [number for number, _, _ in by_query] == ["5", None]


def test_a_position_that_is_not_a_whole_number_is_refused(
    client: TestClient,
) -> None:
    handle = started(client, {"workflow_id": WORKFLOW_ID, "input": "one"})

    message = refused(client.get(f"/api/live/{handle}/events?after=two"), 422, "invalid_argument")

    assert message == "after must be a whole number, not 'two'."


def test_a_run_given_null_is_given_input_and_one_given_none_is_not(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    given = finished(client, started(client, {"workflow_id": WORKFLOW_ID, "input": None}))
    without = finished(client, started(client, {"workflow_id": WORKFLOW_ID}))

    assert instance.runs.get(kept(given)).has_input
    assert not instance.runs.get(kept(without)).has_input


def test_a_file_is_a_runs_input(
    client: TestClient,
) -> None:
    body = {"workflow_id": WORKFLOW_ID, "file": file(b"one two three", "text/plain")}

    state = finished(client, started(client, body))

    assert state["result"]["result"] == 3


def test_live_runs_are_listed_newest_first(
    client: TestClient,
) -> None:
    first = started(client, {"workflow_id": WORKFLOW_ID, "input": "one"})
    finished(client, first)
    second = started(client, {"workflow_id": WORKFLOW_ID, "input": "one two"})
    finished(client, second)

    listed = client.get("/api/live").json()["items"]

    assert [run["handle"] for run in listed] == [second, first]


#
# Refusals
#


def test_a_run_refused_once_it_started_says_why_it_ended(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.workflows.import_document(
        json.dumps(counting(tool="missing_tool")),
    )

    state = finished(client, started(client, {"workflow_id": WORKFLOW_ID, "input": "one"}))

    assert state["state"] == "refused"
    assert state["result"] is None
    assert state["error"]["code"] == "run_not_started"


def test_a_file_that_is_not_its_media_type_ends_the_run_refused(
    client: TestClient,
) -> None:
    body = {"workflow_id": WORKFLOW_ID, "file": file(b"not a pdf", "application/pdf")}

    state = finished(client, started(client, body))

    assert state["state"] == "refused"
    assert state["error"]["code"] == "invalid_argument"


def test_a_workflow_that_is_not_configured_is_not_started(
    client: TestClient,
) -> None:
    message = refused(start(client, {"workflow_id": MISSING_ID, "input": 1}), 404, "not_found")

    assert message == f"Workflow {MISSING_ID} is not configured."
    assert client.get("/api/live").json() == {"items": []}


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"input": "x"}, "workflow_id must be a workflow id."),
        ({"workflow_id": "nope"}, "workflow_id must be a workflow id."),
        (
            {"workflow_id": WORKFLOW_ID, "input": "x", "file": file(b"x", "text/plain")},
            "Give a run input or a file, not both.",
        ),
        (
            {"workflow_id": WORKFLOW_ID, "file": {"media_type": "text/plain", "content": "%%"}},
            "file.content must be base64.",
        ),
        (
            {"workflow_id": WORKFLOW_ID, "file": {"content": ""}},
            'file must be {"media_type", "content"}, its content in base64.',
        ),
        (
            {"workflow_id": WORKFLOW_ID, "surprise": True},
            "A run takes workflow_id, input and file, not surprise.",
        ),
        ([], 'Send a JSON object, such as {"workflow_id": ..., "input": ...}.'),
    ],
)
def test_a_start_that_cannot_be_read_is_refused(
    client: TestClient,
    body: object,
    message: str,
) -> None:
    assert refused(start(client, body), 422, "invalid_argument") == message


def test_a_start_that_is_not_json_is_refused(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/live/runs",
        content=b"workflow_id=1",
        headers={"origin": ORIGIN, "content-type": "application/x-www-form-urlencoded"},
    )

    assert refused(response, 415, "unsupported_media_type") == "Send the run as application/json."


def test_a_start_larger_than_the_limit_is_refused(
    client: TestClient,
) -> None:
    padding = "x" * MAX_START_BYTES
    response = start(client, {"workflow_id": WORKFLOW_ID, "input": padding})

    assert refused(response, 413, "request_too_large") == (
        "A run's input may be at most 10 MB, or 14 MB as it is sent."
    )


def test_a_start_declared_too_large_is_refused_without_reading_it(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/live/runs",
        content=b"{}",
        headers={
            "origin": ORIGIN,
            "content-type": "application/json",
            "content-length": str(MAX_START_BYTES + 1),
        },
    )

    assert refused(response, 413, "request_too_large") == TOO_LARGE_MESSAGE


def test_an_unknown_live_run_is_not_found(
    client: TestClient,
) -> None:
    message = refused(client.get("/api/live/nope"), 404, "not_found")

    assert message == "No live run nope is known; it may have finished long ago."
    assert client.get("/api/live/nope/events").status_code == 404


#
# Cancelling, and how many runs at once
#


def test_a_run_is_cancelled(
    client: TestClient,
) -> None:
    handle = started(client, {"workflow_id": SLOW_WORKFLOW_ID, "input": "x"})
    running(client, handle)

    response = client.post(f"/api/live/{handle}/cancel", headers={"origin": ORIGIN})

    assert response.status_code == 202

    state = finished(client, handle)

    assert state["state"] == "cancelled"
    assert state["error"]["code"] == "run_cancelled"
    assert stream(client, handle)[-1][2]["state"] == "cancelled"


def test_cancelling_a_finished_run_changes_nothing(
    client: TestClient,
) -> None:
    handle = started(client, {"workflow_id": WORKFLOW_ID, "input": "one"})
    finished(client, handle)

    response = client.post(f"/api/live/{handle}/cancel", headers={"origin": ORIGIN})

    assert response.status_code == 202
    assert response.json()["state"] == "finished"


def test_no_more_runs_than_the_limit_run_at_once(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = signed_in(instance, tmp_path, LiveRuns(max_running=1))
    handle = started(client, {"workflow_id": SLOW_WORKFLOW_ID, "input": "x"})

    message = refused(
        start(client, {"workflow_id": WORKFLOW_ID, "input": "x"}), 429, "too_many_runs"
    )

    assert message == (
        "1 run is already running, as many as the editor runs at once; "
        "wait for one to finish, or cancel one."
    )

    client.post(f"/api/live/{handle}/cancel", headers={"origin": ORIGIN})
    finished(client, handle)

    assert start(client, {"workflow_id": WORKFLOW_ID, "input": "x"}).status_code == 201


def test_only_the_newest_finished_runs_are_remembered(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = signed_in(instance, tmp_path, LiveRuns(keep_finished=1))
    first = started(client, {"workflow_id": WORKFLOW_ID, "input": "one"})
    finished(client, first)
    second = started(client, {"workflow_id": WORKFLOW_ID, "input": "two"})
    finished(client, second)

    assert client.get(f"/api/live/{first}").status_code == 404
    assert client.get(f"/api/live/{second}").status_code == 200


def test_starting_and_cancelling_need_this_servers_origin(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/live/runs",
        content=json.dumps({"workflow_id": WORKFLOW_ID}),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 403
    assert client.post("/api/live/nope/cancel").status_code == 403


#
# Trying one step
#


def try_step(
    client: TestClient,
    body: object,
) -> Any:
    """Start trying one step, as the web app does, and return the response."""

    return client.post(
        "/api/live/steps",
        content=json.dumps(body),
        headers={"origin": ORIGIN, "content-type": "application/json"},
    )


def test_a_step_is_tried_alone_and_watched_as_it_runs(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    document = counting(workflow_id=MISSING_ID)
    response = try_step(
        client,
        {"document": document, "step_id": STEP_ID, "inputs": {"text": "one two three"}},
    )

    assert response.status_code == 201
    assert response.json()["kind"] == "step"
    assert response.json()["workflow_id"] == MISSING_ID
    assert response.json()["step_id"] == STEP_ID

    messages = stream(client, response.json()["handle"])

    assert [data["type"] for _, event, data in messages if event == "run_event"] == [
        "step_started",
        "step_finished",
        "context_changed",
    ]

    end = messages[-1][2]

    assert end["state"] == "finished"
    assert end["result"]["step"]["values"] == {"count": 3}
    assert end["result"]["warnings"] == []
    assert instance.runs.list(UUID(WORKFLOW_ID)) == ()


def test_a_tried_step_reads_the_runs_input_given(
    client: TestClient,
) -> None:
    body = {"document": counting(), "step_id": STEP_ID, "input": "one two"}

    state = finished(client, try_step(client, body).json()["handle"])

    assert state["result"]["step"]["values"] == {"count": 2}


def test_a_tried_step_is_given_files_as_inputs_and_as_the_runs_input(
    client: TestClient,
) -> None:
    by_input = {
        "document": counting(),
        "step_id": STEP_ID,
        "files": {"text": file(b"one two three", "text/plain")},
    }
    by_run = {"document": counting(), "step_id": STEP_ID, "file": file(b"one", "text/plain")}

    assert finished(client, try_step(client, by_input).json()["handle"])["result"]["step"][
        "values"
    ] == {"count": 3}
    assert finished(client, try_step(client, by_run).json()["handle"])["result"]["step"][
        "values"
    ] == {"count": 1}


def test_a_step_azathoth_refuses_to_try_ends_refused(
    client: TestClient,
) -> None:
    body = {"document": counting(), "step_id": MISSING_ID}

    state = finished(client, try_step(client, body).json()["handle"])

    assert state["state"] == "refused"
    assert state["error"] == {
        "code": "not_found",
        "message": f"The workflow document has no step {MISSING_ID}.",
    }


def test_a_tried_step_is_cancelled(
    client: TestClient,
) -> None:
    body = {
        "document": counting(SLOW_WORKFLOW_ID, SLOW_STEP_ID, "slow_count", "process"),
        "step_id": SLOW_STEP_ID,
        "inputs": {"text": "x"},
    }
    handle = try_step(client, body).json()["handle"]
    running(client, handle)

    client.post(f"/api/live/{handle}/cancel", headers={"origin": ORIGIN})

    assert finished(client, handle)["state"] == "cancelled"


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"step_id": STEP_ID}, DOCUMENT_MESSAGE),
        (
            {"document": [], "step_id": STEP_ID},
            "document must be a workflow document, as a JSON object.",
        ),
        (
            {"document": {"metadata": {}}, "step_id": STEP_ID},
            "document's metadata.id must be a workflow id.",
        ),
        ({"document": counting(), "step_id": "nope"}, "step_id must be a step id."),
        (
            {"document": counting(), "step_id": STEP_ID, "inputs": []},
            "inputs must be a JSON object of values by input name.",
        ),
        (
            {"document": counting(), "step_id": STEP_ID, "files": {"text": "x"}},
            'files.text must be {"media_type", "content"}, its content in base64.',
        ),
        (
            {
                "document": counting(),
                "step_id": STEP_ID,
                "inputs": {"text": "a"},
                "files": {"text": file(b"b", "text/plain")},
            },
            "Give input 'text' as a value or a file, not both.",
        ),
        (
            {
                "document": counting(),
                "step_id": STEP_ID,
                "input": 1,
                "file": file(b"b", "text/plain"),
            },
            "Give a run input or a file, not both.",
        ),
        (
            {"document": counting(), "step_id": STEP_ID, "surprise": 1},
            "A step to try takes document, step_id, inputs, files, input and file, not surprise.",
        ),
    ],
)
def test_a_step_to_try_that_cannot_be_read_is_refused(
    client: TestClient,
    body: object,
    message: str,
) -> None:
    assert refused(try_step(client, body), 422, "invalid_argument") == message


def test_trying_a_step_needs_this_servers_origin(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/live/steps",
        content=json.dumps({"document": counting(), "step_id": STEP_ID}),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 403
