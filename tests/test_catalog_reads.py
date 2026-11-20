"""Tests of usage, goals and a tool made from an MCP server, through the editor (ADR 0015)."""

import json
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from starlette.testclient import TestClient

from tests.test_benchmarks import client, instance, post, refused
from tests.test_browsing import TOOL, TOOL_ID

__all__ = ["client", "instance"]

GOAL_ID = "9a000000-0000-4000-8000-000000000001"

GOAL: dict[str, Any] = {
    "id": GOAL_ID,
    "name": "Answer accurately",
    "description": "Produce the correct answer for the supplied request.",
    "success_criteria": ["The answer matches the expected result."],
    "constraints": ["Do not rely on unavailable external state."],
}

MODEL = "openrouter/acme/large"

MADE = api.DocumentExport(text=json.dumps(TOOL) + "\n", file_name="count-words-1.0.0.tool.json")
"""What the fake MCP server's tool makes."""


#
# Usage
#


def test_a_models_usage_is_azathoths(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    response = client.get("/api/model-usage", params={"identifier": MODEL})

    assert response.status_code == 200
    assert response.json() == instance.models.usage(MODEL).model_dump(mode="json")
    assert response.json()["identifier"] == MODEL


def test_a_models_usage_needs_a_model(
    client: TestClient,
) -> None:
    message = refused(client.get("/api/model-usage"), 422, "invalid_argument")

    assert message == "identifier must name a model."


def test_a_tools_usage_is_azathoths(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    instance.tools.import_document(json.dumps(TOOL))

    response = client.get(f"/api/tools/{TOOL_ID}/usage")

    assert response.status_code == 200
    assert response.json() == instance.tools.usage(UUID(TOOL_ID)).model_dump(mode="json")


def test_a_tool_nothing_knows_is_not_found(
    client: TestClient,
) -> None:
    missing = "00000000-0000-4000-8000-000000000000"

    message = refused(client.get(f"/api/tools/{missing}/usage"), 404, "not_found")

    assert message == f"Tool {missing} is not configured."
    assert refused(client.get("/api/tools/abc/usage"), 422, "invalid_argument") == (
        "'abc' is not a tool id."
    )


#
# Goals
#


def test_a_goal_is_imported_listed_and_shown(
    instance: api.Azathoth,
    client: TestClient,
) -> None:
    assert client.get("/api/goals").json() == {"items": []}

    imported = post(client, "/api/goals/import", GOAL)

    assert imported.status_code == 201
    assert imported.json()["created"] is True
    assert client.get("/api/goals").json() == {
        "items": [goal.model_dump(mode="json") for goal in instance.goals.list()]
    }
    assert client.get(f"/api/goals/{GOAL_ID}").json() == instance.goals.get(
        UUID(GOAL_ID)
    ).model_dump(mode="json")


def test_a_goal_imported_again_unchanged_makes_nothing(
    client: TestClient,
) -> None:
    post(client, "/api/goals/import", GOAL)

    again = post(client, "/api/goals/import", GOAL)

    assert again.status_code == 200
    assert again.json()["created"] is False


def test_another_goal_with_a_kept_id_is_a_conflict(
    client: TestClient,
) -> None:
    post(client, "/api/goals/import", GOAL)

    response = post(client, "/api/goals/import", {**GOAL, "name": "Renamed"})

    assert refused(response, 409, "conflict") == f"Goal {GOAL_ID} already exists."
    assert client.get(f"/api/goals/{GOAL_ID}").json()["name"] == "Answer accurately"


def test_a_goal_that_is_not_there_or_not_one_is_refused(
    client: TestClient,
) -> None:
    missing = "00000000-0000-4000-8000-000000000000"

    assert refused(client.get(f"/api/goals/{missing}"), 404, "not_found") == (
        f"Goal {missing} is not configured."
    )
    assert refused(post(client, "/api/goals/import", {"name": "x"}), 422, "invalid_document") == (
        "Goal document is not a valid Goal."
    )


#
# A tool from an MCP server
#


@pytest.fixture
def asked(
    monkeypatch: pytest.MonkeyPatch,
) -> list[dict[str, Any]]:
    """Make every MCP server serve the counting tool, and return what each was asked."""

    calls: list[dict[str, Any]] = []

    def from_mcp(
        self: object,
        tool: str,
        **options: Any,
    ) -> api.DocumentExport:
        calls.append({"tool": tool, **options})

        return MADE

    monkeypatch.setattr(api.Tools, "from_mcp", from_mcp)

    return calls


def test_a_tool_is_made_from_a_server_reached_by_url(
    client: TestClient,
    asked: list[dict[str, Any]],
) -> None:
    response = post(
        client,
        "/api/tools/from-mcp",
        {
            "tool": "count_words",
            "url": "https://mcp.example.com/mcp",
            "authorization": "COUNT_TOKEN",
            "timeout_seconds": 12,
        },
    )

    assert response.status_code == 200
    assert response.json() == MADE.model_dump(mode="json")
    assert asked == [
        {
            "tool": "count_words",
            "url": "https://mcp.example.com/mcp",
            "command": (),
            "authorization": "COUNT_TOKEN",
            "grants": (),
            "timeout_seconds": 12.0,
        }
    ]


def test_a_tool_is_made_from_a_server_started_by_a_command(
    client: TestClient,
    asked: list[dict[str, Any]],
) -> None:
    response = post(
        client,
        "/api/tools/from-mcp",
        {"tool": "count_words", "command": ["count-server", "--stdio"], "grants": ["LANG"]},
    )

    assert response.status_code == 200
    assert asked[0]["command"] == ("count-server", "--stdio")
    assert asked[0]["grants"] == ("LANG",)
    assert asked[0]["url"] is None


def test_making_a_tool_imports_nothing(
    instance: api.Azathoth,
    client: TestClient,
    asked: list[dict[str, Any]],
) -> None:
    before = instance.tools.list()

    post(client, "/api/tools/from-mcp", {"tool": "count_words", "url": "https://mcp.example.com"})

    assert instance.tools.list() == before


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"url": "https://mcp.example.com"}, "tool must name the tool the server serves."),
        (
            {"tool": "", "url": "https://mcp.example.com"},
            "tool must name the tool the server serves.",
        ),
        ({"tool": "x", "url": 7}, "url must be text."),
        ({"tool": "x", "command": "count-server"}, "command must be a list of text."),
        ({"tool": "x", "command": ["a"], "grants": [1]}, "grants must be a list of text."),
        (
            {"tool": "x", "url": "https://mcp.example.com", "timeout_seconds": 0},
            "timeout_seconds must be a number of seconds above 0.",
        ),
        (
            {"tool": "x", "url": "https://mcp.example.com", "timeout_seconds": True},
            "timeout_seconds must be a number of seconds above 0.",
        ),
        (
            {"tool": "x", "url": "https://mcp.example.com", "token": "secret"},
            "A tool to make takes tool, url, command, authorization, grants and "
            "timeout_seconds, not token.",
        ),
    ],
)
def test_a_body_that_cannot_name_a_tool_is_refused_before_azathoth_is_asked(
    client: TestClient,
    asked: list[dict[str, Any]],
    body: dict[str, Any],
    message: str,
) -> None:
    assert refused(post(client, "/api/tools/from-mcp", body), 422, "invalid_argument") == message
    assert asked == []


def test_a_server_named_both_ways_is_azathoths_refusal(
    client: TestClient,
) -> None:
    response = post(
        client,
        "/api/tools/from-mcp",
        {"tool": "x", "url": "https://mcp.example.com", "command": ["count-server"]},
    )

    assert refused(response, 422, "invalid_argument") == (
        "Name the MCP server by its URL or by a command, not both."
    )


def test_a_server_that_cannot_be_reached_answers_502(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unreachable(
        self: object,
        tool: str,
        **options: Any,
    ) -> api.DocumentExport:
        raise api.McpUnavailableError("MCP server https://mcp.example.com could not be listed.")

    monkeypatch.setattr(api.Tools, "from_mcp", unreachable)

    response = post(client, "/api/tools/from-mcp", {"tool": "x", "url": "https://mcp.example.com"})

    assert refused(response, 502, "mcp_unavailable") == (
        "MCP server https://mcp.example.com could not be listed."
    )
