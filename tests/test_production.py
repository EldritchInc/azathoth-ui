"""Tests of production through the editor's server: what runs, promotions, rollbacks (ADR 0010)."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from starlette.testclient import TestClient

from tests.test_app import ORIGIN
from tests.test_browsing import TOOL
from tests.test_live import MISSING_ID, WORKFLOW_ID, counting, signed_in

POSTED = {"origin": ORIGIN, "content-type": "application/json"}


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield an instance holding a word count workflow, not in production, closed afterwards."""

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


def post(
    client: TestClient,
    path: str,
    body: object,
) -> Any:
    """Send one JSON change to the server, from the editor's own page."""

    return client.post(path, content=json.dumps(body), headers=POSTED)


def revise(
    instance: api.Azathoth,
) -> None:
    """Import a second revision of the word count workflow, with another description."""

    changed = counting()
    changed["metadata"]["description"] = "Count every word of the input."
    instance.workflows.import_document(json.dumps(changed))


# What production runs


def test_a_workflow_not_in_production_has_none(
    client: TestClient,
) -> None:
    response = client.get(f"/api/workflows/{WORKFLOW_ID}/production")

    assert response.status_code == 200
    assert response.json() == {"production": None}
    assert client.get(f"/api/workflows/{WORKFLOW_ID}/production/revisions").json() == {"items": []}


def test_an_unknown_workflow_has_no_production(
    client: TestClient,
) -> None:
    response = client.get(f"/api/workflows/{MISSING_ID}/production")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_a_workflow_id_must_be_one(
    client: TestClient,
) -> None:
    response = client.get("/api/workflows/abc/production")

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "'abc' is not a workflow id."


# Promoting


def test_a_promotion_answers_with_its_revision_and_production_runs_it(
    client: TestClient,
) -> None:
    response = post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {})

    assert response.status_code == 201

    promoted = response.json()
    production = client.get(f"/api/workflows/{WORKFLOW_ID}/production").json()["production"]

    assert promoted["active"] is True
    assert promoted["workflow_revision"] == 1
    assert promoted["author"] is not None
    assert production["revision"] == promoted
    assert production["command"] == f"azathoth workflow production {WORKFLOW_ID}"


def test_promoting_a_missing_experiments_winner_is_not_found(
    client: TestClient,
) -> None:
    response = post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {"experiment_id": MISSING_ID})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "experiment_not_found"
    assert client.get(f"/api/workflows/{WORKFLOW_ID}/production").json() == {"production": None}


@pytest.mark.parametrize(
    "body",
    [[], {"experiment_id": 7}, {"experiment_id": "x"}],
    ids=["not an object", "not text", "not an id"],
)
def test_a_promotion_refuses_a_body_it_cannot_read(
    client: TestClient,
    body: object,
) -> None:
    response = post(client, f"/api/workflows/{WORKFLOW_ID}/promote", body)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_argument"


# Its history, and rolling back


def test_revisions_are_newest_first_with_the_active_one_marked(
    client: TestClient,
    instance: api.Azathoth,
) -> None:
    first = post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {}).json()
    revise(instance)
    second = post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {}).json()

    revisions = client.get(f"/api/workflows/{WORKFLOW_ID}/production/revisions").json()["items"]
    newest = client.get(f"/api/workflows/{WORKFLOW_ID}/production/revisions?limit=1").json()

    assert [revision["revision_id"] for revision in revisions] == [
        second["revision_id"],
        first["revision_id"],
    ]
    assert [revision["active"] for revision in revisions] == [True, False]
    assert [revision["revision_id"] for revision in newest["items"]] == [second["revision_id"]]


def test_a_rollback_restores_the_previous_promotion(
    client: TestClient,
    instance: api.Azathoth,
) -> None:
    first = post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {}).json()
    revise(instance)
    post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {})

    response = post(client, f"/api/workflows/{WORKFLOW_ID}/rollback", {})

    assert response.status_code == 201
    assert response.json()["restores"] == first["revision_id"]
    assert response.json()["workflow_revision"] == 1


def test_a_rollback_to_a_named_revision(
    client: TestClient,
    instance: api.Azathoth,
) -> None:
    first = post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {}).json()
    revise(instance)
    post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {})

    response = post(client, f"/api/workflows/{WORKFLOW_ID}/rollback", {"to": first["revision_id"]})

    assert response.status_code == 201
    assert response.json()["restores"] == first["revision_id"]


def test_a_rollback_with_nothing_earlier_is_a_conflict(
    client: TestClient,
) -> None:
    post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {})

    response = post(client, f"/api/workflows/{WORKFLOW_ID}/rollback", {})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "nothing_to_roll_back_to"


def test_a_rollback_refuses_a_revision_it_cannot_read(
    client: TestClient,
) -> None:
    response = post(client, f"/api/workflows/{WORKFLOW_ID}/rollback", {"to": "x"})

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "'x' is not a production revision id."


# Invocations


def test_a_workflows_invocations_and_one_invocation_are_read_back(
    client: TestClient,
    instance: api.Azathoth,
) -> None:
    post(client, f"/api/workflows/{WORKFLOW_ID}/promote", {})
    outcome = instance.runs.invoke(
        UUID(WORKFLOW_ID), input="one two", caller_metadata={"client": "test"}
    )

    listed = client.get(f"/api/workflows/{WORKFLOW_ID}/invocations").json()["items"]
    detail = client.get(f"/api/invocations/{outcome.invocation_id}")

    assert [invocation["invocation_id"] for invocation in listed] == [str(outcome.invocation_id)]
    assert listed[0]["status"] == "succeeded"
    assert listed[0]["caller_metadata"] == {"client": "test"}
    assert detail.status_code == 200
    assert detail.json()["result"] == {"result": 2}
    assert detail.json()["input"] == "one two"


def test_a_workflow_never_invoked_lists_none(
    client: TestClient,
) -> None:
    assert client.get(f"/api/workflows/{WORKFLOW_ID}/invocations?limit=5").json() == {"items": []}


def test_an_unknown_invocation_is_not_found(
    client: TestClient,
) -> None:
    missing = client.get(f"/api/invocations/{MISSING_ID}")
    malformed = client.get("/api/invocations/abc")

    assert missing.status_code == 404
    assert malformed.status_code == 422
    assert malformed.json()["error"]["message"] == "'abc' is not an invocation id."
