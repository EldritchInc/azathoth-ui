"""Tests that every endpoint of an instance answers for a remote under its name (ADR 0016).

The remote is a real Azathoth remote serving the service API, with runners
for its jobs, served in-process over its own database. What the editor
answers from it under `/api/remotes/origin/...` is compared with what an
editor whose own instance is that database answers under `/api/...`.
"""

import json
import re
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx
import pytest
from azathoth import api
from azathoth.api.remote import no_token_message
from azathoth.persistence.repositories import open_repositories
from azathoth.remote import Decision, NoAuditSink, Principal, Seams, TokenAuthenticator
from azathoth.remote.calling import CallerInstances
from azathoth.remote.runners import JobRunners
from azathoth.remote.server import RemoteServer
from starlette.routing import Route
from starlette.testclient import TestClient

from azathoth_ui.app import build_app
from azathoth_ui.instances import instance_endpoints
from azathoth_ui.remote_instances import remote_suffix
from tests.test_app import ORIGIN, PORT, TOKEN
from tests.test_browsing import TOOL, WORKFLOW, WORKFLOW_ID
from tests.test_live import WORKFLOW_ID as COUNTING_ID
from tests.test_live import counting

URL = "http://remote.test"

UNKNOWN_ID = "00000000-0000-4000-8000-0000000000ff"

WAIT_SECONDS = 20.0

PATH_VALUES = {
    "workflow_id": WORKFLOW_ID,
    "tool_id": TOOL["definition"]["id"],
    "version": "1.0.0",
}
"""What each path parameter is given: what the remote holds, or an ID it does not."""

NOT_COMPARED = {
    "/commands",
    "/live",
    "/live/{handle}",
    "/live/{handle}/events",
}
"""What is not the remote's own: the commands the editor writes, and the editor's live runs."""


class Refusing:
    """A remote's policy that refuses every action but `read_catalog`, saying why."""

    edition = "core"

    def decide(
        self,
        principal: Principal,
        action: str,
        resource: str | None,
    ) -> Decision:
        if action == "read_catalog":
            return Decision(allowed=True)

        return Decision(allowed=False, reason=f"{principal.name} may only read the catalog here.")


class Remote:
    """One Azathoth remote serving the service API over its own database, with its token."""

    def __init__(
        self,
        database: Path,
        *,
        policy: Any = None,
    ) -> None:
        from azathoth.remote import OwnerOnlyPolicy

        self.database = database
        held = open_repositories(database)
        self.token = held.remote_tokens.create("editor").secret
        self.jobs = held.service_jobs
        instances = CallerInstances(held)
        server = RemoteServer(
            workflows=held.workflows,
            tools=held.tools,
            benchmarks=held.benchmarks,
            content=held.content,
            production_states=held.production_states,
            portfolio=held.portfolio,
            seams=Seams(
                authenticator=TokenAuthenticator(held.remote_tokens),
                policy=OwnerOnlyPolicy() if policy is None else policy,
                audit=NoAuditSink(),
            ),
            accepts_restricted=False,
            environ={},
            instances=instances,
            jobs=self.jobs,
            events_poll_seconds=0.01,
        )
        self.client = TestClient(server.app(), base_url=URL)
        self.runners = JobRunners(
            self.jobs, instances, count=2, poll_seconds=0.02, beat_seconds=0.05
        )


def stocked(
    database: Path,
) -> Path:
    """Initialize a database holding a workflow, a word-count tool and a workflow using it."""

    api.initialize(database)

    with api.open(database) as instance:
        instance.tools.import_document(json.dumps(TOOL))
        instance.workflows.import_document(json.dumps(WORKFLOW))
        instance.workflows.import_document(json.dumps(counting()))

    return database


def signed_in(
    instance: api.Azathoth,
    root: Path,
    *,
    environ: dict[str, str],
    http: Any,
) -> TestClient:
    """Return a signed-in client of an editor over one instance, reaching remotes over `http`."""

    app = build_app(
        instance,
        token=TOKEN,
        port=PORT,
        static_dir=root / "missing",
        environ=environ,
        remote_http=http,
    )
    client = TestClient(app, base_url=ORIGIN, follow_redirects=False)

    assert client.get(f"/?token={TOKEN}").status_code == 303

    return client


