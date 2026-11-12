"""Tests of the browsing API: workflows, tools and benchmarks in the editor's own instance."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from starlette.testclient import TestClient

from azathoth_ui.browsing import MAX_DOCUMENT_BYTES
from tests.test_app import ORIGIN, browser

WORKFLOW_ID = "a1000000-0000-4000-8000-000000000001"

TOOL_ID = "a2000000-0000-4000-8000-000000000001"

BENCHMARK_ID = "b1000000-0000-4000-8000-000000000001"

MISSING_ID = "00000000-0000-4000-8000-000000000000"

WORKFLOW: dict[str, Any] = {
    "metadata": {
        "id": WORKFLOW_ID,
        "name": "summarize",
        "description": "Summarize a text in one sentence.",
        "version": "1.0.0",
    },
    "steps": [
        {
            "id": "a1000000-0000-4000-8000-000000000002",
            "specification": {
                "metadata": {
                    "id": "a1000000-0000-4000-8000-000000000003",
                    "name": "Summarize",
                    "description": "Summarize the text.",
                    "version": "1.0.0",
                },
                "template": {
                    "text": "Summarize in one sentence:\n{text}",
                    "bindings": [{"variable_name": "text", "input_name": "text"}],
                },
                "model_selection": {"requirements": {}},
                "output_format": "text",
            },
            "depends_on": [],
            "inputs": [
                {
                    "name": "text",
                    "source": {"event_type": "workflow.input.received", "field_name": "input"},
                }
            ],
            "outputs": [{"name": "summary", "path": []}],
        }
    ],
    "result": {"name": "summary"},
}

TOOL: dict[str, Any] = {
    "definition": {
        "id": TOOL_ID,
        "name": "count_words",
        "description": "Count the words in a text.",
        "version": "1.0.0",
        "input_schema": {
            "json_schema": {
                "type": "object",
                "properties": {"text": {"type": "string"}},
                "required": ["text"],
            }
        },
        "output_schema": {
            "json_schema": {
                "type": "object",
                "properties": {"count": {"type": "integer"}},
                "required": ["count"],
            }
        },
    },
    "implementations": [
        {
            "id": "a2000000-0000-4000-8000-000000000002",
            "tool_id": TOOL_ID,
            "tool_version": "1.0.0",
            "version": "1.0.0",
            "runtime": "python",
            "entrypoint": "run",
            "source": 'def run(text):\n    return {"count": len(text.split())}\n',
        }
    ],
    "test_cases": [],
}

BENCHMARK: dict[str, Any] = {
    "id": BENCHMARK_ID,
    "name": "word count",
    "description": "Count the words in a text.",
    "version": "1.0.0",
    "cases": [
        {
            "id": "b1000000-0000-4000-8000-000000000011",
            "input": "that is not dead which can eternal lie",
            "expected": {"description": "Eight words.", "value": 8, "comparison": "exact"},
            "metadata": {},
        }
    ],
}


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield a new instance in its own SQLite file, closed afterwards."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.open(database) as opened:
        yield opened


@pytest.fixture
def client(
    instance: api.Azathoth,
    tmp_path: Path,
) -> TestClient:
    """Return a signed-in client of the editor's server."""

    return browser(instance, tmp_path / "missing")


SINGULAR: dict[str, str] = {"workflows": "workflow", "tools": "tool", "benchmarks": "benchmark"}
"""The key an import's answer holds its component under, for each kind."""


def described(
    document: dict[str, Any],
    description: str,
) -> dict[str, Any]:
    """Return a workflow, tool or benchmark document with another description."""

    for key in ("metadata", "definition"):
        if key in document:
            return {**document, key: {**document[key], "description": description}}

    return {**document, "description": description}


def post(
    client: TestClient,
    path: str,
    document: object,
) -> Any:
    """Import one document as the web app does, and return the response."""

    return client.post(
        path,
        content=json.dumps(document),
        headers={"origin": ORIGIN, "content-type": "application/json"},
    )


