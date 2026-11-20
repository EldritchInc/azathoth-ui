"""Tests of what an instance spent, through the editor's server (ADR 0014)."""

import csv
import io
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from azathoth import api
from azathoth.context import Context
from azathoth.execution import ExecutionResult
from azathoth.persistence.repositories import open_repositories
from azathoth.strategies import StrategyExecutionMetrics
from azathoth.workflows import WorkflowMetadata, WorkflowRun, WorkflowStepAttempt, WorkflowStepRun
from starlette.testclient import TestClient

from tests.test_benchmarks import client, instance, refused
from tests.test_live import WORKFLOW_ID

__all__ = ["client", "instance"]

SINCE = "2026-11-18T00:00:00-05:00"

UNTIL = "2026-11-20T00:00:00-05:00"

NEW_YORK = "America/New_York"

STEP_ID = UUID("5e000000-0000-4000-8000-0000000000d1")

STRATEGY_ID = UUID("5e000000-0000-4000-8000-0000000000d2")


def keep(
    database: Path,
    when: str,
    cost: float | None,
    *,
    basis: str | None = "billed",
    provider: str = "openrouter",
) -> None:
    """Keep one run of the word count workflow, its one step calling a model, ending when said."""

    ended = datetime.fromisoformat(when)
    execution = ExecutionResult(
        strategy_id=STRATEGY_ID,
        strategy_name="prompt",
        strategy_version="1.0.0",
        output="done",
        metrics=StrategyExecutionMetrics.model_validate(
            {
                "provider": provider,
                "model": "acme/small",
                "estimated_cost_usd": cost,
                "cost_basis": None if cost is None else basis,
            }
        ),
        initial_context=Context(),
        final_context=Context(),
        started_at=ended - timedelta(seconds=1),
        completed_at=ended,
    )
    open_repositories(database).runs.save(
        WorkflowRun(
            workflow=WorkflowMetadata(
                id=UUID(WORKFLOW_ID), name="word count", description="Count words."
            ),
            steps=(
                WorkflowStepRun(
                    step_id=STEP_ID,
                    layer_index=0,
                    execution=execution,
                    attempts=(
                        WorkflowStepAttempt(
                            attempt_number=1,
                            started_at=execution.started_at,
                            completed_at=ended,
                            execution=execution,
                        ),
                    ),
                ),
            ),
            initial_context=Context(),
            final_context=Context(),
            started_at=execution.started_at,
            completed_at=ended,
        )
    )


@pytest.fixture
def database(
    instance: api.Azathoth,
    tmp_path: Path,
) -> Path:
    """Return the instance's database, holding two calls on the first day and none on the next."""

    del instance
    path = tmp_path / "ui.db"
    keep(path, "2026-11-18T12:00:00-05:00", 0.25)
    keep(path, "2026-11-18T13:00:00-05:00", None, provider="bedrock")

    return path


def spend(
    client: TestClient,
    path: str = "/api/spend",
    **query: str,
) -> Any:
    """Ask for spend from SINCE up to UNTIL in New York, changed by `query`."""

    return client.get(path, params={"since": SINCE, "until": UNTIL, "time_zone": NEW_YORK, **query})


#
# The report
#


def test_spend_is_azathoths_report_period_by_period(
    client: TestClient,
    database: Path,
) -> None:
    del database
    response = spend(client)

    assert response.status_code == 200, response.text

    report = api.SpendReport.model_validate(response.json())

    assert [period.start.isoformat() for period in report.periods] == [
        "2026-11-18T00:00:00-05:00",
        "2026-11-19T00:00:00-05:00",
    ]
    assert report.totals == api.SpendTotals(
        billed_usd=0.25, estimated_usd=0.0, calls=2, unpriced_calls=1
    )
    assert report.time_zone == NEW_YORK
    assert report.command.startswith(f"azathoth spend --since {SINCE} --until {UNTIL}")


def test_the_period_grouping_and_workflow_are_passed_on(
    client: TestClient,
    database: Path,
) -> None:
    del database
    report = spend(client, period="week", group="provider", workflow_id=WORKFLOW_ID).json()

    assert (report["period"], report["group"], report["workflow_id"]) == (
        "week",
        "provider",
        WORKFLOW_ID,
    )
    assert [group["key"] for group in report["groups"]] == ["bedrock", "openrouter"]


def test_the_period_grouping_and_time_zone_default_as_azathoths_do(
    client: TestClient,
) -> None:
    report = client.get("/api/spend", params={"since": SINCE, "until": UNTIL}).json()

    assert (report["period"], report["group"], report["time_zone"]) == ("day", "workflow", "UTC")


#
# CSV
#


def test_csv_is_azathoths_own_as_a_download(
    client: TestClient,
    database: Path,
) -> None:
    del database
    response = spend(client, "/api/spend.csv")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.headers["content-disposition"] == (
        'attachment; filename="azathoth-spend-2026-11-18-2026-11-20.csv"'
    )
    assert response.content.decode("utf-8") == api.spend_csv(
        api.SpendReport.model_validate(spend(client).json())
    )

    rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8"), newline="")))

    assert [(row["period_start"], row["calls"]) for row in rows] == [
        ("2026-11-18T00:00:00-05:00", "2"),
        ("2026-11-19T00:00:00-05:00", "0"),
    ]


def test_csv_is_refused_as_the_report_is(
    client: TestClient,
) -> None:
    refused(spend(client, "/api/spend.csv", period="fortnight"), 422, "invalid_argument")


#
# What is refused before Azathoth is asked
#


@pytest.mark.parametrize("name", ["since", "until"])
def test_a_missing_time_is_refused(
    client: TestClient,
    name: str,
) -> None:
    query = {"since": SINCE, "until": UNTIL}
    del query[name]

    message = refused(client.get("/api/spend", params=query), 422, "invalid_argument")

    assert message == f"{name} is required: an ISO 8601 time with its offset."


@pytest.mark.parametrize(
    ("value", "message"),
    [
        ("2026-11-18T00:00:00", "since must say its offset, such as 2026-11-01T00:00:00-05:00."),
        ("2026-11-18", "since must say its offset, such as 2026-11-01T00:00:00-05:00."),
        ("next tuesday", "since must be an ISO 8601 time, not 'next tuesday'."),
    ],
)
def test_a_time_with_no_offset_or_none_at_all_is_refused(
    client: TestClient,
    value: str,
    message: str,
) -> None:
    assert refused(spend(client, since=value), 422, "invalid_argument") == message


@pytest.mark.parametrize(
    ("query", "message"),
    [
        ({"period": "fortnight"}, "period must be day, week or month, not 'fortnight'."),
        (
            {"group": "colour"},
            "group must be workflow, model, provider or source, not 'colour'.",
        ),
        ({"workflow_id": "abc"}, "'abc' is not a workflow id."),
    ],
)
def test_a_period_grouping_or_workflow_not_listed_is_refused(
    client: TestClient,
    query: dict[str, str],
    message: str,
) -> None:
    assert refused(spend(client, **query), 422, "invalid_argument") == message


def test_what_azathoth_refuses_is_passed_on(
    client: TestClient,
) -> None:
    assert (
        refused(spend(client, time_zone="Mars/Olympus"), 422, "invalid_argument")
        == "'Mars/Olympus' is not a time zone."
    )
    assert (
        refused(spend(client, since=UNTIL, until=SINCE), 422, "invalid_argument")
        == "since must not be after until."
    )
    refused(spend(client, workflow_id="00000000-0000-4000-8000-0000000000ff"), 404, "not_found")
