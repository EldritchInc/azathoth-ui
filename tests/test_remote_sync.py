"""Tests for a remote's status, and pushing to and pulling from it, through the editor (ADR 0008).

The remote is a real Azathoth remote, served in-process over its own
database, as `azathoth remote serve` serves one.
"""

import copy
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx
import pytest
from azathoth import api
from azathoth.persistence.repositories import open_repositories
from azathoth.remote import NoAuditSink, OwnerOnlyPolicy, Seams, TokenAuthenticator
from azathoth.remote.server import RemoteServer
from starlette.testclient import TestClient

from azathoth_ui.app import build_app
from azathoth_ui.remotes import PULL_MESSAGE, SELECTION_MESSAGE
from tests.test_app import ORIGIN, PORT, TOKEN
from tests.test_browsing import WORKFLOW, WORKFLOW_ID, described

URL = "http://remote.test"

FIXED = "openrouter/acme/large"


class Served:
    """One Azathoth remote served in-process over its own database, and its token."""

    def __init__(
        self,
        root: Path,
    ) -> None:
        root.mkdir(parents=True, exist_ok=True)
        self.database = root / "remote.db"
        api.initialize(self.database)
        held = open_repositories(self.database)
        self.token = held.remote_tokens.create("editor").secret
        server = RemoteServer(
            workflows=held.workflows,
            tools=held.tools,
            benchmarks=held.benchmarks,
            content=held.content,
            production_states=held.production_states,
            portfolio=held.portfolio,
            seams=Seams(
                authenticator=TokenAuthenticator(held.remote_tokens),
                policy=OwnerOnlyPolicy(),
                audit=NoAuditSink(),
            ),
            accepts_restricted=False,
            environ={},
        )
        self.client = TestClient(server.app())

    def instance(
        self,
    ) -> api.Azathoth:
        """Open the remote's own instance, to see or change what it holds."""

        return api.open(self.database)


@pytest.fixture
def served(
    tmp_path: Path,
) -> Served:
    """Serve an empty remote."""

    return Served(tmp_path / "remote")


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield the editor's own instance, holding the summarize workflow."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.open(database) as opened:
        opened.workflows.import_document(json.dumps(WORKFLOW))
        yield opened


@pytest.fixture
def environ(
    served: Served,
) -> dict[str, str]:
    """Return the editor's environment, holding the remote's token."""

    return {"AZATHOTH_REMOTE_TOKEN": served.token}


def editor(
    instance: api.Azathoth,
    environ: dict[str, str],
    root: Path,
    *,
    remote: TestClient | None = None,
    http: Any = None,
) -> TestClient:
    """Return a signed-in client of the editor's server, reaching remotes over `remote`."""

    app = build_app(
        instance,
        token=TOKEN,
        port=PORT,
        static_dir=root / "missing",
        environ=environ,
        remote_http=http if http is not None else (lambda: remote),
    )
    client = TestClient(app, base_url=ORIGIN, follow_redirects=False)

    assert client.get(f"/?token={TOKEN}").status_code == 303

    return client


@pytest.fixture
def client(
    instance: api.Azathoth,
    environ: dict[str, str],
    served: Served,
    tmp_path: Path,
) -> TestClient:
    """Return the editor, with `origin` naming the served remote."""

    signed_in = editor(instance, environ, tmp_path, remote=served.client)
    post(signed_in, "/api/remotes", {"name": "origin", "url": URL})

    return signed_in


def post(
    client: TestClient,
    path: str,
    body: object,
) -> Any:
    """Send one request as the web app does, and return the response."""

    return client.post(
        path,
        content=json.dumps(body),
        headers={"origin": ORIGIN, "content-type": "application/json"},
    )


def error(
    code: str,
    message: str,
) -> dict[str, dict[str, str]]:
    """Return the API's answer to one error."""

    return {"error": {"code": code, "message": message}}


