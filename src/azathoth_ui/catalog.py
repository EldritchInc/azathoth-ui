"""The models API: what the providers serve, and the editor's local portfolio (ADR 0006).

The catalog asks every configured provider what it serves, which reaches
the network and records what changed, so the editor keeps what it last
heard for `CATALOG_SECONDS` and asks again only when that has passed or a
person asks to refresh. Whether a model is in the local portfolio is read
from the database on every answer, so adding or removing one shows at once.

The portfolio here is the editor's own instance's, for building and
testing: changing it never touches a shared instance or what production
may use there.

Adding and removing are `POST`s with a JSON body, as every change to the
editor's instance is (ADR 0003). A model production uses in this instance is
kept unless the removal is forced, and the refusal names the workflows and
steps that use it.
"""

import json
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Final, Protocol

from azathoth import api
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import BaseRoute, Route

CATALOG_SECONDS: Final = 600.0
"""How long the editor keeps what the providers last said they serve."""

MAX_BODY_BYTES: Final = 64 * 1024
"""The largest request body a portfolio change takes."""

BODY_MESSAGE: Final = 'Send a JSON object, such as {"identifier": "openrouter/acme/large"}.'


class ModelSource(Protocol):
    """What the providers serve now, as `azathoth.api.Models` answers."""

    def list(self) -> tuple[api.ModelSummary, ...]:
        """Return every model the configured providers serve now."""
        ...


class PortfolioSource(Protocol):
    """The models an instance authorizes, as `azathoth.api.Portfolio` keeps them."""

    def list(self) -> tuple[api.PortfolioEntry, ...]:
        """Return every authorized model."""
        ...

    def add(self, identifier: str) -> api.PortfolioEntry:
        """Authorize one model a provider serves now."""
        ...

    def remove(self, identifier: str, *, force: bool = False) -> api.PortfolioRemoval:
        """Stop authorizing one model."""
        ...


