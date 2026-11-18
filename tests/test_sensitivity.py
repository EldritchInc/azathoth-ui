"""Tests of labelling what runs are given, and of declaring a model's policy (ADR 0011)."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from starlette.testclient import TestClient

from azathoth_ui.labels import sensitivity_of
from tests.test_app import ORIGIN
from tests.test_browsing import TOOL
from tests.test_catalog import FREE, LARGE, Models, Portfolio, change, client_of
from tests.test_live import STEP_ID, WORKFLOW_ID, counting, finished, kept, running, signed_in
from tests.test_live_invocations import (
    BRIEF_STEP_ID,
    BRIEF_TOOL,
    BRIEF_WORKFLOW_ID,
    POSTED,
    invoke,
    invoked,
)

LABEL_MESSAGE = "sensitivity must be public, internal or restricted, not {!r}."


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


def post(
    client: TestClient,
    path: str,
    body: object,
) -> Any:
    """Post a JSON body as the web app does, and return the response."""

    return client.post(path, content=json.dumps(body), headers=POSTED)


#
# A label, as a request gives it
#


@pytest.mark.parametrize("label", ["public", "internal", "restricted"])
def test_each_of_azathoths_labels_is_read(
    label: str,
) -> None:
    assert sensitivity_of(label) is api.Sensitivity(label)


def test_no_label_is_none() -> None:
    assert sensitivity_of(None) is None


@pytest.mark.parametrize("value", ["secret", "", "Restricted", 3, ["restricted"]])
def test_anything_else_is_refused_by_name(
    value: object,
) -> None:
    with pytest.raises(api.InvalidArgumentError) as refused:
        sensitivity_of(value)

    assert str(refused.value) == LABEL_MESSAGE.format(value)


#
# Live runs, tried steps and invocations
#


def test_a_run_is_labelled_and_described_with_its_label(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    response = post(
        client,
        "/api/live/runs",
        {"workflow_id": WORKFLOW_ID, "input": "one two", "sensitivity": "restricted"},
    )

    assert response.status_code == 201, response.text
    assert response.json()["sensitivity"] == "restricted"

    end = finished(client, response.json()["handle"])

    assert end["sensitivity"] == "restricted"
    assert instance.runs.get(kept(end)).sensitivity is api.Sensitivity.RESTRICTED


def test_a_run_given_no_label_is_described_unlabelled_and_kept_as_internal(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    response = post(client, "/api/live/runs", {"workflow_id": WORKFLOW_ID, "input": "one"})
    end = finished(client, response.json()["handle"])

    assert response.json()["sensitivity"] is None
    assert instance.runs.get(kept(end)).sensitivity is api.Sensitivity.INTERNAL


def test_a_label_that_is_not_azathoths_is_refused_before_anything_runs(
    client: TestClient,
) -> None:
    response = post(
        client,
        "/api/live/runs",
        {"workflow_id": WORKFLOW_ID, "input": "one", "sensitivity": "secret"},
    )

    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "invalid_argument",
        "message": LABEL_MESSAGE.format("secret"),
    }
    assert client.get("/api/live").json() == {"items": []}


def test_a_label_without_input_is_refused_before_anything_runs(
    client: TestClient,
) -> None:
    response = post(client, "/api/live/runs", {"workflow_id": WORKFLOW_ID, "sensitivity": "public"})

    assert response.status_code == 422
    assert response.json()["error"]["message"] == api.SENSITIVITY_WITHOUT_INPUT_MESSAGE
    assert client.get("/api/live").json() == {"items": []}


def test_a_tried_step_is_labelled(
    client: TestClient,
) -> None:
    response = post(
        client,
        "/api/live/steps",
        {
            "document": counting(),
            "step_id": STEP_ID,
            "inputs": {"text": "a b c"},
            "sensitivity": "public",
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["sensitivity"] == "public"
    assert finished(client, response.json()["handle"])["state"] == "finished"


def test_a_tried_step_refuses_a_label_that_is_not_azathoths(
    client: TestClient,
) -> None:
    response = post(
        client,
        "/api/live/steps",
        {"document": counting(), "step_id": STEP_ID, "sensitivity": 1},
    )

    assert response.status_code == 422
    assert response.json()["error"]["message"] == LABEL_MESSAGE.format(1)


def test_an_invocation_is_labelled_and_production_keeps_its_label(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    response = invoke(
        client, {"workflow_id": WORKFLOW_ID, "input": "a b", "sensitivity": "restricted"}
    )

    assert response.status_code == 201, response.text
    assert response.json()["sensitivity"] == "restricted"

    end = finished(client, response.json()["handle"])
    detail = instance.invocations.get(UUID(end["invocation_id"]))

    assert detail.sensitivity is api.Sensitivity.RESTRICTED


def test_an_invocation_refuses_a_label_that_is_not_azathoths(
    client: TestClient,
) -> None:
    response = invoke(client, {"workflow_id": WORKFLOW_ID, "input": "a", "sensitivity": "top"})

    assert response.status_code == 422
    assert response.json()["error"]["message"] == LABEL_MESSAGE.format("top")


def test_a_resumed_invocation_is_described_with_the_label_it_was_given(
    client: TestClient,
) -> None:
    handle = invoked(
        client, {"workflow_id": BRIEF_WORKFLOW_ID, "input": "x", "sensitivity": "restricted"}
    )
    running(client, handle)
    client.post(f"/api/live/{handle}/cancel", headers={"origin": ORIGIN})
    finished(client, handle)

    listed = client.get(f"/api/workflows/{BRIEF_WORKFLOW_ID}/invocations").json()["items"]
    response = client.post(
        f"/api/live/invocations/{listed[0]['invocation_id']}/resume", headers={"origin": ORIGIN}
    )

    assert response.status_code == 201
    assert response.json()["sensitivity"] == "restricted"

    finished(client, response.json()["handle"])


#
# Readiness
#


def test_readiness_is_asked_for_a_label(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workflows/readiness?sensitivity=restricted",
        content=json.dumps(counting()),
        headers=POSTED,
    )

    assert response.status_code == 200
    assert response.json()["ready"] is True


def test_readiness_refuses_a_label_that_is_not_azathoths(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workflows/readiness?sensitivity=secret",
        content=json.dumps(counting()),
        headers=POSTED,
    )

    assert response.status_code == 422
    assert response.json()["error"]["message"] == LABEL_MESSAGE.format("secret")


#
# Matching, and declaring a model's policy
#


def test_matching_for_restricted_input_answers_only_with_private_models(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    models = Models(LARGE, FREE)
    models.private = {FREE}
    client = client_of(instance, tmp_path, models, Portfolio(LARGE, FREE))

    status, answer = change(
        client, "/api/models/matching", {"requirements": {}, "sensitivity": "restricted"}
    )

    assert status == 200
    assert isinstance(answer, dict)
    assert [item["identifier"] for item in answer["items"]] == [FREE]
    assert models.labels == [api.Sensitivity.RESTRICTED]


def test_matching_is_kept_apart_for_each_label(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    models = Models(LARGE, FREE)
    client = client_of(instance, tmp_path, models, Portfolio(LARGE, FREE))

    change(client, "/api/models/matching", {"requirements": {}})
    change(client, "/api/models/matching", {"requirements": {}, "sensitivity": "restricted"})
    change(client, "/api/models/matching", {"requirements": {}, "sensitivity": "restricted"})

    assert models.labels == [None, api.Sensitivity.RESTRICTED]


def test_matching_refuses_a_label_that_is_not_azathoths(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = client_of(instance, tmp_path, Models(LARGE), Portfolio(LARGE))

    status, answer = change(
        client, "/api/models/matching", {"requirements": {}, "sensitivity": "secret"}
    )

    assert status == 422
    assert answer == {
        "error": {"code": "invalid_argument", "message": LABEL_MESSAGE.format("secret")}
    }


def test_a_models_policy_is_declared_and_answered_with_the_model(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    models, portfolio = Models(LARGE), Portfolio(LARGE)
    portfolio.add(LARGE)
    client = client_of(instance, tmp_path, models, portfolio)

    status, answer = change(
        client,
        "/api/local/portfolio/policy",
        {"identifier": LARGE, "retains_data": "no", "trains_on_data": "no"},
    )

    assert status == 200
    assert isinstance(answer, dict)
    assert answer["identifier"] == LARGE
    assert answer["data_policy"] == {"retains_data": "no", "trains_on_data": "no"}
    assert answer["receives_restricted"] is True
    assert answer["policy_declared_by"] == {"name": "Eris Discordia", "email": None}
    assert portfolio.declared == [
        (
            LARGE,
            api.DataPolicy(retains_data=api.PolicyAnswer.NO, trains_on_data=api.PolicyAnswer.NO),
        )
    ]


def test_declaring_a_policy_forgets_what_requirements_matched(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    models, portfolio = Models(LARGE), Portfolio(LARGE)
    portfolio.add(LARGE)
    client = client_of(instance, tmp_path, models, portfolio)
    asked = {"requirements": {}, "sensitivity": "restricted"}

    change(client, "/api/models/matching", asked)
    change(
        client,
        "/api/local/portfolio/policy",
        {"identifier": LARGE, "retains_data": "no", "trains_on_data": "no"},
    )
    change(client, "/api/models/matching", asked)

    assert models.matched == 2


def test_a_policy_for_a_model_not_authorized_is_not_found(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = client_of(instance, tmp_path, Models(LARGE), Portfolio(LARGE))

    status, answer = change(
        client,
        "/api/local/portfolio/policy",
        {"identifier": LARGE, "retains_data": "no", "trains_on_data": "unknown"},
    )

    assert status == 404
    assert isinstance(answer, dict)
    assert answer["error"]["code"] == "not_found"


@pytest.mark.parametrize(
    ("body", "message"),
    [
        (
            {"retains_data": "no", "trains_on_data": "no"},
            "identifier must be a model identifier, such as openrouter/acme/large.",
        ),
        (
            {"identifier": LARGE, "trains_on_data": "no"},
            "retains_data must be yes, no or unknown, not None.",
        ),
        (
            {"identifier": LARGE, "retains_data": "never", "trains_on_data": "no"},
            "retains_data must be yes, no or unknown, not 'never'.",
        ),
        (
            {"identifier": LARGE, "retains_data": "no", "trains_on_data": False},
            "trains_on_data must be yes, no or unknown, not False.",
        ),
        (
            {"identifier": LARGE, "retains_data": "no", "trains_on_data": "no", "more": 1},
            "A policy takes identifier, retains_data and trains_on_data, not more.",
        ),
    ],
)
def test_a_policy_that_cannot_be_read_is_refused(
    instance: api.Azathoth,
    tmp_path: Path,
    body: object,
    message: str,
) -> None:
    portfolio = Portfolio(LARGE)
    portfolio.add(LARGE)
    client = client_of(instance, tmp_path, Models(LARGE), portfolio)

    status, answer = change(client, "/api/local/portfolio/policy", body)

    assert status == 422
    assert answer == {"error": {"code": "invalid_argument", "message": message}}
    assert portfolio.declared == []


def test_declaring_a_policy_needs_this_servers_origin(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    portfolio = Portfolio(LARGE)
    portfolio.add(LARGE)
    client = client_of(instance, tmp_path, Models(LARGE), portfolio)

    response = client.post(
        "/api/local/portfolio/policy",
        json={"identifier": LARGE, "retains_data": "no", "trains_on_data": "no"},
    )

    assert response.status_code == 403
    assert portfolio.declared == []
