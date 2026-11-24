"""Tests that a remote's service description and permissions are relayed under its name.

`GET /api/remotes/{name}/service` answers what the remote says at `GET
/v1/service`, and `/api/remotes/{name}/permissions` what it says at `/v1/permissions`,
for the caller the editor's token names. A benchmark's restricted cases are
compared on a remote only where its policy lets the caller read them.
"""

import json
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import azathoth
import httpx
import pytest
from azathoth import api
from azathoth.remote import Decision, Principal
from azathoth.remote.service import MAX_PERMISSION_RESOURCES
from starlette.testclient import TestClient

from azathoth_ui.remote_service import MAX_RESOURCES, PERMISSIONS_MESSAGE
from tests.test_browsing import BENCHMARK_ID
from tests.test_remote_instances import (
    URL,
    Refusing,
    Remote,
    Unreachable,
    post,
    signed_in,
    stocked,
)
from tests.test_revisions import restricted_benchmark

DETAIL = "Licensed to the Miskatonic reading room until 2027-01-01."

REASON = "editor may not read restricted cases here."


class Licensed:
    """A policy naming its edition and saying more of it, that refuses restricted reads."""

    edition = "studio"

    edition_detail = DETAIL

    def decide(
        self,
        principal: Principal,
        action: str,
        resource: str | None,
    ) -> Decision:
        if action == "read_restricted":
            return Decision(
                allowed=False, reason=f"{principal.name} may not read restricted cases here."
            )

        return Decision(allowed=True)


def holding_restricted(
    database: Path,
) -> Path:
    """Stock a database, and give it a restricted benchmark at two revisions."""

    stocked(database)

    with api.open(database) as instance:
        instance.benchmarks.import_document(json.dumps(restricted_benchmark("patient 412")))
        instance.benchmarks.import_document(json.dumps(restricted_benchmark("patient 413")))

    return database


@contextmanager
def editor_of(
    served: Remote,
    root: Path,
    *,
    token: str | None = None,
) -> Iterator[TestClient]:
    """Yield an editor whose own instance names `served` as `origin`."""

    database = root / "ui.db"
    api.initialize(database)

    with api.open(database) as instance:
        instance.remotes.add("origin", URL)
        yield signed_in(
            instance,
            root,
            environ={"AZATHOTH_REMOTE_TOKEN": served.token if token is None else token},
            http=lambda: served.client,
        )


@pytest.fixture
def licensed(
    tmp_path: Path,
) -> Remote:
    """Return a remote whose policy is `Licensed`, holding a restricted benchmark."""

    return Remote(holding_restricted(tmp_path / "licensed.db"), policy=Licensed())


@pytest.fixture
def editor(
    licensed: Remote,
    tmp_path: Path,
) -> Iterator[TestClient]:
    """Return an editor naming the licensed remote `origin`."""

    with editor_of(licensed, tmp_path / "editor") as client:
        yield client


def directly(
    served: Remote,
    method: str,
    path: str,
    body: object = None,
) -> Any:
    """Return what a remote answers its caller at one path, asked without the editor."""

    return served.client.request(
        method,
        path,
        content=None if body is None else json.dumps(body),
        headers={"Authorization": f"Bearer {served.token}", "Content-Type": "application/json"},
    ).json()


def test_a_remote_says_what_it_serves_and_its_edition(
    editor: TestClient,
    licensed: Remote,
) -> None:
    response = editor.get("/api/remotes/origin/service")
    described = response.json()

    assert response.status_code == 200
    assert described == directly(licensed, "GET", "/v1/service")
    assert described["azathoth_version"] == azathoth.__version__
    assert described["edition"] == "studio"
    assert described["edition_detail"] == DETAIL
    assert described["jobs"]["queued"] == 0
    assert described["jobs"]["running"] == 0


def test_a_remote_says_what_its_policy_lets_the_caller_do(
    editor: TestClient,
    licensed: Remote,
) -> None:
    response = editor.get("/api/remotes/origin/permissions")
    told = response.json()
    actions = {each["action"]: each for each in told["actions"]}

    assert response.status_code == 200
    assert told == directly(licensed, "GET", "/v1/permissions")
    assert told["principal"] == "editor"
    assert actions["read_catalog"] == {"action": "read_catalog", "allowed": True, "reason": None}
    assert actions["read_restricted"] == {
        "action": "read_restricted",
        "allowed": False,
        "reason": REASON,
    }


def test_a_remote_says_what_the_caller_may_do_to_each_resource_asked_about(
    editor: TestClient,
    licensed: Remote,
) -> None:
    asked = {"resources": [f"benchmark {BENCHMARK_ID}", "workflow nowhere"]}
    response = post(editor, "/api/remotes/origin/permissions", asked)

    assert response.status_code == 200
    assert response.json() == directly(licensed, "POST", "/v1/permissions", asked)
    assert [each["resource"] for each in response.json()["resources"]] == asked["resources"]


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"resources": []},
        {"resources": "benchmark x"},
        {"resources": [1]},
        {"resources": [""]},
        {"resources": ["benchmark x"], "actions": ["read_catalog"]},
        {"resources": [f"benchmark {number}" for number in range(MAX_PERMISSION_RESOURCES + 1)]},
    ],
)
def test_an_ask_names_resources_and_no_more_than_a_remote_answers_before_anything_is_sent(
    tmp_path: Path,
    body: object,
) -> None:
    def unreached() -> Any:
        raise AssertionError("Nothing is sent for an ask the editor refuses.")

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.open(database) as instance:
        instance.remotes.add("origin", URL)
        client = signed_in(
            instance, tmp_path, environ={"AZATHOTH_REMOTE_TOKEN": "azr_x"}, http=unreached
        )
        response = post(client, "/api/remotes/origin/permissions", body)

    assert response.status_code == 422
    assert response.json()["error"] == {"code": "invalid_argument", "message": PERMISSIONS_MESSAGE}
    assert MAX_RESOURCES == MAX_PERMISSION_RESOURCES