class Catalog:
    """What the providers last said they serve, kept for a while.

    One listing is made at a time, so a burst of requests asks the providers
    once. A failed listing is not kept: the next request asks again.
    """

    def __init__(
        self,
        models: ModelSource,
        *,
        seconds: float = CATALOG_SECONDS,
        clock: Callable[[], float] = time.monotonic,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        """Keep what `models` lists for `seconds`, by `clock`; `now` dates each listing."""

        self._models = models
        self._seconds = seconds
        self._clock = clock
        self._now = now
        self._lock = threading.Lock()
        self._kept: tuple[float, datetime, tuple[api.ModelSummary, ...]] | None = None

    def listing(
        self,
        *,
        refresh: bool = False,
    ) -> tuple[datetime, tuple[api.ModelSummary, ...]]:
        """Return when the providers were last asked, and what they serve.

        The providers are asked again when nothing is kept, what is kept is
        older than this catalog keeps it, or `refresh` is set.

        Raises:
            ProviderUnavailableError: A provider could not be asked.
            ProviderConfigurationError: A provider cannot be used as configured.
        """

        with self._lock:
            kept = self._kept

            if refresh or kept is None or self._clock() - kept[0] >= self._seconds:
                models = self._models.list()
                kept = (self._clock(), self._now(), models)
                self._kept = kept

            return kept[1], kept[2]


def provider_names(
    settings: api.ProviderSettings,
) -> tuple[str, ...]:
    """Return the names of the providers the settings turn on, never their keys."""

    return (
        *(("openrouter",) if settings.openrouter_api_key is not None else ()),
        *(("bedrock",) if settings.bedrock_environment else ()),
    )


def catalog_of(
    request: Request,
) -> Catalog:
    """Return the catalog the editor keeps."""

    catalog: Catalog = request.app.state.catalog

    return catalog


def portfolio_of(
    request: Request,
) -> PortfolioSource:
    """Return the editor's local portfolio."""

    portfolio: PortfolioSource = request.app.state.portfolio

    return portfolio


def flag(
    request: Request,
    name: str,
) -> bool:
    """Return whether one query parameter is `true`; absent, it is `false`."""

    text = request.query_params.get(name, "false")

    if text not in ("true", "false"):
        raise api.InvalidArgumentError(f"{name} must be true or false, not {text!r}.")

    return text == "true"


def as_authorized(
    models: tuple[api.ModelSummary, ...],
    portfolio: PortfolioSource,
) -> tuple[api.ModelSummary, ...]:
    """Return the models, each marked by whether the local portfolio holds it now."""

    authorized = {entry.identifier for entry in portfolio.list()}

    return tuple(
        model.model_copy(update={"authorized": model.identifier in authorized}) for model in models
    )


def listed_at(
    moment: datetime,
) -> str:
    """Return a moment as the API writes it: UTC, in ISO 8601, ending in `Z`."""

    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


def list_models(
    request: Request,
) -> Response:
    """`GET /api/models?refresh=`: every model the providers serve, and when they were asked."""

    moment, models = catalog_of(request).listing(refresh=flag(request, "refresh"))
    marked = as_authorized(models, portfolio_of(request))

    return JSONResponse(
        {
            "items": [model.model_dump(mode="json") for model in marked],
            "listed_at": listed_at(moment),
        }
    )


def get_model(
    request: Request,
) -> Response:
    """`GET /api/models/{identifier}`: one model the providers serve, from the catalog."""

    identifier: str = request.path_params["identifier"]
    _, models = catalog_of(request).listing()
    found = next((model for model in models if model.identifier == identifier), None)

    if found is None:
        raise api.NotFoundError(f"Model {identifier!r} is not currently available.")

    (marked,) = as_authorized((found,), portfolio_of(request))

    return JSONResponse(marked.model_dump(mode="json"))


async def body_of(
    request: Request,
) -> dict[str, object]:
    """Return a change's JSON object, or refuse it as an invalid argument."""

    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    body = bytearray()

    async for chunk in request.stream():
        body.extend(chunk)

        if len(body) > MAX_BODY_BYTES:
            raise api.InvalidArgumentError(BODY_MESSAGE)

    if media_type != "application/json":
        raise api.InvalidArgumentError(BODY_MESSAGE)

    try:
        value: object = json.loads(body.decode("utf-8"))
    except ValueError:
        raise api.InvalidArgumentError(BODY_MESSAGE) from None

    if not isinstance(value, dict):
        raise api.InvalidArgumentError(BODY_MESSAGE)

    return {str(key): item for key, item in value.items()}


def text_field(
    body: dict[str, object],
    name: str,
) -> str:
    """Return one text field of a change's body, or refuse it as an invalid argument."""

    value = body.get(name)

    if not isinstance(value, str) or value == "":
        raise api.InvalidArgumentError(
            f"{name} must be a model identifier, such as openrouter/acme/large."
        )

    return value


def list_portfolio(
    request: Request,
) -> Response:
    """`GET /api/local/portfolio`: every model the local portfolio authorizes, oldest first."""

    return JSONResponse(
        {"items": [entry.model_dump(mode="json") for entry in portfolio_of(request).list()]}
    )


async def add_to_portfolio(
    request: Request,
) -> Response:
    """`POST /api/local/portfolio` `{"identifier"}`: authorize one model locally: 201."""

    identifier = text_field(await body_of(request), "identifier")
    entry = await run_in_threadpool(portfolio_of(request).add, identifier)

    return JSONResponse(entry.model_dump(mode="json"), status_code=201)


async def remove_from_portfolio(
    request: Request,
) -> Response:
    """`POST /api/local/portfolio/remove` `{"identifier", "force"}`: stop authorizing one here."""

    body = await body_of(request)
    identifier = text_field(body, "identifier")
    force = body.get("force", False)

    if not isinstance(force, bool):
        raise api.InvalidArgumentError("force must be true or false.")

    removal = await run_in_threadpool(lambda: portfolio_of(request).remove(identifier, force=force))

    return JSONResponse(removal.model_dump(mode="json"))


def model_in_use(
    request: Request,
    error: Exception,
) -> Response:
    """Answer a removal Azathoth refused with the workflows and steps that use the model."""

    assert isinstance(error, api.ModelInUseError)

    return JSONResponse(
        {
            "error": {
                "code": error.code,
                "message": str(error),
                "dependents": [dependent.model_dump(mode="json") for dependent in error.dependents],
            }
        },
        status_code=409,
    )


def catalog_routes() -> list[BaseRoute]:
    """Return the models API's routes."""

    return [
        Route("/api/models", list_models, methods=["GET"]),
        Route("/api/models/{identifier:path}", get_model, methods=["GET"]),
        Route("/api/local/portfolio", list_portfolio, methods=["GET"]),
        Route("/api/local/portfolio", add_to_portfolio, methods=["POST"]),
        Route("/api/local/portfolio/remove", remove_from_portfolio, methods=["POST"]),
    ]


__all__ = [
    "BODY_MESSAGE",
    "CATALOG_SECONDS",
    "MAX_BODY_BYTES",
    "Catalog",
    "ModelSource",
    "PortfolioSource",
    "catalog_routes",
    "model_in_use",
    "provider_names",
]
