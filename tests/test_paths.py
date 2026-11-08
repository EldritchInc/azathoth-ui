"""Tests of where the editor keeps its own instance."""

from pathlib import Path

from azathoth_ui.paths import DATABASE_FILE, DATABASE_VARIABLE, data_directory, default_database

HOME = Path("/home/eris")


def test_macos_keeps_it_in_application_support() -> None:
    assert data_directory(platform="darwin", environment={}, home=HOME) == (
        HOME / "Library" / "Application Support" / "Azathoth"
    )


def test_windows_keeps_it_in_local_app_data() -> None:
    environment = {"LOCALAPPDATA": "C:/Users/eris/AppData/Local"}

    assert data_directory(platform="win32", environment=environment, home=HOME) == (
        Path("C:/Users/eris/AppData/Local") / "Azathoth"
    )


def test_windows_without_local_app_data_uses_its_usual_place() -> None:
    assert data_directory(platform="win32", environment={}, home=HOME) == (
        HOME / "AppData" / "Local" / "Azathoth"
    )


def test_linux_keeps_it_in_the_xdg_data_home() -> None:
    environment = {"XDG_DATA_HOME": "/data/eris"}

    assert data_directory(platform="linux", environment=environment, home=HOME) == (
        Path("/data/eris") / "azathoth"
    )


def test_linux_without_an_xdg_data_home_uses_its_default() -> None:
    assert data_directory(platform="linux", environment={"XDG_DATA_HOME": ""}, home=HOME) == (
        HOME / ".local" / "share" / "azathoth"
    )


def test_the_default_database_is_the_editors_own_file() -> None:
    assert DATABASE_FILE == "ui.db"
    assert default_database(platform="darwin", environment={}, home=HOME) == str(
        HOME / "Library" / "Application Support" / "Azathoth" / "ui.db"
    )


def test_azathoth_database_names_another() -> None:
    environment = {DATABASE_VARIABLE: "postgresql://azathoth@db/azathoth"}

    assert DATABASE_VARIABLE == "AZATHOTH_DATABASE"
    assert default_database(platform="linux", environment=environment, home=HOME) == (
        "postgresql://azathoth@db/azathoth"
    )


def test_an_empty_azathoth_database_names_nothing() -> None:
    environment = {DATABASE_VARIABLE: "", "XDG_DATA_HOME": "/data/eris"}

    assert default_database(platform="linux", environment=environment, home=HOME) == str(
        Path("/data/eris") / "azathoth" / "ui.db"
    )