def error(
    code: str,
    message: str,
) -> dict[str, dict[str, str]]:
    """Return the API's answer to one error."""

    return {"error": {"code": code, "message": message}}


def test_workflows_list_every_workflow_at_its_latest_revision(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    assert client.get("/api/workflows").json() == {"items": []}

    instance.workflows.import_document(json.dumps(WORKFLOW))
    response = client.get("/api/workflows")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "items": [summary.model_dump(mode="json") for summary in instance.workflows.list()]
    }
    assert response.json()["items"][0]["command"] == f"azathoth workflow show {WORKFLOW_ID}"


def test_a_workflow_is_its_latest_revision_unless_one_is_named(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.workflows.import_document(json.dumps(WORKFLOW))
    changed = {**WORKFLOW, "metadata": {**WORKFLOW["metadata"], "description": "Shorter."}}
    instance.workflows.import_document(json.dumps(changed))

    latest = client.get(f"/api/workflows/{WORKFLOW_ID}").json()
    first = client.get(f"/api/workflows/{WORKFLOW_ID}?revision=1").json()

    assert latest == instance.workflows.get(UUID(WORKFLOW_ID)).model_dump(mode="json")
    assert latest["revision"]["number"] == 2
    assert latest["document"]["metadata"]["description"] == "Shorter."
    assert first["revision"]["number"] == 1
    assert first["latest_number"] == 2


def test_a_workflows_history_is_newest_first_up_to_a_limit(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    for description in ("First.", "Second.", "First."):
        instance.workflows.import_document(json.dumps(described(WORKFLOW, description)))

    history = client.get(f"/api/workflows/{WORKFLOW_ID}/history").json()["items"]
    limited = client.get(f"/api/workflows/{WORKFLOW_ID}/history?limit=2").json()["items"]

    assert [entry["revision"]["number"] for entry in history] == [3, 2, 1]
    assert [entry["revision"]["number"] for entry in limited] == [3, 2]
    assert history[0]["revision"]["identical_to"] == 1


def test_tools_list_every_version_and_get_one_exact_version(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    standard = len(client.get("/api/tools").json()["items"])
    instance.tools.import_document(json.dumps(TOOL))

    items = client.get("/api/tools").json()["items"]
    detail = client.get(f"/api/tools/{TOOL_ID}/versions/1.0.0").json()

    assert len(items) == standard + 1
    assert detail == instance.tools.get(UUID(TOOL_ID), "1.0.0").model_dump(mode="json")
    assert detail["implementation_count"] == 1
    assert detail["command"] == f"azathoth tool export {TOOL_ID} --version 1.0.0 --revision 1"


def test_a_tools_history_can_be_of_one_version(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.tools.import_document(json.dumps(TOOL))
    newer = {**TOOL, "definition": {**TOOL["definition"], "version": "1.1.0"}}
    newer["implementations"] = [
        {
            **TOOL["implementations"][0],
            "id": "a2000000-0000-4000-8000-000000000003",
            "tool_version": "1.1.0",
        }
    ]
    instance.tools.import_document(json.dumps(newer))

    every = client.get(f"/api/tools/{TOOL_ID}/history").json()["items"]
    one = client.get(f"/api/tools/{TOOL_ID}/history?version=1.1.0&limit=5").json()["items"]

    assert sorted(entry["version"] for entry in every) == ["1.0.0", "1.1.0"]
    assert [entry["version"] for entry in one] == ["1.1.0"]


def test_a_tool_version_is_its_latest_revision_unless_one_is_named(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.tools.import_document(json.dumps(TOOL))
    instance.tools.import_document(json.dumps(described(TOOL, "Counts again.")))

    latest = client.get(f"/api/tools/{TOOL_ID}/versions/1.0.0").json()
    first = client.get(f"/api/tools/{TOOL_ID}/versions/1.0.0?revision=1").json()

    assert (latest["revision"]["number"], first["revision"]["number"]) == (2, 1)


def test_benchmarks_list_get_and_history(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.benchmarks.import_document(json.dumps(BENCHMARK))

    items = client.get("/api/benchmarks").json()["items"]
    detail = client.get(f"/api/benchmarks/{BENCHMARK_ID}?revision=1").json()
    history = client.get(f"/api/benchmarks/{BENCHMARK_ID}/history?limit=1").json()["items"]

    assert [item["case_count"] for item in items] == [1]
    assert detail == instance.benchmarks.get(UUID(BENCHMARK_ID)).model_dump(mode="json")
    assert [entry["revision"]["number"] for entry in history] == [1]


@pytest.mark.parametrize(
    "path",
    [
        f"/api/workflows/{MISSING_ID}",
        f"/api/workflows/{MISSING_ID}/history",
        f"/api/tools/{MISSING_ID}/versions/1.0.0",
        f"/api/benchmarks/{MISSING_ID}",
        f"/api/benchmarks/{MISSING_ID}/history",
    ],
)
def test_a_component_that_is_not_there_is_not_found(
    client: TestClient,
    path: str,
) -> None:
    response = client.get(path)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_a_revision_that_is_not_there_is_not_found(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.workflows.import_document(json.dumps(WORKFLOW))
    response = client.get(f"/api/workflows/{WORKFLOW_ID}?revision=9")

    assert response.status_code == 404
    assert response.json() == error(
        "revision_not_found", f"Workflow {WORKFLOW_ID} has no revision 9."
    )


@pytest.mark.parametrize(
    ("path", "message"),
    [
        ("/api/workflows/abc", "'abc' is not a workflow id."),
        ("/api/tools/abc/history", "'abc' is not a tool id."),
        ("/api/tools/abc/versions/1.0.0", "'abc' is not a tool id."),
        ("/api/benchmarks/abc/history", "'abc' is not a benchmark id."),
        (
            f"/api/workflows/{MISSING_ID}?revision=two",
            "revision must be a whole number, not 'two'.",
        ),
        (
            f"/api/workflows/{MISSING_ID}?revision=-1",
            "revision must be a whole number, not '-1'.",
        ),
        (
            f"/api/benchmarks/{MISSING_ID}/history?limit=1.5",
            "limit must be a whole number, not '1.5'.",
        ),
    ],
)
def test_a_malformed_id_or_number_is_an_invalid_argument(
    client: TestClient,
    path: str,
    message: str,
) -> None:
    response = client.get(path)

    assert response.status_code == 422
    assert response.json() == error("invalid_argument", message)


def test_a_limit_below_one_is_refused_by_azathoth(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.workflows.import_document(json.dumps(WORKFLOW))
    response = client.get(f"/api/workflows/{WORKFLOW_ID}/history?limit=0")

    assert response.status_code == 422
    assert response.json() == error("invalid_argument", "A history limit must be at least 1.")


@pytest.mark.parametrize(
    ("kind", "document"),
    [("workflows", WORKFLOW), ("tools", TOOL), ("benchmarks", BENCHMARK)],
)
def test_importing_a_document_makes_its_next_revision(
    client: TestClient,
    kind: str,
    document: dict[str, Any],
) -> None:
    key = SINGULAR[kind]
    first = post(client, f"/api/{kind}/import", document)
    second = post(client, f"/api/{kind}/import", described(document, "Changed."))

    assert first.status_code == 201
    assert first.headers["cache-control"] == "no-store"
    assert first.json()["created"] is True
    assert first.json()[key]["revision"]["number"] == 1
    assert second.status_code == 201
    assert second.json()[key]["revision"]["number"] == 2
    assert second.json()[key]["revision"]["identical_to"] is None


@pytest.mark.parametrize(
    ("kind", "document"),
    [("workflows", WORKFLOW), ("tools", TOOL), ("benchmarks", BENCHMARK)],
)
def test_importing_the_latest_revisions_document_makes_none(
    client: TestClient,
    kind: str,
    document: dict[str, Any],
) -> None:
    key = SINGULAR[kind]
    first = post(client, f"/api/{kind}/import", document)
    again = post(client, f"/api/{kind}/import", document)

    assert again.status_code == 200
    assert again.json()["created"] is False
    assert again.json()[key] == first.json()[key]
    assert again.json()[key]["latest_number"] == 1


def test_importing_an_earlier_revisions_document_reverts_to_it(
    client: TestClient,
) -> None:
    post(client, "/api/workflows/import", WORKFLOW)
    post(client, "/api/workflows/import", described(WORKFLOW, "Changed."))
    reverted = post(client, "/api/workflows/import", WORKFLOW)

    assert reverted.status_code == 201
    assert reverted.json()["workflow"]["revision"]["number"] == 3
    assert reverted.json()["workflow"]["revision"]["identical_to"] == 1


def test_an_invalid_document_is_refused_with_azathoths_message(
    client: TestClient,
) -> None:
    response = post(client, "/api/workflows/import", TOOL)

    assert response.status_code == 422
    assert response.json() == error(
        "invalid_document", "Workflow document is not a valid WorkflowSpecification."
    )


def test_a_document_must_be_utf8_json(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/benchmarks/import",
        content=b"\xff\xfe",
        headers={"origin": ORIGIN, "content-type": "application/json"},
    )

    assert response.status_code == 422
    assert response.json() == error("invalid_document", "The document is not UTF-8 text.")


def test_a_document_must_be_sent_as_json(
    client: TestClient,
) -> None:
    for content_type in ("text/plain", "application/x-www-form-urlencoded", None):
        headers = {"origin": ORIGIN}

        if content_type is not None:
            headers["content-type"] = content_type

        response = client.post("/api/workflows/import", content=b"{}", headers=headers)

        assert response.status_code == 415, content_type
        assert response.json() == error(
            "unsupported_media_type", "Send the document as application/json."
        )

    charset = client.post(
        "/api/benchmarks/import",
        content=json.dumps(BENCHMARK).encode(),
        headers={"origin": ORIGIN, "content-type": "application/json; charset=utf-8"},
    )
    assert charset.status_code == 201


def test_a_document_too_large_is_refused_before_it_is_read(
    client: TestClient,
) -> None:
    assert MAX_DOCUMENT_BYTES == 10 * 1024 * 1024

    response = client.post(
        "/api/workflows/import",
        content=b" " * (MAX_DOCUMENT_BYTES + 1),
        headers={"origin": ORIGIN, "content-type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json() == error("document_too_large", "A document may be at most 10 MB.")


def test_a_document_sent_in_pieces_is_cut_off_once_it_is_too_large(
    client: TestClient,
) -> None:
    piece = b" " * (1024 * 1024)
    pieces = iter([piece] * 11)

    response = client.post(
        "/api/workflows/import",
        content=pieces,
        headers={"origin": ORIGIN, "content-type": "application/json"},
    )

    assert response.status_code == 413
    assert response.json() == error("document_too_large", "A document may be at most 10 MB.")


def test_a_document_declared_too_large_is_refused_without_reading_it(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workflows/import",
        content=b"{}",
        headers={
            "origin": ORIGIN,
            "content-type": "application/json",
            "content-length": str(MAX_DOCUMENT_BYTES + 1),
        },
    )

    assert response.status_code == 413


def test_importing_needs_the_origin_like_any_change(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/workflows/import",
        content=json.dumps(WORKFLOW).encode(),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 403


def test_reading_with_the_wrong_method_is_not_allowed(
    client: TestClient,
) -> None:
    response = client.post("/api/workflows", headers={"origin": ORIGIN})

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"
