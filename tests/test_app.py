"""Tests of the server's app: its API, its errors and what it serves."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from azathoth import api
from starlette.testclient import TestClient

from azathoth_ui import __version__
from azathoth_ui.app import ASSETS_DIRECTORY, build_app, error_status
from azathoth_ui.commands import command_prefix, local_shell

PORT = 8124

TOKEN = "app-test-key"

ORIGIN = f"http://127.0.0.1:{PORT}"

UUID_TEXT = "a1000000-0000-4000-8000-000000000001"


@pytest.fixture
def instance(
    tmp_path: Path,
) -> Iterator[api.Azathoth]:
    """Yield a new instance in its own SQLite file, closed afterwards."""

    database = tmp_path / "ui.db"
    api.initialize(database)

    with api.open(database) as opened:
        yield opened


def browser(
    instance: api.Azathoth,
    static: Path,
) -> TestClient:
    """Return a client of the app for one instance and web build, holding the launch cookie."""

    app = build_app(instance, token=TOKEN, port=PORT, static_dir=static)
    client = TestClient(app, base_url=ORIGIN, follow_redirects=False)

    assert client.get(f"/?token={TOKEN}").status_code == 303

    return client


def built(
    root: Path,
) -> Path:
    """Write a stand-in web build under one folder, and return it."""

    (root / "assets").mkdir(parents=True)
    # Bytes, as the build writes them: text mode would end lines with \r\n on Windows.
    (root / "index.html").write_bytes(b"<!doctype html><title>app</title>")
    (root / "assets" / "app.js").write_bytes(b"export {};\n")

    return root


def test_the_api_describes_the_instance(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    response = browser(instance, tmp_path / "missing").get("/api/instance")

    assert response.status_code == 200
    assert response.json() == instance.describe().model_dump(mode="json")
    assert response.json()["database"] == str(tmp_path / "ui.db")
    assert response.headers["cache-control"] == "no-store"


def test_an_api_error_answers_with_its_code_and_message(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = browser(instance, tmp_path / "missing")
    instance.close()

    response = client.get("/api/instance")

    assert response.status_code == 503
    assert response.json() == {"error": {"code": "instance_closed", "message": api.CLOSED_MESSAGE}}


def test_an_unknown_api_path_answers_in_json(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    response = browser(instance, built(tmp_path / "web")).get("/api/nothing/here")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "not_found", "message": "No API endpoint at /api/nothing/here."}
    }


def test_a_method_the_api_does_not_take_answers_in_json(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = browser(instance, tmp_path / "missing")
    response = client.post("/api/instance", headers={"origin": ORIGIN})

    assert response.status_code == 405
    assert response.json() == {
        "error": {"code": "method_not_allowed", "message": "Method Not Allowed"}
    }


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (api.InvalidArgumentError("bad"), 422),
        (api.InvalidDocumentError("bad"), 422),
        (api.NotFoundError("gone"), 404),
        (api.RevisionNotFoundError("gone"), 404),
        (api.ConflictError("taken"), 409),
        (api.ModelInUseError("used", dependents=()), 409),
        (api.RunCancelledError(), 409),
        (api.RunNotStartedError("no candidate"), 409),
        (api.ProviderUnavailableError("down"), 502),
        (api.InstanceClosedError(), 503),
        (api.InstanceUnavailableError("no psycopg"), 503),
        (api.ProviderConfigurationError("no boto3"), 500),
        (api.InstanceNotFoundError("no file"), 500),
        (api.InstanceSchemaError("old"), 500),
        (api.ApiError("other"), 500),
    ],
)
def test_each_kind_of_error_has_its_status(
    error: api.ApiError,
    status: int,
) -> None:
    assert error_status(error) == status


def test_without_a_web_build_the_root_says_how_to_build_one(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    response = browser(instance, tmp_path / "missing").get("/")

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert "The server is up, but the editor isn&#x27;t built" in response.text
    assert "make build-web" in response.text
    assert f"<dd>{tmp_path / 'ui.db'}</dd>" in response.text


def test_a_web_build_is_served(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = browser(instance, built(tmp_path / "web"))

    assert client.get("/").text == "<!doctype html><title>app</title>"
    assert client.get("/assets/app.js").text == "export {};\n"
    assert client.get("/assets/missing.js").status_code == 404


def test_the_web_apps_own_addresses_open_the_web_app(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    client = browser(instance, built(tmp_path / "web"))

    for path in ("/workflows", f"/workflows/{UUID_TEXT}", "/tools/x/versions/1.0.0"):
        response = client.get(path)

        assert response.status_code == 200, path
        assert response.text == "<!doctype html><title>app</title>"

    assert client.get("/favicon.ico").status_code == 404
    assert client.get("/assets/missing.js").status_code == 404
    assert client.get("/assets/fonts/missing").status_code == 404


def test_without_a_web_build_any_page_says_how_to_build_one(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    response = browser(instance, tmp_path / "missing").get(f"/workflows/{UUID_TEXT}")

    assert response.status_code == 200
    assert "make build-web" in response.text


def test_the_editor_says_how_to_name_its_database_in_a_command(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    database = str(tmp_path / "ui.db")

    for shell in ("posix", "powershell"):
        app = build_app(
            instance, token=TOKEN, port=PORT, static_dir=tmp_path / "missing", shell=shell
        )
        client = TestClient(app, base_url=ORIGIN)
        client.get(f"/?token={TOKEN}")
        response = client.get("/api/editor")

        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert response.json() == {
            "version": __version__,
            "shell": shell,
            "command_prefix": command_prefix(database, shell),
        }


def test_the_editor_uses_this_computers_shell_by_default(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    response = browser(instance, tmp_path / "missing").get("/api/editor")

    assert response.json()["shell"] == local_shell()


def test_the_web_build_is_not_served_without_the_key(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    app = build_app(instance, token=TOKEN, port=PORT, static_dir=built(tmp_path / "web"))
    client = TestClient(app, base_url=ORIGIN)

    assert client.get("/assets/app.js").status_code == 401


def test_the_pages_own_styles_and_icon_are_served_to_anyone_here(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    app = build_app(instance, token=TOKEN, port=PORT, static_dir=tmp_path / "missing")
    client = TestClient(app, base_url=ORIGIN)

    for name in ("page.css", "icon.svg"):
        response = client.get(f"/_/{name}")

        assert response.status_code == 200, name
        assert response.content == (ASSETS_DIRECTORY / name).read_bytes()


def test_the_sign_in_page_loads_nothing_but_the_servers_own_files(
    instance: api.Azathoth,
    tmp_path: Path,
) -> None:
    app = build_app(instance, token=TOKEN, port=PORT, static_dir=tmp_path / "missing")
    page = TestClient(app, base_url=ORIGIN).get("/").text

    assert "<script" not in page
    assert "style=" not in page
    assert '<link rel="stylesheet" href="/_/page.css">' in page
    assert "http" not in page
