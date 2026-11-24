"""Tests of a tool's versions, a revision's export and two revisions compared (ADR 0015)."""

import json
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from starlette.testclient import TestClient

from tests.test_browsing import (
    BENCHMARK,
    BENCHMARK_ID,
    MISSING_ID,
    TOOL,
    TOOL_ID,
    WORKFLOW,
    WORKFLOW_ID,
    client,
    described,
    error,
    instance,
)

__all__ = ["client", "instance"]


def newer_tool() -> dict[str, Any]:
    """Return the tool's document at version 1.1.0."""

    newer = {**TOOL, "definition": {**TOOL["definition"], "version": "1.1.0"}}
    newer["implementations"] = [
        {
            **TOOL["implementations"][0],
            "id": "a2000000-0000-4000-8000-000000000003",
            "tool_version": "1.1.0",
        }
    ]

    return newer


def restricted_benchmark(
    text: str,
) -> dict[str, Any]:
    """Return the benchmark with its one case restricted, reading `text`."""

    (case,) = BENCHMARK["cases"]

    return {**BENCHMARK, "cases": [{**case, "input": text, "sensitivity": "restricted"}]}


#
# A tool's versions
#


def test_a_tools_versions_are_listed_at_their_latest_revisions(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.tools.import_document(json.dumps(TOOL))
    instance.tools.import_document(json.dumps(described(TOOL, "Counts again.")))
    instance.tools.import_document(json.dumps(newer_tool()))

    response = client.get(f"/api/tools/{TOOL_ID}/versions")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            version.model_dump(mode="json") for version in instance.tools.versions(UUID(TOOL_ID))
        ]
    }
    assert [(item["version"], item["revision"]["number"]) for item in response.json()["items"]] == [
        ("1.0.0", 2),
        ("1.1.0", 1),
    ]


def test_a_tool_with_no_versions_is_not_found(
    client: TestClient,
) -> None:
    response = client.get(f"/api/tools/{MISSING_ID}/versions")

    assert response.status_code == 404
    assert response.json() == error("not_found", f"Tool {MISSING_ID} is not configured.")


#
# Exports
#


