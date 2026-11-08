"""Tests of the `azathoth-ui` command: its instance, its socket, its address and its errors."""

import io
import socket
from collections.abc import Mapping
from pathlib import Path

import pytest
import uvicorn
from azathoth import api
from starlette.applications import Starlette
from starlette.testclient import TestClient
from starlette.types import ASGIApp

from azathoth_ui import __version__, cli
from azathoth_ui.cli import HOST, main


class Launch:
    """What one launch handed to the server and the browser."""

    def __init__(self) -> None:
        self.opened: list[str] = []
        self.served: list[tuple[str, int, bool]] = []
        self.answers: list[tuple[int, str]] = []

    def open_browser(
        self,
        url: str,
    ) -> bool:
        """Record the address the browser was sent to."""

        self.opened.append(url)

        return True

    def serve(
        self,
        app: ASGIApp,
        listener: socket.socket,
    ) -> None:
        """Instead of serving forever, visit the app once, as the browser would."""

        address, port = listener.getsockname()
        self.served.append((address, port, listener.get_inheritable()))
        url = self.opened[0] if self.opened else ""
        client = TestClient(app, base_url=f"http://{HOST}:{port}")

        if url:
            client.get(url.removeprefix(f"http://{HOST}:{port}"))
            response = client.get("/api/instance")
            self.answers.append((response.status_code, response.json()["database"]))


def run(
    *arguments: str,
    environment: dict[str, str],
    launch: Launch,
) -> tuple[int, str, str]:
    """Run the command once, and return its exit status, output and errors."""

    out, err = io.StringIO(), io.StringIO()
    status = main(
        list(arguments),
        serve=launch.serve,
        open_browser=launch.open_browser,
        environment=environment,
        stdout=out,
        stderr=err,
    )

    return status, out.getvalue(), err.getvalue()


def test_it_creates_its_instance_serves_it_and_opens_the_browser_signed_in(
    tmp_path: Path,
) -> None:
    launch = Launch()
    database = tmp_path / "nested" / "ui.db"

    status, out, err = run("--database", str(database), environment={}, launch=launch)

    assert (status, err) == (0, "")
    assert database.is_file()
    [(address, port, inheritable)] = launch.served
    [url] = launch.opened
    assert address == HOST
    assert port > 0
    assert url.startswith(f"http://127.0.0.1:{port}/?token=")
    assert out == f"Azathoth UI is running at\n\n  {url}\n\nPress Ctrl+C to stop.\n"
    assert launch.answers == [(200, str(database))]
    assert not inheritable


def test_without_a_database_it_opens_the_default_for_its_environment(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asked: list[Mapping[str, str] | None] = []
    environment = {"AZATHOTH_DATABASE": str(tmp_path / "named.db")}

    def default(
        *,
        environment: Mapping[str, str] | None = None,
    ) -> str:
        asked.append(environment)

        return str(tmp_path / "default.db")

    monkeypatch.setattr(cli, "default_database", default)
    launch = Launch()

    assert run(environment=environment, launch=launch)[0] == 0
    assert asked == [environment]
    assert launch.answers == [(200, str(tmp_path / "default.db"))]


def test_no_browser_only_prints_the_address(
    tmp_path: Path,
) -> None:
    launch = Launch()

    status, out, _ = run(
        "--database", str(tmp_path / "ui.db"), "--no-browser", environment={}, launch=launch
    )

    assert status == 0
    assert launch.opened == []
    assert "/?token=" in out


def test_it_listens_on_the_port_asked_for(
    tmp_path: Path,
) -> None:
    with socket.socket() as probe:
        probe.bind((HOST, 0))
        free = probe.getsockname()[1]

    launch = Launch()

    arguments = ("--database", str(tmp_path / "ui.db"), "--port", str(free))

    assert run(*arguments, environment={}, launch=launch)[0] == 0
    assert launch.served[0][1] == free


def test_a_port_in_use_is_reported(
    tmp_path: Path,
) -> None:
    with socket.socket() as taken:
        taken.bind((HOST, 0))
        taken.listen()
        port = taken.getsockname()[1]
        launch = Launch()

        arguments = ("--database", str(tmp_path / "ui.db"), "--port", str(port))
        status, out, err = run(*arguments, environment={}, launch=launch)

    assert (status, out) == (1, "")
    assert err.startswith(f"azathoth-ui: cannot listen on 127.0.0.1:{port}: ")
    assert launch.served == []


def test_an_api_error_message_is_printed_as_it_is(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def refuse(
        database: object,
    ) -> api.Initialization:
        raise api.InstanceUnavailableError("The database is somewhere else.")

    monkeypatch.setattr(api, "initialize", refuse)

    status, _, err = run("--database", str(tmp_path / "ui.db"), environment={}, launch=Launch())

    assert (status, err) == (1, "azathoth-ui: The database is somewhere else.\n")


def test_it_reports_its_version(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as exited:
        main(["--version"])

    assert exited.value.code == 0
    assert capsys.readouterr().out == f"azathoth-ui {__version__}\n"


def test_a_port_out_of_range_is_refused(
    capsys: pytest.CaptureFixture[str],
) -> None:
    with pytest.raises(SystemExit) as exited:
        main(["--port", "70000"])

    assert exited.value.code == 2
    assert "--port: must be from 0 to 65535, not 70000" in capsys.readouterr().err


def test_uvicorn_serves_the_socket_trusting_no_proxy_and_naming_no_server(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    served: list[tuple[uvicorn.Config, list[socket.socket] | None]] = []

    def run_server(
        server: uvicorn.Server,
        sockets: list[socket.socket] | None = None,
    ) -> None:
        served.append((server.config, sockets))

    monkeypatch.setattr(uvicorn.Server, "run", run_server)
    app = Starlette()

    with socket.socket() as listener:
        cli.serve_forever(app, listener)

    [(config, sockets)] = served
    assert config.app is app
    assert sockets == [listener]
    assert config.proxy_headers is False
    assert config.server_header is False
    assert config.access_log is False
    assert config.lifespan == "off"
