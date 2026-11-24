"""A remote's endpoints, under its name, served as the editor's own are (ADR 0016).

Every endpoint that acts on an instance is served for each remote the
editor's instance names, under `/api/remotes/{name}`: `/api/remotes/origin/workflows`
answers as `/api/workflows` does, from the remote named `origin`. The
remote's status, a push to it and a pull from it stay where ADR 0008 put
them.

Each request reaches the remote afresh, with the token its name's variable
holds now, as a push does, through the service API the remote serves
(Azathoth's ADR 0127). The instance connected for a request answers it
alone, and is closed once it is answered, so nothing a remote sends is
kept (ADR 0009). A live run, which goes on after the request that starts
it, connects an instance of its own and closes it when it ends; the live
runs started on each remote are kept by its name, so the run can be watched.

A name the editor's instance does not give is 404, and a name whose token
is not set is refused as an invalid argument, before anything is sent. A
remote that cannot be reached is 502, and one whose policy refuses the
caller is 403, saying why in the policy's words. What the person may do
there is asked of the remote's policy, as `/api/remotes/{name}/permissions`
asks it, so a restricted case is compared only where they may read it.
"""

import threading
from collections.abc import Sequence

from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.routing import BaseRoute, Router
from starlette.types import ASGIApp, Receive, Scope, Send

from azathoth_ui.catalog import Catalog
from azathoth_ui.live import LiveRuns
from azathoth_ui.remote_service import service_of
from azathoth_ui.remotes import reached
from azathoth_ui.scoping import INSTANCE_SCOPE_KEY, InstanceContext

REMOTE_PREFIX = "/api/remotes/{name}"
"""Where a remote's endpoints are served, below its name."""


class RemoteLiveRuns:
    """The live runs started on each remote, kept by its name, for as long as the editor runs."""

    def __init__(
        self,
    ) -> None:
        self._lock = threading.Lock()
        self._kept: dict[str, LiveRuns] = {}

    def of(
        self,
        name: str,
    ) -> LiveRuns:
        """Return the live runs started on the remote with one name."""

        with self._lock:
            return self._kept.setdefault(name, LiveRuns())


def remote_suffix(
    name: str,
) -> str:
    """Return what goes after an `azathoth` command so that it runs on the remote named.

    A remote's name is letters, digits, `_` and `-`, so it needs no quoting
    in any shell.
    """

    return f" --remote {name}"


def remote_context(
    request: Request,
    live: RemoteLiveRuns,
) -> InstanceContext:
    """Return the remote the path names, connected for this request, and what is kept for it.

    Raises:
        NotFoundError: The editor's instance gives no remote this name.
        InvalidArgumentError: Its token variable is not set.
    """

    remote = reached(request)
    name = request.path_params["name"]
    service = service_of(request)
    instance = remote.connect()

    return InstanceContext(
        name=name,
        instance=instance,
        catalog=Catalog(instance.models),
        portfolio=instance.portfolio,
        live=live.of(name),
        command_prefix="",
        command_suffix=remote_suffix(name),
        lasting=remote.connect,
        allows=service.allows,
    )


class RemoteInstances:
    """Serves every endpoint that acts on an instance, for the remote a request's path names."""

    def __init__(
        self,
        endpoints: Sequence[BaseRoute],
        *,
        missing: ASGIApp,
        live: RemoteLiveRuns,
    ) -> None:
        """Serve `endpoints` for each remote, answering a path none of them serves with `missing`.

        `live` keeps the live runs started on each remote, by its name.
        """

        self._router = Router(routes=list(endpoints), default=missing)
        self._live = live

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        """Answer one request from the remote its path names, then close what answered it."""

        request = Request(scope, receive)
        context = await run_in_threadpool(remote_context, request, self._live)
        scope[INSTANCE_SCOPE_KEY] = context

        try:
            await self._router(scope, receive, send)
        finally:
            await run_in_threadpool(context.instance.close)


__all__ = [
    "REMOTE_PREFIX",
    "RemoteInstances",
    "RemoteLiveRuns",
    "remote_context",
    "remote_suffix",
]