def test_a_workflows_export_is_azathoths_text_as_a_named_download(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.workflows.import_document(json.dumps(WORKFLOW))
    instance.workflows.import_document(json.dumps(described(WORKFLOW, "Shorter.")))

    latest = client.get(f"/api/workflows/{WORKFLOW_ID}/export")
    first = client.get(f"/api/workflows/{WORKFLOW_ID}/export?revision=1")
    expected = instance.workflows.export(UUID(WORKFLOW_ID), revision=1)

    assert first.status_code == 200
    assert first.content == expected.text.encode("utf-8")
    assert first.headers["content-type"] == "application/json; charset=utf-8"
    assert (
        first.headers["content-disposition"] == 'attachment; filename="summarize.r1.workflow.json"'
    )
    assert first.headers["cache-control"] == "no-store"
    assert latest.headers["content-disposition"].endswith('summarize.r2.workflow.json"')


def test_importing_the_latest_export_again_makes_no_revision(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.workflows.import_document(json.dumps(WORKFLOW))

    exported = client.get(f"/api/workflows/{WORKFLOW_ID}/export").text

    assert not instance.workflows.import_document(exported).created


def test_a_tool_versions_export_names_its_version(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.tools.import_document(json.dumps(TOOL))

    response = client.get(f"/api/tools/{TOOL_ID}/versions/1.0.0/export?revision=1")

    assert response.text == instance.tools.export(UUID(TOOL_ID), "1.0.0").text
    assert response.headers["content-disposition"] == (
        'attachment; filename="count-words-1.0.0.r1.tool.json"'
    )


def test_a_benchmarks_export_is_its_text_restricted_or_not(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.benchmarks.import_document(json.dumps(restricted_benchmark("patient 412")))

    response = client.get(f"/api/benchmarks/{BENCHMARK_ID}/export")

    assert response.text == instance.benchmarks.export(UUID(BENCHMARK_ID)).text
    assert "patient 412" in response.text
    assert response.headers["content-disposition"] == (
        'attachment; filename="word-count.r1.benchmark.json"'
    )


@pytest.mark.parametrize(
    "path",
    [
        f"/api/workflows/{MISSING_ID}/export",
        f"/api/tools/{MISSING_ID}/versions/1.0.0/export",
        f"/api/benchmarks/{MISSING_ID}/export",
    ],
)
def test_an_export_of_nothing_is_not_found(
    client: TestClient,
    path: str,
) -> None:
    response = client.get(path)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


#
# Comparing revisions
#


def test_two_workflow_revisions_are_azathoths_comparison(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.workflows.import_document(json.dumps(WORKFLOW))
    instance.workflows.import_document(json.dumps(described(WORKFLOW, "Shorter.")))

    response = client.get(f"/api/workflows/{WORKFLOW_ID}/diff?before=1&after=2")

    assert response.status_code == 200
    assert response.json() == instance.workflows.compare_revisions(
        UUID(WORKFLOW_ID), 1, 2
    ).model_dump(mode="json")
    assert response.json()["changes"] == [
        {
            "kind": "changed",
            "pointer": "/metadata/description",
            "before": WORKFLOW["metadata"]["description"],
            "after": "Shorter.",
            "withheld": False,
        }
    ]


def test_a_revision_compared_with_itself_is_identical(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.tools.import_document(json.dumps(TOOL))

    response = client.get(f"/api/tools/{TOOL_ID}/versions/1.0.0/diff?before=1&after=1")

    assert response.json()["identical"] is True
    assert response.json()["changes"] == []


def test_a_restricted_case_is_compared_whole_where_it_may_be_read(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.benchmarks.import_document(json.dumps(restricted_benchmark("patient 412")))
    instance.benchmarks.import_document(json.dumps(restricted_benchmark("patient 413")))

    (change,) = client.get(f"/api/benchmarks/{BENCHMARK_ID}/diff?before=1&after=2").json()[
        "changes"
    ]

    assert change == {
        "kind": "changed",
        "pointer": "/cases/0/input",
        "before": "patient 412",
        "after": "patient 413",
        "withheld": False,
    }


def test_a_restricted_case_is_withheld_where_it_may_not_be_read(
    instance: api.Azathoth,
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("azathoth_ui.browsing.may_read_restricted", lambda *_: False)
    instance.benchmarks.import_document(json.dumps(restricted_benchmark("patient 412")))
    instance.benchmarks.import_document(json.dumps(restricted_benchmark("patient 413")))

    (change,) = client.get(f"/api/benchmarks/{BENCHMARK_ID}/diff?before=1&after=2").json()[
        "changes"
    ]

    assert change["withheld"] is True
    assert (change["before"], change["after"]) == (None, None)


def test_a_revision_that_is_not_there_is_not_found(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.workflows.import_document(json.dumps(WORKFLOW))

    response = client.get(f"/api/workflows/{WORKFLOW_ID}/diff?before=1&after=9")

    assert response.status_code == 404
    assert response.json() == error(
        "revision_not_found", f"Workflow {WORKFLOW_ID} has no revision 9."
    )


@pytest.mark.parametrize(
    ("query", "message"),
    [
        ("after=2", "before must name a revision."),
        ("before=1", "after must name a revision."),
        ("before=0&after=1", "before must be a revision number, from 1."),
        ("before=1&after=two", "after must be a whole number, not 'two'."),
    ],
)
def test_both_revisions_must_be_named_by_number(
    client: TestClient,
    query: str,
    message: str,
) -> None:
    for path in (
        f"/api/workflows/{WORKFLOW_ID}/diff",
        f"/api/tools/{TOOL_ID}/versions/1.0.0/diff",
        f"/api/benchmarks/{BENCHMARK_ID}/diff",
    ):
        response = client.get(f"{path}?{query}")

        assert response.status_code == 422, path
        assert response.json() == error("invalid_argument", message)
