"""Where the editor keeps its own Azathoth instance (ADR 0001).

The editor works on a database of its own, private to the person running it,
in the platform's folder for application data. `--database`, or
`AZATHOTH_DATABASE`, names another.
"""

import os
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Final

DATABASE_FILE: Final = "ui.db"
"""The file name of the editor's own SQLite database."""

DATABASE_VARIABLE: Final = "AZATHOTH_DATABASE"
"""The variable that names another database, as it does for the command line."""


def data_directory(
    *,
    platform: str | None = None,
    environment: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> Path:
    """Return the folder this platform keeps one user's application data in, for Azathoth.

    macOS: `~/Library/Application Support/Azathoth`. Windows:
    `%LOCALAPPDATA%\\Azathoth`. Elsewhere: `$XDG_DATA_HOME/azathoth`, or
    `~/.local/share/azathoth` when that is unset.
    """

    system = sys.platform if platform is None else platform
    values = os.environ if environment is None else environment
    user = Path.home() if home is None else home

    if system == "darwin":
        return user / "Library" / "Application Support" / "Azathoth"

    if system.startswith("win"):
        local = values.get("LOCALAPPDATA")

        return (Path(local) if local else user / "AppData" / "Local") / "Azathoth"

    data = values.get("XDG_DATA_HOME")

    return (Path(data) if data else user / ".local" / "share") / "azathoth"


def default_database(
    *,
    platform: str | None = None,
    environment: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> str:
    """Return the database the editor opens when none is named.

    `AZATHOTH_DATABASE` names one, an SQLite file or a PostgreSQL URL, as it
    does for the command line; otherwise it is the editor's own file in the
    platform's data folder.
    """

    values = os.environ if environment is None else environment
    named = values.get(DATABASE_VARIABLE)

    if named:
        return named

    directory = data_directory(platform=platform, environment=values, home=home)

    return str(directory / DATABASE_FILE)


__all__ = [
    "DATABASE_FILE",
    "DATABASE_VARIABLE",
    "data_directory",
    "default_database",
]
