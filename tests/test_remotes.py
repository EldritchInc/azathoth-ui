"""Tests for the remotes API: the names the editor's instance gives remotes (ADR 0008)."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from azathoth import api
from starlette.testclient import TestClient

from azathoth_ui.app import build_app
from azathoth_ui.remotes import ADD_MESSAGE, REMOVE_MESSAGE
from tests.test_app import ORIGIN, PORT, TOKEN

ORIGIN_URL = "https://azathoth.example.com"

STAGING_URL = "https://staging.example.com"

SHARED_TOKEN = "AZATHOTH_SHARED_TOKEN"


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield a new instance in its own SQLite file, closed afterwards."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.open(database) as opened:
        yield opened


@pytest.fixture
def environ() -> dict[str, str]:
    """Return the environment the editor reads tokens from, holding one token."""

    return {"AZATHOTH_REMOTE_TOKEN": "azr_secret_value"}


@pytest.fixture
def client(
    instance: api.Azathoth,
    environ: dict[str, str],
    tmp_path: Path,
) -> TestClient:
    """Return a signed-in client of the editor's server, reading tokens from `environ`."""

    app = build_app(
        instance,
        token=TOKEN,
        port=PORT,
        static_dir=tmp_path / "missing",
        environ=environ,
    )
    signed_in = TestClient(app, base_url=ORIGIN, follow_redirects=False)

    assert signed_in.get(f"/?token={TOKEN}").status_code == 303

    return signed_in


def post(
    client: TestClient,
    path: str,
    body: object,
) -> Any:
    """Send one change as the web app does, and return the response."""

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


def test_no_remote_is_named_at_first(
    client: TestClient,
) -> None:
    assert client.get("/api/remotes").json() == {"items": []}


def test_a_remote_is_named_and_listed_with_whether_its_token_is_set(
    client: TestClient,
) -> None:
    origin = post(client, "/api/remotes", {"name": "origin", "url": f"{ORIGIN_URL}/"})
    staging = post(
        client,
        "/api/remotes",
        {"name": "staging", "url": STAGING_URL, "token_variable": SHARED_TOKEN},
    )

    assert origin.status_code == 201
    assert origin.headers["cache-control"] == "no-store"
    assert {key: origin.json()[key] for key in ("name", "url", "token_variable", "token_set")} == {
        "name": "origin",
        "url": ORIGIN_URL,
        "token_variable": "AZATHOTH_REMOTE_TOKEN",
        "token_set": True,
    }
    assert staging.json()["token_variable"] == SHARED_TOKEN
    assert staging.json()["token_set"] is False
    assert [item["name"] for item in client.get("/api/remotes").json()["items"]] == [
        "origin",
        "staging",
    ]


def test_no_token_ever_reaches_the_browser(
    client: TestClient,
) -> None:
    post(client, "/api/remotes", {"name": "origin", "url": ORIGIN_URL})

    for response in (
        client.get("/api/remotes"),
        post(client, "/api/remotes/remove", {"name": "origin"}),
    ):
        assert "azr_secret_value" not in response.text


def test_whether_a_token_is_set_is_read_as_each_request_comes(
    client: TestClient,
    environ: dict[str, str],
) -> None:
    post(
        client,
        "/api/remotes",
        {"name": "staging", "url": STAGING_URL, "token_variable": SHARED_TOKEN},
    )

    assert client.get("/api/remotes").json()["items"][0]["token_set"] is False

    environ[SHARED_TOKEN] = "azr_now_set"

    assert client.get("/api/remotes").json()["items"][0]["token_set"] is True

    environ[SHARED_TOKEN] = ""

    assert client.get("/api/remotes").json()["items"][0]["token_set"] is False


def test_a_name_is_kept_in_the_instance(
    client: TestClient,
    instance: api.Azathoth,
) -> None:
    post(client, "/api/remotes", {"name": "origin", "url": ORIGIN_URL})

    (named,) = instance.remotes.list()

    assert (named.name, named.url) == ("origin", ORIGIN_URL)


