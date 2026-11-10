"""Tests of asking Azathoth about a document, and of reading the runs it kept (ADR 0007)."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from starlette.testclient import TestClient

from azathoth_ui.browsing import MAX_DOCUMENT_BYTES, TOO_LARGE_MESSAGE
from tests.test_app import ORIGIN
from tests.test_browsing import TOOL
from tests.test_live import (
    MISSING_ID,
    STEP_ID,
    WORKFLOW_ID,
    counting,
    signed_in,
)


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield an instance holding the word count tool and workflow, closed afterwards."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.open(database) as opened:
        opened.tools.import_document(json.dumps(TOOL))
        opened.workflows.import_document(json.dumps(counting()))
        yield opened


@pytest.fixture
def client(
    instance: api.Azathoth,
    tmp_path: Path,
) -> TestClient:
    """Return a signed-in client of the editor's server."""

    return signed_in(instance, tmp_path)


def ask(
    client: TestClient,
    path: str,
    document: object,
) -> Any:
    """Send a document to be judged, as the web app does."""

    return client.post(
        path,
        content=json.dumps(document) if not isinstance(document, bytes) else document,
        headers={"origin": ORIGIN, "content-type": "application/json"},
    )


#
# Checking a document
#


def test_a_valid_document_is_checked_and_nothing_is_saved(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    document = counting(workflow_id=MISSING_ID)

    response = ask(client, "/api/workflows/check", document)

    assert response.status_code == 200
    assert response.json() == {"valid": True, "problems": []}

    with pytest.raises(api.NotFoundError):
        instance.workflows.get(UUID(MISSING_ID))


def test_every_problem_is_named_with_its_location_and_step(
    client: TestClient,
) -> None:
    document = counting()
    document["metadata"]["version"] = 5
    document["steps"][0]["specification"]["requirement"]["name"] = ""

    response = ask(client, "/api/workflows/check", document)

    assert response.status_code == 200
    assert response.json() == {
        "valid": False,
        "problems": [
            {
                "message": "Input should be a valid string",
                "location": ["metadata", "version"],
                "step_id": None,
            },
            {
                "message": "String should have at least 1 character",
                "location": ["steps", 0, "specification", "requirement", "name"],
                "step_id": STEP_ID,
            },
        ],
    }


def test_text_that_is_not_json_is_one_problem(
    client: TestClient,
) -> None:
    response = ask(client, "/api/workflows/check", b"{not json")

    [problem] = response.json()["problems"]

    assert problem["message"].startswith("Invalid JSON")
    assert problem["location"] == []


def test_a_document_to_check_is_held_to_the_documents_limit(
    client: TestClient,
) -> None:
    response = ask(client, "/api/workflows/check", b"x" * (MAX_DOCUMENT_BYTES + 1))

    assert response.status_code == 413
    assert response.json()["error"]["message"] == TOO_LARGE_MESSAGE


def test_checking_needs_this_servers_origin(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workflows/check",
        content=json.dumps(counting()),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 403


#
# Whether a document could run here
#


def test_a_document_whose_steps_could_run_is_ready(
    client: TestClient,
) -> None:
    response = ask(client, "/api/workflows/readiness", counting())

    assert response.status_code == 200
    assert response.json()["ready"] is True

    [step] = response.json()["steps"]

    assert step["step_id"] == STEP_ID
    assert step["kind"] == "tool"
    assert step["ready"] is True
    assert step["tool_implementation_id"] is not None


def test_a_step_that_could_not_run_says_why(
    client: TestClient,
) -> None:
    response = ask(client, "/api/workflows/readiness", counting(tool="missing_tool"))

    [step] = response.json()["steps"]

    assert response.json()["ready"] is False
    assert step["ready"] is False
    assert step["problem"] == "No tool definition satisfies requirement 'missing_tool'."


def test_readiness_of_a_document_that_is_not_valid_is_refused(
    client: TestClient,
) -> None:
    response = ask(client, "/api/workflows/readiness", {"steps": "nope"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_document"


#
# The runs already made
#


def test_a_workflows_runs_are_listed_newest_first(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    first = instance.runs.run(UUID(WORKFLOW_ID), input=api.RunInput(payload="one"))
    second = instance.runs.run(UUID(WORKFLOW_ID), input=api.RunInput(payload="one two"))

    response = client.get(f"/api/workflows/{WORKFLOW_ID}/runs")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert [run["run_id"] for run in response.json()["items"]] == [
        str(second.run_id),
        str(first.run_id),
    ]

    limited = client.get(f"/api/workflows/{WORKFLOW_ID}/runs?limit=1").json()["items"]

    assert [run["run_id"] for run in limited] == [str(second.run_id)]


def test_a_kept_run_is_read_with_its_steps(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    ran = instance.runs.run(UUID(WORKFLOW_ID), input=api.RunInput(payload="one two"))

    response = client.get(f"/api/runs/{ran.run_id}")

    assert response.status_code == 200
    assert response.json() == instance.runs.get(ran.run_id).model_dump(mode="json")
    assert response.json()["steps"][0]["values"] == {"count": 2}


@pytest.mark.parametrize(
    ("path", "status", "code"),
    [
        (f"/api/workflows/{MISSING_ID}/runs", 404, "not_found"),
        ("/api/workflows/nope/runs", 422, "invalid_argument"),
        (f"/api/workflows/{WORKFLOW_ID}/runs?limit=many", 422, "invalid_argument"),
        (f"/api/workflows/{WORKFLOW_ID}/runs?limit=0", 422, "invalid_argument"),
        (f"/api/runs/{MISSING_ID}", 404, "not_found"),
    ],
)
def test_runs_that_cannot_be_read_are_refused(
    client: TestClient,
    path: str,
    status: int,
    code: str,
) -> None:
    response = client.get(path)

    assert response.status_code == status
    assert response.json()["error"]["code"] == code


def test_a_run_id_that_cannot_be_read_is_refused(
    client: TestClient,
) -> None:
    response = client.get("/api/runs/nope")

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "'nope' is not a run id."
