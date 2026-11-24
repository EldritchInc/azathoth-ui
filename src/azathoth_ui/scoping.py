"""Which instance a request acts on, so no endpoint assumes it is the editor's own (ADR 0009).

The editor serves the same endpoints for every instance it works on: its
own local one at `/api`, and each remote under `/api/remotes/{name}`
(ADR 0016). Each is served for one `InstanceContext`, which the request
carries in its scope, so a handler is given its instance and everything
kept with it, and reads nothing about it from the app.
"""

from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext
from dataclasses import dataclass, field
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
    `instance` answers the request: the editor's own instance, or one
    connected to a remote for this request alone. `catalog` and `portfolio`
    are where its models are listed and authorized, and `live` keeps the
    runs started on it from the editor. `command_prefix` is what goes
    before an `azathoth` command so that it acts on this instance, and
    `command_suffix` what goes after it. `lasting` opens an instance a live
    run may use until it ends, after the request that started it has been
    answered: the instance itself, unless one is given. `allows` says
    whether the person may take an action of Azathoth's action catalog, on
    a resource the policy names or on none: on the editor's own instance,
    with none given, they may take every one.
    """

    name: str
    instance: api.Instance
    catalog: Catalog
    portfolio: PortfolioSource
    live: LiveRuns
    command_prefix: str
    command_suffix: str = ""
    lasting: Callable[[], AbstractContextManager[api.Instance]] | None = field(
        default=None,
        compare=False,
    )
    allows: Callable[[str, str | None], bool] | None = field(
        default=None,
        compare=False,
    )

    def may(
        self,
        action: str,
        resource: str | None = None,
    ) -> bool:
        """Return whether the person may take one action here, on a resource or on none."""

        return True if self.allows is None else self.allows(action, resource)

    def opener(
        self,
    ) -> Callable[[], AbstractContextManager[api.Instance]]:
        """Return what opens the instance a live run uses until it ends, and then closes."""

        if self.lasting is not None:
            return self.lasting

        instance = self.instance

        return lambda: nullcontext(instance)


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


def lasting_of(
    request: Request,
) -> Callable[[], AbstractContextManager[api.Instance]]:
    """Return what opens, for a live run's thread, the instance one request acts on.

    On a remote, the instance that answers a request is closed once it is
    answered, so a live run opens one of its own, and closes it when it ends.
    """

    return context_of(request).opener()


__all__ = [
    "INSTANCE_SCOPE_KEY",
    "LOCAL_INSTANCE",
    "InstanceContext",
    "context_of",
    "lasting_of",
]