def test_a_name_is_forgotten(
    client: TestClient,
) -> None:
    post(client, "/api/remotes", {"name": "origin", "url": ORIGIN_URL})
    post(client, "/api/remotes", {"name": "staging", "url": STAGING_URL})

    removed = post(client, "/api/remotes/remove", {"name": "origin"})

    assert removed.status_code == 200
    assert removed.json()["name"] == "origin"
    assert removed.json()["url"] == ORIGIN_URL
    assert [item["name"] for item in client.get("/api/remotes").json()["items"]] == ["staging"]


def test_a_name_already_given_is_a_conflict(
    client: TestClient,
) -> None:
    post(client, "/api/remotes", {"name": "origin", "url": ORIGIN_URL})

    taken = post(client, "/api/remotes", {"name": "origin", "url": STAGING_URL})

    assert taken.status_code == 409
    assert taken.json() == error(
        "conflict",
        f"Remote origin is already named, for {ORIGIN_URL}; remove it first, or choose another "
        "name.",
    )


def test_forgetting_a_name_never_given_is_not_found(
    client: TestClient,
) -> None:
    gone = post(client, "/api/remotes/remove", {"name": "origin"})

    assert gone.status_code == 404
    assert gone.json() == error(
        "not_found",
        "No remote is named 'origin'; name one with `azathoth remote add <NAME> <URL>`.",
    )


@pytest.mark.parametrize(
    ("body", "message"),
    [
        (
            {"name": "my.remote", "url": ORIGIN_URL},
            "Remote name 'my.remote' is not one: use 1 to 64 letters, digits, '_' or '-'.",
        ),
        (
            {"name": "origin", "url": "azathoth.example.com"},
            "Remote URL 'azathoth.example.com' is not an http or https URL.",
        ),
        (
            {"name": "origin", "url": ORIGIN_URL, "token_variable": "SHARED-TOKEN"},
            "Token variable 'SHARED-TOKEN' is not an environment variable's name: use letters, "
            "digits and '_', not beginning with a digit.",
        ),
    ],
    ids=["name", "url", "variable"],
)
def test_what_azathoth_refuses_answers_with_its_message(
    client: TestClient,
    body: dict[str, str],
    message: str,
) -> None:
    refused = post(client, "/api/remotes", body)

    assert refused.status_code == 422
    assert refused.json()["error"]["message"] == message
    assert client.get("/api/remotes").json() == {"items": []}


@pytest.mark.parametrize(
    "body",
    [
        {"url": ORIGIN_URL},
        {"name": "origin"},
        {"name": "", "url": ORIGIN_URL},
        {"name": 1, "url": ORIGIN_URL},
        {"name": "origin", "url": ORIGIN_URL, "token_variable": 7},
        {"name": "origin", "url": ORIGIN_URL, "token": "azr_secret_value"},
        ["origin", ORIGIN_URL],
    ],
    ids=["no-name", "no-url", "empty", "number", "variable-number", "token", "list"],
)
def test_a_body_that_is_not_a_name_and_url_is_refused(
    client: TestClient,
    body: object,
) -> None:
    refused = post(client, "/api/remotes", body)

    assert refused.status_code == 422
    assert refused.json() == error("invalid_argument", ADD_MESSAGE)


@pytest.mark.parametrize(
    "body",
    [{}, {"name": ""}, {"name": "origin", "force": True}],
    ids=["empty", "blank", "extra"],
)
def test_a_removal_that_does_not_name_one_remote_is_refused(
    client: TestClient,
    body: object,
) -> None:
    refused = post(client, "/api/remotes/remove", body)

    assert refused.status_code == 422
    assert refused.json() == error("invalid_argument", REMOVE_MESSAGE)


def test_changing_remotes_needs_the_editors_origin(
    client: TestClient,
) -> None:
    refused = client.post(
        "/api/remotes",
        content=json.dumps({"name": "origin", "url": ORIGIN_URL}),
        headers={"origin": "https://elsewhere.example.com", "content-type": "application/json"},
    )

    assert refused.status_code == 403
    assert client.get("/api/remotes").json() == {"items": []}
