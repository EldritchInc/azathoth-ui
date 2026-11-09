"""How the commands the editor shows name the editor's own database.

Every workflow, tool and benchmark the editor shows comes with the `azathoth`
command that does the same thing. The editor works on an instance of its own,
and the command line takes its database only from `AZATHOTH_DATABASE`, so a
command is shown with that variable set for it, in this computer's shell.
"""

import os
import shlex
from typing import Final, Literal

Shell = Literal["posix", "powershell"]
"""The shells the editor writes commands for: POSIX shells, and PowerShell on Windows."""

DATABASE_VARIABLE: Final = "AZATHOTH_DATABASE"


def local_shell(
    os_name: str | None = None,
) -> Shell:
    """Return the shell this computer's commands are written for: PowerShell on Windows."""

    return "powershell" if (os.name if os_name is None else os_name) == "nt" else "posix"


def command_prefix(
    database: str,
    shell: Shell,
) -> str:
    """Return what goes before an `azathoth` command so that it uses one database."""

    if shell == "powershell":
        quoted = database.replace("'", "''")

        return f"$env:{DATABASE_VARIABLE}='{quoted}'; "

    return f"{DATABASE_VARIABLE}={shlex.quote(database)} "


__all__ = ["DATABASE_VARIABLE", "Shell", "command_prefix", "local_shell"]
