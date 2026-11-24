"""What a remote says of the service API it serves, and of what the caller may do (ADR 0016).

`GET /api/remotes/{name}/service` answers what the remote answers at `GET
/v1/service`: the Azathoth serving it, the stability of its service API,
its protocol, its edition and what its policy says more of it, and how
its jobs stand. `GET /api/remotes/{name}/permissions` answers what it
says at `GET /v1/permissions`: every action, and whether its policy lets
the caller the editor's token names take it, saying why not when it does
not. `POST` there with `{"resources": [...]}` asks the same of each
resource, as the policy names one: its kind and its ID, such as
`benchmark <ID>`. Each is advice for what the web app shows; every call
the editor makes of a remote is still asked of its policy there.

The editor reads these answers itself, as JSON, since they are no call of
the service API, and relays each as the remote gave it. A remote is reached
afresh for each, with the token its name's variable holds now. A refusal is
answered as the service API's error it is: what the policy refuses is 403
in its words, a remote that cannot be reached or answers as none does is
502, and one that cannot answer now is 503.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from http import HTTPStatus
from typing import Any, Final

import httpx
from azathoth import api
from azathoth.api.remote import no_token_message
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import BaseRoute, Route

from azathoth_ui.catalog import body_of
from azathoth_ui.remotes import environ_of, instance_of, remote_http_of

SERVICE_PATH: Final = "/v1/service"
"""Where a remote describes the service API it serves."""

PERMISSIONS_PATH: Final = "/v1/permissions"
"""Where a remote says what the caller may do."""

MAX_RESOURCES: Final = 100
"""How many resources one ask may name, as many as a remote answers about at once."""

TIMEOUT_SECONDS: Final = 30.0
"""How long the editor waits for a remote to answer one of these requests."""

PERMISSIONS_MESSAGE: Final = (
    f'Send {{"resources": [<resource>]}}, 1 to {MAX_RESOURCES}, each a kind and an ID: '
    '"benchmark <ID>".'
)

REFUSED_KINDS: Final[dict[str, type[api.ApiError]]] = {
    api.InvalidArgumentError.code: api.InvalidArgumentError,
    api.PermissionDeniedError.code: api.PermissionDeniedError,
}
"""The service API's errors a remote refuses these requests with, by their codes."""


@dataclass(frozen=True)
class RemoteService:
    """One remote, reached with one token, to ask what it serves and what the caller may do.

    `http` makes the HTTP client a request is sent over, as tests give one;
    otherwise each is sent over an httpx client of its own.
    """

    url: str
    token: str = field(repr=False)
    http: Callable[[], Any] | None = None

    def answer(
        self,
        method: str,
        path: str,
        body: object = None,
    ) -> dict[str, Any]:
        """Return the JSON object a remote answers one request with.

        Raises:
            ApiError: The remote refused it, as the error the refusal names.
            RemoteUnavailableError: It could not answer now.
            RemoteRefusedError: It refused it otherwise, as an unknown token.
            RemoteUnreachableError: It was not reached, serves no service
                API, or answered as no remote does.
        """

        what = f"{method} {path}"
        owned = self.http is None
        client = (
            httpx.Client(base_url=self.url, timeout=TIMEOUT_SECONDS)
            if self.http is None
            else self.http()
        )

        try:
            response = client.request(
                method,
                path,
                content=None if body is None else json.dumps(body),
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                },
            )
        except httpx.HTTPError as exc:
            raise api.RemoteUnreachableError(
                f"The remote at {self.url} could not be reached: {exc}"
            ) from exc
        finally:
            if owned:
                client.close()

        status: int = response.status_code
        content: bytes = response.content

        if not response.is_success:
            raise self.refused(what, status, content)

        try:
            answered: object = json.loads(content)
        except ValueError:
            answered = None

        if not isinstance(answered, dict):
            raise self.unlike_its_answer(what)

        return answered

    def refused(
        self,
        what: str,
        status: int,
        content: bytes,
    ) -> api.ApiError:
        """Return the error one refusal is, or say the remote answered as none does.

        Neither path is ever missing from a remote serving the service API,
        so a 404 says the remote serves none.
        """

        if status == HTTPStatus.NOT_FOUND:
            return api.RemoteUnreachableError(
                f"The remote at {self.url} does not serve {what}; it may not serve the service "
                "API, which a remote does from Azathoth 1.6."
            )

        try:
            refusal: object = json.loads(content)
        except ValueError:
            refusal = None

        if (
            isinstance(refusal, dict)
            and isinstance(refusal.get("error"), str)
            and isinstance(refusal.get("code"), str)
        ):
            message: str = refusal["error"]
            code: str = refusal["code"]
            kind = REFUSED_KINDS.get(code)

            if kind is not None:
                return kind(message)

            if status == HTTPStatus.SERVICE_UNAVAILABLE:
                return api.RemoteUnavailableError(message, status=status, refusal=code)

            return api.RemoteRefusedError(message, status=status, refusal=code)

        return api.RemoteUnreachableError(
            f"The remote at {self.url} answered {what} with {status} without saying why; it "
            "may not be an Azathoth remote."
        )

    def unlike_its_answer(
        self,
        what: str,
    ) -> api.RemoteUnreachableError:
        """Return the error of an answer that is not what the remote serves there."""

        return api.RemoteUnreachableError(
            f"The remote at {self.url} answered {what} with something other than its answer; "
            "it may serve another version of the service API."
        )

    def allows(
        self,
        action: str,
        resource: str | None = None,
    ) -> bool:
        """Return whether the remote's policy lets the caller take an action, on a resource.

        Raises:
            ApiError: As `answer` does, and `RemoteUnreachableError` when
                the remote's answer names no such resource or action.
        """

        if resource is None:
            what = f"GET {PERMISSIONS_PATH}"
            actions = self.answer("GET", PERMISSIONS_PATH).get("actions")
        else:
            what = f"POST {PERMISSIONS_PATH}"
            told = self.answer("POST", PERMISSIONS_PATH, {"resources": [resource]})
            resources = told.get("resources")
            actions = next(
                (
                    each.get("actions")
                    for each in (resources if isinstance(resources, list) else [])
                    if isinstance(each, dict) and each.get("resource") == resource
                ),
                None,
            )

        allowed = [
            each.get("allowed")
            for each in (actions if isinstance(actions, list) else [])
            if isinstance(each, dict) and each.get("action") == action
        ]

        if len(allowed) != 1 or not isinstance(allowed[0], bool):
            raise self.unlike_its_answer(what)

        return allowed[0]


