"""Which instance a request acts on, so no endpoint assumes it is the editor's own (ADR 0009).

The editor serves the same endpoints for every instance it works on: its
own local one at `/api`, and, from Azathoth 1.6, each remote under
`/api/remotes/{name}`. Each is built for one `InstanceContext`, which the
request carries in its scope, so a handler is given its instance and
everything kept with it, and reads nothing about it from the app.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Final

from starlette.requests import Request

if TYPE_CHECKING:
    from azathoth import api

    from azathoth_ui.catalog import Catalog, PortfolioSource
    from azathoth_ui.live import LiveRuns

INSTANCE_SCOPE_KEY: Final = "azathoth_ui.instance"
"""Where a request's scope carries the `InstanceContext` it acts on."""

LOCAL_INSTANCE: Final = "local"
"""The name the editor gives its own instance, which no address spells out."""


@dataclass(frozen=True)
class InstanceContext:
    """One instance the editor works on, and what the editor keeps for it.

    `name` is how the editor names it: `local`, or a remote's name.
    `catalog` and `portfolio` are where its models are listed and
    authorized, and `live` keeps the runs started on it from the editor.
    `command_prefix` is what goes before an `azathoth` command so that it
    acts on this instance.
    """

    name: str
    instance: api.Azathoth
    catalog: Catalog
    portfolio: PortfolioSource
    live: LiveRuns
    command_prefix: str


def context_of(
    request: Request,
) -> InstanceContext:
    """Return the instance one request acts on.

    Raises:
        RuntimeError: The request reached an endpoint not built for an
            instance, which is a mistake in the editor, never the caller's.
    """

    context = request.scope.get(INSTANCE_SCOPE_KEY)

    if not isinstance(context, InstanceContext):
        raise RuntimeError(f"{request.url.path} is not served for an instance.")

    return context


__all__ = [
    "INSTANCE_SCOPE_KEY",
    "LOCAL_INSTANCE",
    "InstanceContext",
    "context_of",
]
