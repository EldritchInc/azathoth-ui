"""Tests of the models API: the providers' catalog, kept for a while, and the local portfolio."""

from collections.abc import Iterator, Mapping
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest
from azathoth import api
from starlette.testclient import TestClient

from azathoth_ui.app import build_app
from azathoth_ui.catalog import (
    BODY_MESSAGE,
    CATALOG_SECONDS,
    MAX_BODY_BYTES,
    Catalog,
    provider_names,
)
from tests.test_app import ORIGIN, PORT, TOKEN

LARGE = "openrouter/acme/large"

FREE = "openrouter/acme/small:free"

WORKFLOW_ID = UUID("a1000000-0000-4000-8000-000000000001")

STEP_ID = UUID("a1000000-0000-4000-8000-000000000002")

LISTED = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)


def summary(
    identifier: str,
    *,
    authorized: bool = False,
) -> api.ModelSummary:
    """Return one model a provider serves, as `azathoth.api` describes it."""

    provider, model = identifier.split("/", 1)

    return api.ModelSummary(
        identifier=identifier,
        provider=provider,
        model=model,
        display_name=model.title(),
        input_modalities=("image", "text"),
        output_modalities=("text",),
        capabilities=("structured_output", "tool_use"),
        context_window_tokens=200_000,
        maximum_output_tokens=None,
        input_usd_per_million_tokens=3.0,
        output_usd_per_million_tokens=None,
        authorized=authorized,
        command=f"azathoth model show {identifier}",
    )


class Models:
    """Providers that serve a few models, or cannot be asked."""

    def __init__(
        self,
        *identifiers: str,
    ) -> None:
        self.models = tuple(summary(identifier) for identifier in identifiers)
        self.error: api.ApiError | None = None
        self.asked = 0
        self.matched = 0

    def list(self) -> tuple[api.ModelSummary, ...]:
        """Return what the providers serve, counting each time they are asked."""

        self.asked += 1

        if self.error is not None:
            raise self.error

        return self.models

    def matching(
        self,
        requirements: Mapping[str, object],
    ) -> tuple[api.ModelSummary, ...]:
        """Return the served models with every capability asked, counting each time asked."""

        self.matched += 1

        if self.error is not None:
            raise self.error

        if set(requirements) - {"required_capabilities"}:
            raise api.InvalidArgumentError("Unknown model requirement 'fast'.")

        needed = requirements.get("required_capabilities", [])

        assert isinstance(needed, list)

        return tuple(
            model.model_copy(update={"authorized": True})
            for model in self.models
            if all(capability in model.capabilities for capability in needed)
        )


class Portfolio:
    """A local portfolio of the models `served` names, where some are in production."""

    def __init__(
        self,
        *served: str,
    ) -> None:
        self.served = served
        self.entries: list[api.PortfolioEntry] = []
        self.in_production: set[str] = set()

    def list(self) -> tuple[api.PortfolioEntry, ...]:
        """Return every authorized model, oldest first."""

        return tuple(self.entries)

    def add(
        self,
        identifier: str,
    ) -> api.PortfolioEntry:
        """Authorize a model, as `azathoth.api.Portfolio.add` does."""

        if identifier not in self.served:
            raise api.NotFoundError(f"Model {identifier!r} is not currently available.")

        if any(entry.identifier == identifier for entry in self.entries):
            raise api.ConflictError(f"Model {identifier!r} is already authorized.")

        provider, model = identifier.split("/", 1)
        entry = api.PortfolioEntry(
            identifier=identifier,
            provider=provider,
            model=model,
            content_digest="0" * 64,
            author=None,
            added_at=None,
            data_policy=api.DataPolicy(),
            receives_restricted=False,
            policy_declared_by=None,
            policy_declared_at=None,
            command=f"azathoth model show {identifier}",
        )
        self.entries.append(entry)

        return entry

    def remove(
        self,
        identifier: str,
        *,
        force: bool = False,
    ) -> api.PortfolioRemoval:
        """Stop authorizing a model, keeping one production uses unless forced."""

        dependents = (
            (
                api.ProductionDependent(
                    workflow_id=WORKFLOW_ID,
                    workflow_name="summarize",
                    steps=(api.ProductionStepUsage(step_id=STEP_ID, role="primary"),),
                ),
            )
            if identifier in self.in_production
            else ()
        )

        if dependents and not force:
            raise api.ModelInUseError(
                f"Model {identifier!r} is in use by active production.", dependents=dependents
            )

        self.entries = [entry for entry in self.entries if entry.identifier != identifier]

        return api.PortfolioRemoval(
            identifier=identifier,
            dependents=dependents,
            command=f"azathoth model deauthorize {identifier}",
        )


