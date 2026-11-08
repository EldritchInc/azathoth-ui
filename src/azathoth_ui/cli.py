"""The `azathoth-ui` command: start the editor on this computer and open it.

It creates the editor's instance if there is none yet, opens it with the
providers the environment configures, listens on `127.0.0.1` only, prints the
address with this launch's key, and opens the browser there (ADR 0001).
"""

import argparse
import socket
import sys
import webbrowser
from collections.abc import Callable, Mapping, Sequence
from typing import Final, TextIO

import uvicorn
from azathoth import api
from starlette.types import ASGIApp

from azathoth_ui import __version__
from azathoth_ui.app import build_app
from azathoth_ui.paths import default_database
from azathoth_ui.security import TOKEN_PARAMETER, new_token

HOST: Final = "127.0.0.1"
"""The only address the editor listens on."""

PROGRAM: Final = "azathoth-ui"

Serve = Callable[[ASGIApp, socket.socket], None]
"""Serves one app on one listening socket until it is stopped."""

OpenBrowser = Callable[[str], object]
"""Opens one address in the person's browser."""


def port_number(
    text: str,
) -> int:
    """Return the port one `--port` names, refusing any outside 0 to 65535."""

    value = int(text)

    if not 0 <= value <= 65535:
        raise argparse.ArgumentTypeError(f"must be from 0 to 65535, not {value}")

    return value


def parser() -> argparse.ArgumentParser:
    """Return the command's argument parser."""

    command = argparse.ArgumentParser(
        prog=PROGRAM,
        description="Start the Azathoth editor on this computer and open it in your browser.",
    )
    command.add_argument(
        "--database",
        help="the Azathoth database to edit: an SQLite file or a PostgreSQL URL "
        "(default: AZATHOTH_DATABASE, or the editor's own file)",
    )
    command.add_argument(
        "--port",
        type=port_number,
        default=0,
        help="the port to listen on at 127.0.0.1 (default: any free port)",
    )
    command.add_argument(
        "--no-browser",
        action="store_true",
        help="print the address without opening a browser",
    )
    command.add_argument("--version", action="version", version=f"{PROGRAM} {__version__}")

    return command


def serve_forever(
    app: ASGIApp,
    listener: socket.socket,
) -> None:
    """Serve one app on one listening socket with uvicorn, until Ctrl+C."""

    config = uvicorn.Config(
        app,
        lifespan="off",
        log_level="warning",
        access_log=False,
        proxy_headers=False,
        server_header=False,
    )
    uvicorn.Server(config).run(sockets=[listener])


def listen(
    port: int,
) -> socket.socket:
    """Return a socket listening at `127.0.0.1` on one port, or on a free one for 0."""

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    try:
        listener.bind((HOST, port))
        listener.listen()
    except OSError:
        listener.close()
        raise

    return listener


def main(
    argv: Sequence[str] | None = None,
    *,
    serve: Serve = serve_forever,
    open_browser: OpenBrowser = webbrowser.open,
    environment: Mapping[str, str] | None = None,
    stdout: TextIO | None = None,
    stderr: TextIO | None = None,
) -> int:
    """Run the command, and return its exit status."""

    out = sys.stdout if stdout is None else stdout
    err = sys.stderr if stderr is None else stderr
    arguments = parser().parse_args(argv)
    database: str = arguments.database or default_database(environment=environment)

    try:
        api.initialize(database)
        instance = api.open(
            database,
            providers=api.ProviderSettings.from_environment(environment),
        )
    except api.ApiError as error:
        print(f"{PROGRAM}: {error}", file=err)
        return 1

    with instance:
        try:
            listener = listen(arguments.port)
        except OSError as error:
            reason = error.strerror or str(error)
            print(f"{PROGRAM}: cannot listen on {HOST}:{arguments.port}: {reason}", file=err)
            return 1

        with listener:
            port = listener.getsockname()[1]
            token = new_token()
            url = f"http://{HOST}:{port}/?{TOKEN_PARAMETER}={token}"
            app = build_app(instance, token=token, port=port)

            print(f"Azathoth UI is running at\n\n  {url}\n\nPress Ctrl+C to stop.", file=out)
            out.flush()

            if not arguments.no_browser:
                open_browser(url)

            serve(app, listener)

    return 0


__all__ = [
    "HOST",
    "PROGRAM",
    "OpenBrowser",
    "Serve",
    "listen",
    "main",
    "parser",
    "port_number",
    "serve_forever",
]
