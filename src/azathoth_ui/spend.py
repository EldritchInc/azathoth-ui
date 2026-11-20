"""What an instance spent, through the editor's server (ADR 0014).

Each endpoint acts on the instance its request is served for, through
`instance.spend` (Azathoth's ADR 0132), and is mounted with the rest of
that instance's endpoints (ADR 0009). `since` and `until` are required,
each with its offset, so the server never guesses a time zone; the web app
reads them in the browser's.
"""

from datetime import datetime
from typing import Final, TypedDict, TypeVar
from uuid import UUID

from azathoth import api
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from azathoth_ui.browsing import instance_of, one

SPEND_PERIODS: Final[tuple[api.SpendPeriod, ...]] = ("day", "week", "month")

SPEND_GROUPS: Final[tuple[api.SpendGroup, ...]] = ("workflow", "model", "provider", "source")

OFFSET_EXAMPLE: Final = "2026-11-01T00:00:00-05:00"

Choice = TypeVar("Choice", bound=str)


class SpendQuery(TypedDict):
    """What one request asks a spend report of."""

    since: datetime
    until: datetime
    period: api.SpendPeriod
    group: api.SpendGroup
    time_zone: str
    workflow_id: UUID | None


def _moment(
    request: Request,
    name: str,
) -> datetime:
    """Return the time one query parameter gives, with its offset.

    Raises:
        InvalidArgumentError: It is missing, is not an ISO 8601 time, or
            says no offset.
    """

    text = request.query_params.get(name)

    if text is None:
        raise api.InvalidArgumentError(f"{name} is required: an ISO 8601 time with its offset.")

    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        raise api.InvalidArgumentError(f"{name} must be an ISO 8601 time, not {text!r}.") from None

    if moment.tzinfo is None:
        raise api.InvalidArgumentError(f"{name} must say its offset, such as {OFFSET_EXAMPLE}.")

    return moment


def _choice(
    request: Request,
    name: str,
    choices: tuple[Choice, ...],
    said: str,
) -> Choice:
    """Return the choice one query parameter names, the first when it names none.

    Raises:
        InvalidArgumentError: It names one not listed.
    """

    text = request.query_params.get(name)

    if text is None:
        return choices[0]

    if text not in choices:
        raise api.InvalidArgumentError(f"{name} must be {said}, not {text!r}.")

    return text


def spend_query(
    request: Request,
) -> SpendQuery:
    """Return what a request asks a spend report of, refusing what Azathoth could not use.

    Raises:
        InvalidArgumentError: A time is missing or says no offset, a period
            or grouping is not listed, or the workflow is not an id.
    """

    workflow = request.query_params.get("workflow_id")

    try:
        workflow_id = None if workflow is None else UUID(workflow)
    except ValueError:
        raise api.InvalidArgumentError(f"{workflow!r} is not a workflow id.") from None

    return SpendQuery(
        since=_moment(request, "since"),
        until=_moment(request, "until"),
        period=_choice(request, "period", SPEND_PERIODS, "day, week or month"),
        group=_choice(request, "group", SPEND_GROUPS, "workflow, model, provider or source"),
        time_zone=request.query_params.get("time_zone", "UTC"),
        workflow_id=workflow_id,
    )


def get_spend(
    request: Request,
) -> Response:
    """`GET /api/spend?since=&until=&period=&group=&time_zone=&workflow_id=`: the report."""

    return one(instance_of(request).spend.report(**spend_query(request)))


def get_spend_csv(
    request: Request,
) -> Response:
    """`GET /api/spend.csv?...`: the same report, as Azathoth writes it as CSV, to download."""

    report = instance_of(request).spend.report(**spend_query(request))
    name = f"azathoth-spend-{report.since.date().isoformat()}-{report.until.date().isoformat()}"

    return Response(
        api.spend_csv(report),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}.csv"'},
    )


def spend_routes() -> list[Route]:
    """Return the spend endpoints, below an instance's prefix (ADR 0009)."""

    return [
        Route("/spend", get_spend, methods=["GET"]),
        Route("/spend.csv", get_spend_csv, methods=["GET"]),
    ]


__all__ = [
    "SPEND_GROUPS",
    "SPEND_PERIODS",
    "SpendQuery",
    "spend_query",
    "spend_routes",
]