def test_a_restricted_case_is_withheld_where_the_remotes_policy_refuses_reading_it(
    editor: TestClient,
) -> None:
    response = editor.get(f"/api/remotes/origin/benchmarks/{BENCHMARK_ID}/diff?before=1&after=2")
    (change,) = response.json()["changes"]

    assert response.status_code == 200, response.text
    assert change["withheld"] is True
    assert (change["before"], change["after"]) == (None, None)


def test_a_restricted_case_is_compared_where_the_remotes_policy_lets_it_be_read(
    tmp_path: Path,
) -> None:
    owned = Remote(holding_restricted(tmp_path / "owned.db"))

    with editor_of(owned, tmp_path / "editor") as client:
        response = client.get(
            f"/api/remotes/origin/benchmarks/{BENCHMARK_ID}/diff?before=1&after=2"
        )

    (change,) = response.json()["changes"]

    assert response.status_code == 200, response.text
    assert change["withheld"] is False
    assert (change["before"], change["after"]) == ("patient 412", "patient 413")


def test_what_a_remotes_policy_refuses_of_its_description_is_403_in_its_words(
    tmp_path: Path,
) -> None:
    refusing = Remote(stocked(tmp_path / "refusing.db"), policy=Refusing())

    with editor_of(refusing, tmp_path / "editor") as client:
        response = client.get("/api/remotes/origin/service")
        permissions = client.get("/api/remotes/origin/permissions")

    assert response.status_code == 403
    assert response.json()["error"] == {
        "code": "permission_denied",
        "message": "editor may only read the catalog here.",
    }
    assert permissions.status_code == 200


def test_a_token_the_remote_does_not_know_is_refused_in_its_words(
    licensed: Remote,
    tmp_path: Path,
) -> None:
    with editor_of(licensed, tmp_path / "editor", token="azr_unknown") as client:
        response = client.get("/api/remotes/origin/service")

    told = licensed.client.get(
        "/v1/service", headers={"Authorization": "Bearer azr_unknown"}
    ).json()

    assert response.status_code == 403
    assert response.json()["error"] == {"code": "remote_refused", "message": told["error"]}


class Answering:
    """An HTTP client that answers every request with one status and body."""

    def __init__(
        self,
        status: int,
        body: bytes,
    ) -> None:
        self.status = status
        self.body = body

    def request(
        self,
        *_: Any,
        **__: Any,
    ) -> httpx.Response:
        return httpx.Response(self.status, content=self.body)

    def close(
        self,
    ) -> None:
        pass


def answered_by(
    http: Any,
    root: Path,
    path: str = "/api/remotes/origin/service",
) -> Any:
    """Return what the editor answers at one path, its remote reached over `http`."""

    database = root / "ui.db"
    api.initialize(database)

    with api.open(database) as instance:
        instance.remotes.add("origin", URL)
        client = signed_in(
            instance, root, environ={"AZATHOTH_REMOTE_TOKEN": "azr_x"}, http=lambda: http
        )

        return client.get(path)


def test_a_remote_that_cannot_be_reached_is_502(
    tmp_path: Path,
) -> None:
    response = answered_by(Unreachable(), tmp_path)

    assert response.status_code == 502
    assert response.json()["error"] == {
        "code": "remote_unreachable",
        "message": f"The remote at {URL} could not be reached: Connection refused",
    }


def test_a_remote_that_serves_no_service_api_is_502_saying_so(
    tmp_path: Path,
) -> None:
    response = answered_by(Answering(404, b"Not Found"), tmp_path)

    assert response.status_code == 502
    assert response.json()["error"] == {
        "code": "remote_unreachable",
        "message": (
            f"The remote at {URL} does not serve GET /v1/service; it may not serve the "
            "service API, which a remote does from Azathoth 1.6."
        ),
    }


@pytest.mark.parametrize(
    ("status", "body"),
    [(200, b"[]"), (200, b"not json"), (500, b"Internal Server Error")],
)
def test_a_remote_that_answers_as_none_does_is_502_saying_so(
    tmp_path: Path,
    status: int,
    body: bytes,
) -> None:
    response = answered_by(Answering(status, body), tmp_path)

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "remote_unreachable"
    assert response.json()["error"]["message"].startswith(
        f"The remote at {URL} answered GET /v1/service with "
    )


def test_a_remote_that_cannot_answer_now_is_503(
    tmp_path: Path,
) -> None:
    refused = json.dumps({"error": "The remote's audit is down.", "code": "audit_unavailable"})
    response = answered_by(Answering(503, refused.encode()), tmp_path)

    assert response.status_code == 503
    assert response.json()["error"] == {
        "code": "remote_unavailable",
        "message": "The remote's audit is down.",
    }


def test_a_diff_whose_permissions_the_remote_answers_as_none_does_is_502(
    tmp_path: Path,
) -> None:
    told = json.dumps({"principal": "editor", "resources": []}).encode()
    response = answered_by(
        Answering(200, told),
        tmp_path,
        f"/api/remotes/origin/benchmarks/{BENCHMARK_ID}/diff?before=1&after=2",
    )

    assert response.status_code == 502
    assert response.json()["error"]["message"] == (
        f"The remote at {URL} answered POST /v1/permissions with something other than its "
        "answer; it may serve another version of the service API."
    )
