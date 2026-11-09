"""Tests of how the editor names its own database in the commands it shows."""

from azathoth_ui.commands import command_prefix, local_shell


def test_posix_shells_set_the_variable_for_one_command() -> None:
    assert command_prefix("/home/eris/ui.db", "posix") == "AZATHOTH_DATABASE=/home/eris/ui.db "


def test_posix_quoting_keeps_a_path_whole() -> None:
    database = "/Users/eris/Library/Application Support/Azathoth/ui.db"

    assert command_prefix(database, "posix") == (
        "AZATHOTH_DATABASE='/Users/eris/Library/Application Support/Azathoth/ui.db' "
    )
    assert command_prefix("/tmp/it's.db", "posix") == "AZATHOTH_DATABASE='/tmp/it'\"'\"'s.db' "


def test_powershell_sets_the_variable_then_runs_the_command() -> None:
    assert command_prefix(r"C:\Users\eris\AppData\Local\Azathoth\ui.db", "powershell") == (
        r"$env:AZATHOTH_DATABASE='C:\Users\eris\AppData\Local\Azathoth\ui.db'; "
    )
    assert command_prefix(r"C:\it's.db", "powershell") == r"$env:AZATHOTH_DATABASE='C:\it''s.db'; "


def test_the_shell_is_powershell_on_windows_and_posix_elsewhere() -> None:
    assert local_shell("nt") == "powershell"
    assert local_shell("posix") == "posix"