def unreachable() -> httpx.Client:
    """Return a client that reaches nothing, as an HTTP client of a remote that is down does."""

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused", request=request)

    return httpx.Client(transport=httpx.MockTransport(refuse))


# Status


def test_a_status_says_how_a_workflow_relates_before_and_after_a_push(
    client: TestClient,
) -> None:
    before = post(client, "/api/remotes/origin/status", {"workflows": [WORKFLOW_ID]})

    assert before.status_code == 200
    assert before.headers["cache-control"] == "no-store"
    assert before.json()["remote"] == URL
    assert before.json()["reachable"] is True
    assert [component["relation"] for component in before.json()["components"]] == ["local_only"]

    post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]})
    after = post(client, "/api/remotes/origin/status", {"workflows": [WORKFLOW_ID]})

    (component,) = after.json()["components"]
    assert component["relation"] == "in_sync"
    assert component["remote_number"] == 1
    assert component["remote_production_digest"] is None


def test_a_status_naming_nothing_reports_everything_either_side_holds(
    client: TestClient,
) -> None:
    status = post(client, "/api/remotes/origin/status", {}).json()
    workflows = [
        component
        for component in status["components"]
        if component["lineage"]["kind"] == "workflow"
    ]

    assert [component["lineage"]["id"] for component in workflows] == [WORKFLOW_ID]
    assert any(component["lineage"]["kind"] == "tool" for component in status["components"])


def test_a_remote_that_cannot_be_reached_is_a_status_not_an_error(
    instance: api.Azathoth,
    environ: dict[str, str],
    tmp_path: Path,
) -> None:
    client = editor(instance, environ, tmp_path, http=unreachable)
    post(client, "/api/remotes", {"name": "origin", "url": URL})

    status = post(client, "/api/remotes/origin/status", {"workflows": [WORKFLOW_ID]})

    assert status.status_code == 200
    assert status.json()["reachable"] is False
    assert [component["relation"] for component in status.json()["components"]] == [None]
    assert status.json()["portfolio_synced_at"] is None


def test_a_status_reads_the_remotes_portfolio_and_keeps_it(
    instance: api.Azathoth,
    environ: dict[str, str],
    served: Served,
    tmp_path: Path,
) -> None:
    fixed = copy.deepcopy(WORKFLOW)
    fixed["steps"][0]["specification"]["model_selection"] = {
        "provider": "openrouter",
        "model": "acme/large",
    }
    instance.workflows.import_document(json.dumps(fixed))
    client = editor(instance, environ, tmp_path, remote=served.client)
    post(client, "/api/remotes", {"name": "origin", "url": URL})

    reached = post(client, "/api/remotes/origin/status", {"workflows": [WORKFLOW_ID]}).json()

    assert reached["portfolio_synced_at"] is not None
    assert reached["models"] == [
        {"identifier": FIXED, "authorized_locally": False, "authorized_remotely": False}
    ]

    offline = editor(instance, environ, tmp_path / "offline", http=unreachable)
    kept = post(offline, "/api/remotes/origin/status", {"workflows": [WORKFLOW_ID]}).json()

    assert kept["reachable"] is False
    assert kept["portfolio_synced_at"] == reached["portfolio_synced_at"]
    assert kept["models"] == reached["models"]


# Pushing


def test_a_push_sends_what_is_named_and_reports_it(
    client: TestClient,
    served: Served,
) -> None:
    pushed = post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]})

    assert pushed.status_code == 200
    assert pushed.headers["cache-control"] == "no-store"
    assert pushed.json()["remote"] == URL
    assert [item["number"] for item in pushed.json()["received"]] == [1]
    assert pushed.json()["warnings"] == []

    with served.instance() as remote:
        assert remote.workflows.get(UUID(WORKFLOW_ID)).revision.number == 1

    again = post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]})

    assert (again.json()["received"], again.json()["already_held"]) == ([], 1)