def service_of(
    request: Request,
) -> RemoteService:
    """Return the remote the path names, reached with the token its variable holds.

    Raises:
        NotFoundError: The editor's instance gives no remote this name.
        InvalidArgumentError: Its token variable is not set.
    """

    named = instance_of(request).remotes.get(request.path_params["name"])
    token = environ_of(request).get(named.token_variable)

    if not token:
        raise api.InvalidArgumentError(no_token_message(named.token_variable))

    return RemoteService(named.url, token, http=remote_http_of(request))


def resources_of(
    body: dict[str, object],
) -> list[str]:
    """Return the resources an ask names, or refuse it as an invalid argument."""

    resources = body.get("resources")

    if (
        set(body) != {"resources"}
        or not isinstance(resources, list)
        or not 1 <= len(resources) <= MAX_RESOURCES
        or not all(isinstance(each, str) and each != "" for each in resources)
    ):
        raise api.InvalidArgumentError(PERMISSIONS_MESSAGE)

    return [str(each) for each in resources]


async def remote_service(
    request: Request,
) -> Response:
    """`GET /api/remotes/{name}/service`: what the remote says of the service API it serves."""

    service = await run_in_threadpool(service_of, request)

    return JSONResponse(await run_in_threadpool(service.answer, "GET", SERVICE_PATH))


async def remote_permissions(
    request: Request,
) -> Response:
    """`/api/remotes/{name}/permissions`: what the remote's policy lets the caller do.

    `GET` asks of the remote as a whole; `POST` `{"resources": [...]}` asks
    of each resource named, nothing being sent for an ask that is refused.
    """

    if request.method == "GET":
        service = await run_in_threadpool(service_of, request)

        return JSONResponse(await run_in_threadpool(service.answer, "GET", PERMISSIONS_PATH))

    resources = resources_of(await body_of(request, message=PERMISSIONS_MESSAGE))
    service = await run_in_threadpool(service_of, request)
    told = await run_in_threadpool(
        service.answer, "POST", PERMISSIONS_PATH, {"resources": resources}
    )

    return JSONResponse(told)


def remote_service_routes() -> list[BaseRoute]:
    """Return the routes that relay what a remote says of itself and of the caller."""

    return [
        Route("/api/remotes/{name}/service", remote_service, methods=["GET"]),
        Route("/api/remotes/{name}/permissions", remote_permissions, methods=["GET", "POST"]),
    ]


__all__ = [
    "MAX_RESOURCES",
    "PERMISSIONS_MESSAGE",
    "PERMISSIONS_PATH",
    "SERVICE_PATH",
    "RemoteService",
    "remote_service_routes",
    "service_of",
]
