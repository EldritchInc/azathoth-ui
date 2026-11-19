"""Tests of judges and a run's evidence through the editor's server (ADR 0012)."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from azathoth.persistence.repositories import open_repositories
from azathoth.providers import ProviderModel
from starlette.testclient import TestClient

from azathoth_ui.app import ERROR_STATUSES
from tests.test_app import ORIGIN
from tests.test_browsing import TOOL
from tests.test_live import MISSING_ID, WORKFLOW_ID, counting, finished, kept, running, signed_in
from tests.test_live_invocations import (
    BRIEF_STEP_ID,
    BRIEF_TOOL,
    BRIEF_WORKFLOW_ID,
    POSTED,
)

LARGE = ProviderModel(provider="openrouter", model="acme/large", display_name="Large")

SMALL = ProviderModel(provider="openrouter", model="acme/small", display_name="Small")


class Served:
    """A provider that serves a few models, as Azathoth asks one."""

    def __init__(
        self,
        *models: ProviderModel,
    ) -> None:
        self._models = models

    @property
    def provider(
        self,
    ) -> str:
        """Return the provider these models are served by."""

        return "openrouter"

    async def models(
        self,
    ) -> tuple[ProviderModel, ...]:
        """Return every model served."""

        return self._models

    async def model(
        self,
        identifier: str,
    ) -> ProviderModel | None:
        """Return one model served, by its name at the provider."""

        return next((model for model in self._models if model.model == identifier), None)


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield an instance whose word count workflow and a brief slow one run here, closed after."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.Azathoth(open_repositories(database), directories=(Served(LARGE, SMALL),)) as opened:
        opened.tools.import_document(json.dumps(TOOL))
        opened.tools.import_document(json.dumps(BRIEF_TOOL))
        opened.workflows.import_document(json.dumps(counting()))
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
    body: object,
) -> Any:
    """Post a JSON body as the web app does, and return the response."""

    return client.post(path, content=json.dumps(body), headers=POSTED)


def counted(
    instance: api.Azathoth,
) -> UUID:
    """Run the word count workflow, and return the run Azathoth kept."""

    return instance.runs.run(UUID(WORKFLOW_ID), input=api.RunInput(payload="one two")).run_id


def test_a_run_that_cannot_be_resumed_is_409_and_content_unavailable_502() -> None:
    statuses = dict(ERROR_STATUSES)

    assert statuses[api.ContentUnavailableError] == 502
    assert issubclass(api.RunNotResumableError, api.ConflictError)


#
# Judges
#


def test_the_rotation_is_kept_in_order(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.portfolio.add(LARGE.identifier)
    instance.portfolio.add(SMALL.identifier)

    assert client.get("/api/judges").json() == {"items": []}

    first = post(client, "/api/judges", {"identifier": SMALL.identifier})
    post(client, "/api/judges", {"identifier": LARGE.identifier})

    assert first.status_code == 201
    assert first.json()["position"] == 1
    assert [
        (judge["identifier"], judge["position"])
        for judge in client.get("/api/judges").json()["items"]
    ] == [(SMALL.identifier, 1), (LARGE.identifier, 2)]

    removed = post(client, "/api/judges/remove", {"identifier": SMALL.identifier})

    assert removed.status_code == 200
    assert removed.json()["identifier"] == SMALL.identifier
    assert [judge["position"] for judge in client.get("/api/judges").json()["items"]] == [1]


def test_a_judge_must_be_authorized_and_is_added_once(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    refused = post(client, "/api/judges", {"identifier": LARGE.identifier})

    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "model_not_authorized"

    instance.portfolio.add(LARGE.identifier)
    post(client, "/api/judges", {"identifier": LARGE.identifier})
    again = post(client, "/api/judges", {"identifier": LARGE.identifier})

    assert again.status_code == 409
    assert again.json()["error"]["code"] == "conflict"


def test_a_model_that_is_not_served_or_not_a_judge_is_not_found(
    client: TestClient,
) -> None:
    added = post(client, "/api/judges", {"identifier": "openrouter/acme/gone"})
    removed = post(client, "/api/judges/remove", {"identifier": LARGE.identifier})

    assert (added.status_code, removed.status_code) == (404, 404)
    assert removed.json()["error"]["message"] == (
        f"Judge {LARGE.identifier!r} is not in the rotation."
    )


@pytest.mark.parametrize("body", [{}, {"identifier": ""}, {"identifier": 3}])
def test_a_judge_is_named_by_its_identifier(
    client: TestClient,
    body: object,
) -> None:
    response = post(client, "/api/judges", body)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_argument"


#
# Feedback
#


def test_a_judgment_is_recorded_and_read_newest_first(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    run_id = counted(instance)

    good = post(client, f"/api/runs/{run_id}/feedback", {"disposition": "good"})
    bad = post(
        client,
        f"/api/runs/{run_id}/feedback",
        {"disposition": "bad", "reason": "It counted wrong.", "corrected_output": {"count": 3}},
    )

    assert (good.status_code, bad.status_code) == (201, 201)
    assert bad.json()["corrected_output"] == {"count": 3}

    listed = client.get(f"/api/runs/{run_id}/feedback").json()["items"]

    assert [judgment["disposition"] for judgment in listed] == ["bad", "good"]
    assert client.get(f"/api/runs/{run_id}").json()["feedback"] == "bad"


def test_a_judgment_azathoth_refuses_is_refused(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    run_id = counted(instance)

    no_reason = post(client, f"/api/runs/{run_id}/feedback", {"disposition": "bad"})
    corrected = post(
        client, f"/api/runs/{run_id}/feedback", {"disposition": "good", "corrected_output": 1}
    )
    unknown = post(client, f"/api/runs/{MISSING_ID}/feedback", {"disposition": "good"})

    assert no_reason.status_code == 422
    assert no_reason.json()["error"]["message"] == "Bad workflow run feedback requires a reason."
    assert corrected.status_code == 422
    assert unknown.status_code == 404


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({}, "disposition must be good or bad."),
        ({"disposition": "good", "reason": 3}, "reason must be text."),
        (
            {"disposition": "good", "more": 1},
            "A judgment takes disposition, reason and corrected_output, not more.",
        ),
    ],
)
def test_a_judgment_that_cannot_be_read_is_refused(
    instance: api.Azathoth,
    client: TestClient,
    body: object,
    message: str,
) -> None:
    run_id = counted(instance)

    response = post(client, f"/api/runs/{run_id}/feedback", body)

    assert response.status_code == 422
    assert response.json()["error"]["message"] == message
    assert client.get(f"/api/runs/{run_id}/feedback").json() == {"items": []}


#
# Annotations and children
#


def test_a_run_with_no_cited_step_has_an_empty_collection(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    run_id = counted(instance)

    response = client.get(f"/api/runs/{run_id}/annotations")

    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["collection"]["total"] == 0
    assert client.get(f"/api/runs/{MISSING_ID}/annotations").status_code == 404
    assert client.get(f"/api/invocations/{MISSING_ID}/annotations").status_code == 404


def test_a_run_that_started_nothing_has_no_children(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    run_id = counted(instance)

    assert client.get(f"/api/runs/{run_id}/children").json() == {"items": []}
    assert client.get(f"/api/runs/{MISSING_ID}/children").status_code == 404


#
# Interrupted runs, and resuming one
#


def interrupted(
    client: TestClient,
) -> str:
    """Start the brief workflow, cancel it mid-step, and return the run it left unfinished."""

    response = post(client, "/api/live/runs", {"workflow_id": BRIEF_WORKFLOW_ID, "input": "x"})
    handle: str = response.json()["handle"]

    running(client, handle)
    client.post(f"/api/live/{handle}/cancel", headers={"origin": ORIGIN})

    assert finished(client, handle)["state"] == "cancelled"

    (listed,) = client.get(f"/api/workflows/{BRIEF_WORKFLOW_ID}/interrupted").json()["items"]
    run_id: str = listed["run_id"]

    return run_id


def test_an_interrupted_run_is_listed_and_resumed_as_a_live_run(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    run_id = interrupted(client)

    (listed,) = client.get(f"/api/workflows/{BRIEF_WORKFLOW_ID}/interrupted").json()["items"]

    assert listed["command"] == f"azathoth run resume {run_id}"

    response = post(client, f"/api/live/runs/{run_id}/resume", {"workflow_id": BRIEF_WORKFLOW_ID})

    assert response.status_code == 201, response.text
    assert response.json()["kind"] == "run"
    assert response.json()["resumes_run_id"] == run_id

    end = finished(client, response.json()["handle"])

    assert end["state"] == "finished"
    assert str(kept(end)) == run_id
    assert end["result"]["result"] == 7
    assert client.get(f"/api/workflows/{BRIEF_WORKFLOW_ID}/interrupted").json() == {"items": []}
    assert instance.runs.get(UUID(run_id)).resumes == 1


def test_a_run_that_is_not_interrupted_is_not_resumed(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    run_id = counted(instance)

    finished_run = post(client, f"/api/live/runs/{run_id}/resume", {"workflow_id": WORKFLOW_ID})
    unknown = post(client, f"/api/live/runs/{MISSING_ID}/resume", {"workflow_id": WORKFLOW_ID})

    assert finished_run.status_code == 409
    assert finished_run.json()["error"] == {
        "code": "run_not_resumable",
        "message": f"Run {run_id} has already finished.",
    }
    assert unknown.status_code == 404
    assert unknown.json()["error"]["message"] == (
        f"Run {MISSING_ID} is not an interrupted run of workflow {WORKFLOW_ID}."
    )
    assert client.get("/api/live").json() == {"items": []}


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({}, "workflow_id must be a workflow id."),
        ({"workflow_id": WORKFLOW_ID, "more": 1}, "A resume takes workflow_id, not more."),
    ],
)
def test_a_resume_that_cannot_be_read_is_refused(
    client: TestClient,
    body: object,
    message: str,
) -> None:
    response = post(client, f"/api/live/runs/{MISSING_ID}/resume", body)

    assert response.status_code == 422
    assert response.json()["error"]["message"] == message


def test_interrupted_runs_of_a_workflow_that_is_not_configured_are_not_found(
    client: TestClient,
) -> None:
    response = client.get(f"/api/workflows/{MISSING_ID}/interrupted")

    assert response.status_code == 404
    assert client.get(f"/api/workflows/{WORKFLOW_ID}/interrupted?limit=0").status_code == 422