def test_a_push_reports_azathoths_warnings(
    instance: api.Azathoth,
    environ: dict[str, str],
    served: Served,
    tmp_path: Path,
) -> None:
    fixed = copy.deepcopy(WORKFLOW)
    fixed["steps"][0]["specification"]["model_selection"] = {
        "provider": "openrouter",
        "model": "acme/large",
    }
    instance.workflows.import_document(json.dumps(fixed))
    client = editor(instance, environ, tmp_path, remote=served.client)
    post(client, "/api/remotes", {"name": "origin", "url": URL})

    (warning,) = post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]}).json()[
        "warnings"
    ]

    assert warning == (
        f"Step a1000000-0000-4000-8000-000000000002 of workflow {WORKFLOW_ID} uses model {FIXED}, "
        "which the remote has not authorized; it cannot run there until the remote's portfolio "
        "holds it."
    )


def test_a_push_that_has_diverged_is_a_conflict(
    client: TestClient,
    instance: api.Azathoth,
    served: Served,
) -> None:
    post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]})
    instance.workflows.import_document(json.dumps(described(WORKFLOW, "Mine.")))

    with served.instance() as remote:
        remote.workflows.import_document(json.dumps(described(WORKFLOW, "Theirs.")))

    diverged = post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]})

    assert diverged.status_code == 409
    assert diverged.json()["error"]["code"] == "remote_diverged"
    assert diverged.json()["error"]["message"].endswith("Pull first, then push again.")


def test_a_push_to_a_remote_that_cannot_be_reached_is_a_bad_gateway(
    instance: api.Azathoth,
    environ: dict[str, str],
    tmp_path: Path,
) -> None:
    client = editor(instance, environ, tmp_path, http=unreachable)
    post(client, "/api/remotes", {"name": "origin", "url": URL})

    failed = post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]})

    assert failed.status_code == 502
    assert failed.json()["error"]["code"] == "remote_unreachable"
    assert failed.json()["error"]["message"].startswith(f"The remote at {URL} could not be reached")


def test_a_token_the_remote_does_not_know_is_refused(
    instance: api.Azathoth,
    served: Served,
    tmp_path: Path,
) -> None:
    client = editor(
        instance,
        {"AZATHOTH_REMOTE_TOKEN": "azr_unknown"},
        tmp_path,
        remote=served.client,
    )
    post(client, "/api/remotes", {"name": "origin", "url": URL})

    refused = post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]})

    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "remote_refused"


def test_naming_nothing_to_push_is_refused(
    client: TestClient,
) -> None:
    refused = post(client, "/api/remotes/origin/push", {})

    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "invalid_argument"


# Pulling


def test_a_pull_brings_the_remotes_revisions_into_the_editor(
    client: TestClient,
    instance: api.Azathoth,
    served: Served,
) -> None:
    post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]})

    with served.instance() as remote:
        remote.workflows.import_document(json.dumps(described(WORKFLOW, "Theirs.")))

    pulled = post(client, "/api/remotes/origin/pull", {"workflows": [WORKFLOW_ID]})

    assert pulled.status_code == 200
    assert pulled.json()["remote"] == URL
    assert [item["number"] for item in pulled.json()["received"]] == [2]
    assert pulled.json()["forked"] == []
    assert pulled.json()["withheld"] == []
    latest = instance.workflows.get(UUID(WORKFLOW_ID))
    metadata = latest.document["metadata"]

    assert latest.revision.number == 2
    assert isinstance(metadata, dict)
    assert metadata["description"] == "Theirs."


def test_a_pull_of_a_diverged_workflow_forks_it_here(
    client: TestClient,
    instance: api.Azathoth,
    served: Served,
) -> None:
    post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]})
    instance.workflows.import_document(json.dumps(described(WORKFLOW, "Mine.")))

    with served.instance() as remote:
        remote.workflows.import_document(json.dumps(described(WORKFLOW, "Theirs.")))

    pulled = post(client, "/api/remotes/origin/pull", {"workflows": [WORKFLOW_ID]}).json()

    assert [lineage["id"] for lineage in pulled["forked"]] == [WORKFLOW_ID]