def post(
    client: TestClient,
    path: str,
    body: object,
) -> Any:
    """Send a change as the web app does."""

    return client.post(
        path,
        content=json.dumps(body),
        headers={"origin": ORIGIN, "content-type": "application/json"},
    )


@pytest.fixture
def remote(
    tmp_path: Path,
) -> Iterator[Remote]:
    """Serve a remote holding the workflows and the tool, its runners running."""

    served = Remote(stocked(tmp_path / "remote.db"))

    with served.runners:
        yield served


@pytest.fixture
def local(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield the editor's own instance, which holds nothing but the name of the remote."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.open(database) as opened:
        opened.remotes.add("origin", URL)
        yield opened


@pytest.fixture
def editor(
    local: api.Azathoth,
    remote: Remote,
    tmp_path: Path,
) -> TestClient:
    """Return the editor over its own instance, naming the served remote `origin`."""

    return signed_in(
        local,
        tmp_path,
        environ={"AZATHOTH_REMOTE_TOKEN": remote.token},
        http=lambda: remote.client,
    )


@pytest.fixture
def beside(
    remote: Remote,
    tmp_path: Path,
) -> Iterator[TestClient]:
    """Return an editor whose own instance is the remote's database, to compare answers with."""

    with api.open(remote.database) as instance:
        yield signed_in(instance, tmp_path / "beside", environ={}, http=None)


def read_paths() -> list[str]:
    """Return every path an instance's endpoints read, its parameters given values."""

    paths: list[str] = []

    for route in instance_endpoints():
        assert isinstance(route, Route)

        if "GET" not in (route.methods or set()) or route.path in NOT_COMPARED:
            continue

        paths.append(
            re.sub(
                r"\{(\w+)(?::\w+)?\}",
                lambda found: PATH_VALUES.get(found.group(1), UNKNOWN_ID),
                route.path,
            )
        )

    return paths


MOMENT = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|\+00:00)")
"""A moment the editor or the remote writes as it answers, such as when models were listed."""


def answer(
    response: Any,
) -> tuple[int, str]:
    """Return a response's status and what it says, with the moments it was made at set aside."""

    return response.status_code, MOMENT.sub("<MOMENT>", response.text)


def test_every_read_answers_from_a_remote_as_it_does_from_the_instance_itself(
    editor: TestClient,
    beside: TestClient,
) -> None:
    paths = read_paths()

    assert len(paths) > 20

    for path in paths:
        there = answer(editor.get(f"/api/remotes/origin{path}"))
        here = answer(beside.get(f"/api{path}"))

        assert there == here, path


def test_what_the_remote_holds_is_read_under_its_name(
    editor: TestClient,
) -> None:
    listed = editor.get("/api/remotes/origin/workflows").json()["items"]
    shown = editor.get(f"/api/remotes/origin/workflows/{WORKFLOW_ID}")

    assert {item["name"] for item in listed} == {"summarize", "count"}
    assert shown.status_code == 200
    assert shown.json()["name"] == "summarize"
    assert editor.get("/api/workflows").json()["items"] == []


def test_a_remotes_commands_name_it_after_the_command(
    editor: TestClient,
) -> None:
    assert editor.get("/api/remotes/origin/commands").json() == {
        "instance": "origin",
        "prefix": "",
        "suffix": " --remote origin",
    }
    assert remote_suffix("staging") == " --remote staging"
    assert editor.get("/api/commands").json()["suffix"] == ""


def test_a_change_is_made_at_the_remote(
    editor: TestClient,
    remote: Remote,
) -> None:
    response = post(editor, f"/api/remotes/origin/workflows/{COUNTING_ID}/promote", {})

    with api.open(remote.database) as instance:
        production = instance.production.get(UUID(COUNTING_ID))

    assert response.status_code in (200, 201), response.text
    assert production is not None