class Clock:
    """A clock that moves only when told to."""

    def __init__(self) -> None:
        self.seconds = 0.0

    def __call__(self) -> float:
        return self.seconds


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield a new instance in its own SQLite file, closed afterwards."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.open(database) as opened:
        yield opened


def client_of(
    instance: api.Azathoth,
    tmp_path: Path,
    models: Models,
    portfolio: Portfolio,
) -> TestClient:
    """Return a signed-in client of an app that lists and authorizes models with the fakes."""

    app = build_app(
        instance,
        token=TOKEN,
        port=PORT,
        static_dir=tmp_path / "missing",
        models=models,
        portfolio=portfolio,
    )
    client = TestClient(app, base_url=ORIGIN, follow_redirects=False)

    assert client.get(f"/?token={TOKEN}").status_code == 303

    return client


def change(
    client: TestClient,
    path: str,
    body: object,
) -> tuple[int, object]:
    """Post one change from the web app, and return its status and answer."""

    response = client.post(path, json=body, headers={"origin": ORIGIN})

    return response.status_code, response.json()


def test_the_catalog_lists_what_the_providers_serve_marked_by_the_local_portfolio(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    models, portfolio = Models(LARGE, FREE), Portfolio(LARGE, FREE)
    portfolio.add(FREE)
    client = client_of(instance, tmp_path, models, portfolio)

    response = client.get("/api/models")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert [(item["identifier"], item["authorized"]) for item in response.json()["items"]] == [
        (LARGE, False),
        (FREE, True),
    ]
    assert response.json()["items"][0] == summary(LARGE).model_dump(mode="json")
    assert response.json()["listed_at"].endswith("Z")


def test_the_catalog_is_kept_until_it_is_refreshed_and_marks_the_portfolio_as_it_is_now(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    models, portfolio = Models(LARGE), Portfolio(LARGE)
    client = client_of(instance, tmp_path, models, portfolio)

    first = client.get("/api/models").json()
    assert change(client, "/api/local/portfolio", {"identifier": LARGE})[0] == 201
    second = client.get("/api/models").json()

    assert models.asked == 1
    assert second["listed_at"] == first["listed_at"]
    assert second["items"][0]["authorized"] is True
    assert client.get(f"/api/models/{LARGE}").json()["authorized"] is True

    client.get("/api/models?refresh=true")

    assert models.asked == 2


def test_a_refresh_must_be_true_or_false(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = client_of(instance, tmp_path, Models(), Portfolio())

    response = client.get("/api/models?refresh=yes")

    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "invalid_argument",
        "message": "refresh must be true or false, not 'yes'.",
    }


def test_a_provider_that_cannot_be_asked_is_reported_and_asked_again_next_time(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    models = Models(LARGE)
    models.error = api.ProviderUnavailableError("OpenRouter did not answer.")
    client = client_of(instance, tmp_path, models, Portfolio())

    response = client.get("/api/models")

    assert response.status_code == 502
    assert response.json()["error"] == {
        "code": "provider_unavailable",
        "message": "OpenRouter did not answer.",
    }

    models.error = None

    assert client.get("/api/models").status_code == 200
    assert models.asked == 2


def test_one_model_is_found_by_its_identifier_slashes_colons_and_all(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = client_of(instance, tmp_path, Models(LARGE, FREE), Portfolio())

    response = client.get("/api/models/openrouter/acme/small%3Afree")
    missing = client.get("/api/models/openrouter/acme/gone")

    assert response.status_code == 200
    assert response.json() == summary(FREE).model_dump(mode="json")
    assert missing.status_code == 404
    assert missing.json()["error"] == {
        "code": "not_found",
        "message": "Model 'openrouter/acme/gone' is not currently available.",
    }


def test_a_model_is_added_to_the_local_portfolio_and_listed_there(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    portfolio = Portfolio(LARGE, FREE)
    client = client_of(instance, tmp_path, Models(LARGE, FREE), portfolio)

    status, answer = change(client, "/api/local/portfolio", {"identifier": FREE})

    assert status == 201
    assert answer == portfolio.entries[0].model_dump(mode="json")
    assert client.get("/api/local/portfolio").json() == {"items": [answer]}


def test_adding_reports_what_azathoth_refuses(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = client_of(instance, tmp_path, Models(LARGE), Portfolio(LARGE))

    assert change(client, "/api/local/portfolio", {"identifier": FREE}) == (
        404,
        {
            "error": {
                "code": "not_found",
                "message": f"Model {FREE!r} is not currently available.",
            }
        },
    )

    change(client, "/api/local/portfolio", {"identifier": LARGE})
    status, answer = change(client, "/api/local/portfolio", {"identifier": LARGE})

    assert status == 409
    assert answer == {
        "error": {"code": "conflict", "message": f"Model {LARGE!r} is already authorized."}
    }


@pytest.mark.parametrize(
    "body",
    [{}, {"identifier": ""}, {"identifier": 3}, ["openrouter/acme/large"], "large"],
)
def test_a_change_must_name_a_model(
    instance: api.Azathoth,
    tmp_path: Path,
    body: object,
) -> None:
    client = client_of(instance, tmp_path, Models(LARGE), Portfolio(LARGE))

    status, answer = change(client, "/api/local/portfolio", body)

    assert status == 422
    assert isinstance(answer, dict)
    assert answer["error"]["code"] == "invalid_argument"


def test_a_change_must_be_a_small_json_object(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = client_of(instance, tmp_path, Models(LARGE), Portfolio(LARGE))
    headers = {"origin": ORIGIN, "content-type": "application/json"}

    not_json = client.post(
        "/api/local/portfolio",
        content=b'{"identifier": "' + LARGE.encode() + b'"}',
        headers={"origin": ORIGIN, "content-type": "text/plain"},
    )
    broken = client.post("/api/local/portfolio", content=b"{", headers=headers)
    large = client.post(
        "/api/local/portfolio",
        content=b'{"identifier": "' + b"x" * MAX_BODY_BYTES + b'"}',
        headers=headers,
    )

    for response in (not_json, broken, large):
        assert response.status_code == 422
        assert response.json()["error"] == {"code": "invalid_argument", "message": BODY_MESSAGE}


def test_a_model_is_removed_from_the_local_portfolio(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    portfolio = Portfolio(LARGE)
    portfolio.add(LARGE)
    client = client_of(instance, tmp_path, Models(LARGE), portfolio)

    status, answer = change(client, "/api/local/portfolio/remove", {"identifier": LARGE})

    assert status == 200
    assert answer == {
        "identifier": LARGE,
        "dependents": [],
        "command": f"azathoth model deauthorize {LARGE}",
    }
    assert portfolio.entries == []


def test_a_model_local_production_uses_is_kept_unless_the_removal_is_forced(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    portfolio = Portfolio(LARGE)
    portfolio.add(LARGE)
    portfolio.in_production.add(LARGE)
    client = client_of(instance, tmp_path, Models(LARGE), portfolio)
    dependents = [
        {
            "workflow_id": str(WORKFLOW_ID),
            "workflow_name": "summarize",
            "steps": [{"step_id": str(STEP_ID), "role": "primary"}],
        }
    ]

    refused = change(client, "/api/local/portfolio/remove", {"identifier": LARGE})
    forced = change(client, "/api/local/portfolio/remove", {"identifier": LARGE, "force": True})

    assert refused == (
        409,
        {
            "error": {
                "code": "model_in_use",
                "message": f"Model {LARGE!r} is in use by active production.",
                "dependents": dependents,
            }
        },
    )
    assert forced[0] == 200
    assert isinstance(forced[1], dict)
    assert forced[1]["dependents"] == dependents
    assert portfolio.entries == []


def test_a_forced_removal_must_say_true_or_false(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = client_of(instance, tmp_path, Models(LARGE), Portfolio(LARGE))

    assert change(client, "/api/local/portfolio/remove", {"identifier": LARGE, "force": "yes"}) == (
        422,
        {"error": {"code": "invalid_argument", "message": "force must be true or false."}},
    )


def test_a_change_needs_this_servers_origin(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    portfolio = Portfolio(LARGE)
    client = client_of(instance, tmp_path, Models(LARGE), portfolio)

    response = client.post("/api/local/portfolio", json={"identifier": LARGE})

    assert response.status_code == 403
    assert portfolio.entries == []


def test_the_instances_own_portfolio_is_used_by_default(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    app = build_app(instance, token=TOKEN, port=PORT, static_dir=tmp_path / "missing")
    client = TestClient(app, base_url=ORIGIN)
    client.get(f"/?token={TOKEN}")

    assert client.get("/api/local/portfolio").json() == {"items": []}
    assert client.get("/api/models").json()["items"] == []


def test_the_catalog_asks_again_once_what_it_keeps_is_old() -> None:
    models, clock = Models(LARGE), Clock()
    catalog = Catalog(models, clock=clock, now=lambda: LISTED)

    assert catalog.listing() == (LISTED, models.models)

    clock.seconds = CATALOG_SECONDS - 1
    catalog.listing()

    assert models.asked == 1

    clock.seconds = CATALOG_SECONDS
    catalog.listing()

    assert models.asked == 2

    catalog.listing(refresh=True)

    assert models.asked == 3


#
# The models a step's requirements match
#


def test_the_models_a_steps_requirements_match_are_listed(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    models = Models(LARGE, FREE)
    client = client_of(instance, tmp_path, models, Portfolio(LARGE, FREE))

    status, answer = change(
        client,
        "/api/models/matching",
        {"requirements": {"required_capabilities": ["tool_use"]}},
    )

    assert status == 200
    assert isinstance(answer, dict)
    assert [item["identifier"] for item in answer["items"]] == [LARGE, FREE]
    assert all(item["authorized"] for item in answer["items"])


def test_the_same_requirements_are_matched_once_until_the_portfolio_changes(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    models = Models(LARGE, FREE)
    client = client_of(instance, tmp_path, models, Portfolio(LARGE, FREE))
    asked = {"requirements": {"required_capabilities": ["tool_use"]}}

    change(client, "/api/models/matching", asked)
    change(client, "/api/models/matching", asked)

    assert models.matched == 1

    change(client, "/api/models/matching", {"requirements": {}})

    assert models.matched == 2

    change(client, "/api/local/portfolio", {"identifier": LARGE})
    change(client, "/api/models/matching", asked)

    assert models.matched == 3

    change(client, "/api/local/portfolio/remove", {"identifier": LARGE})
    change(client, "/api/models/matching", asked)

    assert models.matched == 4

    client.get("/api/models?refresh=true")
    change(client, "/api/models/matching", asked)

    assert models.matched == 5


def test_requirements_matched_again_once_what_is_kept_is_old() -> None:
    clock = Clock()
    models = Models(LARGE)
    catalog = Catalog(models, clock=clock)

    catalog.matching({})
    clock.seconds = CATALOG_SECONDS - 1
    catalog.matching({})

    assert models.matched == 1

    clock.seconds = CATALOG_SECONDS
    catalog.matching({})

    assert models.matched == 2


def test_requirements_azathoth_refuses_are_refused(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = client_of(instance, tmp_path, Models(LARGE), Portfolio(LARGE))

    status, answer = change(client, "/api/models/matching", {"requirements": {"fast": True}})

    assert status == 422
    assert answer == {
        "error": {"code": "invalid_argument", "message": "Unknown model requirement 'fast'."}
    }


@pytest.mark.parametrize("body", [{}, {"requirements": []}, {"requirements": {}, "more": 1}])
def test_requirements_must_be_an_object_and_nothing_else(
    instance: api.Azathoth,
    tmp_path: Path,
    body: object,
) -> None:
    client = client_of(instance, tmp_path, Models(LARGE), Portfolio(LARGE))

    status, answer = change(client, "/api/models/matching", body)

    assert status == 422
    assert answer == {
        "error": {
            "code": "invalid_argument",
            "message": 'Send {"requirements": {...}}, a step\'s model requirements.',
        }
    }


def test_a_provider_that_cannot_be_asked_while_matching_is_reported(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    models = Models(LARGE)
    models.error = api.ProviderUnavailableError("OpenRouter could not be reached.")
    client = client_of(instance, tmp_path, models, Portfolio(LARGE))

    status, _ = change(client, "/api/models/matching", {"requirements": {}})

    assert status == 502


def test_the_providers_are_named_and_never_their_keys() -> None:
    assert provider_names(api.ProviderSettings()) == ()
    assert provider_names(api.ProviderSettings.from_environment({"OPENROUTER_API_KEY": "k"})) == (
        "openrouter",
    )
    assert provider_names(
        api.ProviderSettings(bedrock_environment=(("AZATHOTH_BEDROCK", "1"),))
    ) == ("bedrock",)
    assert provider_names(
        api.ProviderSettings.from_environment({"OPENROUTER_API_KEY": "k"}).model_copy(
            update={"bedrock_environment": (("AZATHOTH_BEDROCK", "1"),)}
        )
    ) == ("openrouter", "bedrock")