# Reaching a remote by its name


def test_only_a_name_the_instance_gives_is_reached(
    client: TestClient,
) -> None:
    for name in ("staging", "remote.test"):
        gone = post(client, f"/api/remotes/{name}/status", {})

        assert gone.status_code == 404
        assert gone.json() == error(
            "not_found",
            f"No remote is named {name!r}; name one with `azathoth remote add <NAME> <URL>`.",
        )


def test_a_name_whose_token_is_not_set_says_which_variable_to_set(
    client: TestClient,
) -> None:
    post(
        client,
        "/api/remotes",
        {"name": "staging", "url": URL, "token_variable": "AZATHOTH_SHARED_TOKEN"},
    )

    for action in ("status", "push", "pull"):
        refused = post(client, f"/api/remotes/staging/{action}", {"workflows": [WORKFLOW_ID]})

        assert refused.status_code == 422
        assert refused.json() == error(
            "invalid_argument",
            "No remote token was given; set AZATHOTH_SHARED_TOKEN to one created on the remote "
            "with `azathoth remote token create`.",
        )


@pytest.mark.parametrize(
    "body",
    [
        {"workflows": WORKFLOW_ID},
        {"workflows": ["not-an-id"]},
        {"workflows": [7]},
        {"tools": ["c1000000-0000-4000-8000-000000000001@1.0.0"]},
        {"tools": [{"id": "c1000000-0000-4000-8000-000000000001"}]},
        {"tools": [{"id": "c1000000-0000-4000-8000-000000000001", "version": ""}]},
        {"workflows": [], "include_restricted": True},
        {"lineages": []},
    ],
    ids=[
        "not-a-list",
        "not-an-id",
        "number",
        "tool-text",
        "no-version",
        "empty-version",
        "restricted",
        "other",
    ],
)
def test_a_selection_that_is_not_one_is_refused(
    client: TestClient,
    body: dict[str, object],
) -> None:
    for action in ("status", "push"):
        refused = post(client, f"/api/remotes/origin/{action}", body)

        assert refused.status_code == 422
        assert refused.json() == error("invalid_argument", SELECTION_MESSAGE)


@pytest.mark.parametrize(
    "body",
    [
        {"workflows": [WORKFLOW_ID], "include_restricted": "yes"},
        {"workflows": [WORKFLOW_ID], "force": True},
        {"benchmarks": "all"},
    ],
    ids=["restricted-text", "other", "not-a-list"],
)
def test_a_pull_that_is_not_one_is_refused(
    client: TestClient,
    body: dict[str, object],
) -> None:
    refused = post(client, "/api/remotes/origin/pull", body)

    assert refused.status_code == 422
    assert refused.json() == error("invalid_argument", PULL_MESSAGE)


def test_a_tool_version_is_named_by_its_id_and_version(
    client: TestClient,
) -> None:
    tool = next(
        component["lineage"]
        for component in post(client, "/api/remotes/origin/status", {}).json()["components"]
        if component["lineage"]["kind"] == "tool"
    )

    status = post(
        client,
        "/api/remotes/origin/status",
        {"tools": [{"id": tool["id"], "version": tool["version"]}]},
    ).json()

    assert [component["lineage"] for component in status["components"]] == [tool]


def test_a_remote_holding_another_history_of_a_workflow_refuses_it(
    client: TestClient,
    served: Served,
) -> None:
    with served.instance() as remote:
        remote.workflows.import_document(json.dumps(described(WORKFLOW, "Theirs.")))

    refused = post(client, "/api/remotes/origin/push", {"workflows": [WORKFLOW_ID]})

    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "remote_refused"
    assert refused.json()["error"]["message"].endswith(
        "begins its history, but another history of it is held here."
    )