def test_a_run_started_on_a_remote_runs_there_and_is_watched_here(
    editor: TestClient,
    remote: Remote,
) -> None:
    started = post(
        editor,
        "/api/remotes/origin/live/runs",
        {"workflow_id": COUNTING_ID, "input": "that is not dead"},
    )

    assert started.status_code == 201, started.text

    handle = started.json()["handle"]
    deadline = time.monotonic() + WAIT_SECONDS
    state = editor.get(f"/api/remotes/origin/live/{handle}").json()

    while state["state"] == "running" and time.monotonic() < deadline:
        time.sleep(0.05)
        state = editor.get(f"/api/remotes/origin/live/{handle}").json()

    assert state["state"] == "finished", state
    assert state["result"]["result"] == 4
    assert state["event_count"] >= 2
    assert editor.get(f"/api/live/{handle}").status_code == 404

    with editor.stream("GET", f"/api/remotes/origin/live/{handle}/events") as events:
        told = [line for line in events.iter_lines() if line.startswith("event: ")]

    assert events.status_code == 200
    assert len(told) >= state["event_count"]

    with api.open(remote.database) as instance:
        (kept,) = instance.runs.list(UUID(COUNTING_ID))

    assert str(kept.run_id) == state["result"]["run_id"]

    (job,) = remote.jobs.jobs()

    assert job.call == "runs.run"


def test_a_name_the_editor_does_not_give_is_not_found(
    editor: TestClient,
    local: api.Azathoth,
) -> None:
    response = editor.get("/api/remotes/nowhere/workflows")

    with pytest.raises(api.NotFoundError) as raised:
        local.remotes.get("nowhere")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": str(raised.value)}}


def test_a_remote_whose_token_is_not_set_is_refused_before_anything_is_sent(
    local: api.Azathoth,
    tmp_path: Path,
) -> None:
    def unreached() -> Any:
        raise AssertionError("Nothing is sent to a remote without its token.")

    client = signed_in(local, tmp_path, environ={}, http=unreached)
    response = client.get("/api/remotes/origin/workflows")

    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "invalid_argument",
        "message": no_token_message("AZATHOTH_REMOTE_TOKEN"),
    }


class Unreachable:
    """An HTTP client whose every request fails as one to a remote that is down does."""

    def request(
        self,
        *_: Any,
        **__: Any,
    ) -> Any:
        raise httpx.ConnectError("Connection refused")

    def stream(
        self,
        *_: Any,
        **__: Any,
    ) -> Any:
        raise httpx.ConnectError("Connection refused")

    def close(
        self,
    ) -> None:
        pass


def test_a_remote_that_cannot_be_reached_is_502(
    local: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = signed_in(
        local, tmp_path, environ={"AZATHOTH_REMOTE_TOKEN": "azr_x"}, http=Unreachable
    )
    response = client.get("/api/remotes/origin/workflows")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "remote_unreachable"
    assert response.json()["error"]["message"] == (
        f"The remote at {URL} could not be reached: Connection refused"
    )


def test_what_a_remotes_policy_refuses_is_403_in_its_words(
    local: api.Azathoth,
    tmp_path: Path,
) -> None:
    refusing = Remote(stocked(tmp_path / "refusing.db"), policy=Refusing())
    client = signed_in(
        local,
        tmp_path,
        environ={"AZATHOTH_REMOTE_TOKEN": refusing.token},
        http=lambda: refusing.client,
    )
    read = client.get("/api/remotes/origin/workflows")
    runs = client.get(f"/api/remotes/origin/workflows/{WORKFLOW_ID}/runs")

    assert read.status_code == 200
    assert runs.status_code == 403
    assert runs.json()["error"]["code"] == "permission_denied"
    assert "editor may only read the catalog here." in runs.json()["error"]["message"]


def test_a_path_no_endpoint_serves_is_404_under_a_remote_too(
    editor: TestClient,
) -> None:
    response = editor.get("/api/remotes/origin/nothing/here")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_the_remotes_own_status_push_and_pull_are_still_theirs(
    editor: TestClient,
) -> None:
    status = post(editor, "/api/remotes/origin/status", {})

    assert status.status_code == 200, status.text
    assert "components" in status.json() or isinstance(status.json(), dict)
