"""Check that a built wheel holds the whole editor: `python scripts/check_wheel.py dist/*.whl`.

The wheel must hold the server's own pages, the type marker, the
`azathoth-ui` command, and the built web app: its page, icon, script,
stylesheet and fonts. The page may load only files the wheel holds, and no
source map is shipped.
"""

import re
import sys
import zipfile
from collections.abc import Sequence
from pathlib import Path
from typing import Final

PACKAGE: Final = "azathoth_ui/"

STATIC: Final = f"{PACKAGE}static/"

ASSETS: Final = f"{STATIC}assets/"

REQUIRED: Final = (
    f"{PACKAGE}py.typed",
    f"{PACKAGE}assets/page.css",
    f"{PACKAGE}assets/icon.svg",
    f"{STATIC}index.html",
    f"{STATIC}icon.svg",
)
"""Files every wheel must hold."""

BUILT_KINDS: Final = (
    ("script", ".js"),
    ("stylesheet", ".css"),
    ("font", ".woff2"),
)
"""What the web app's build must have put under `static/assets/`, by extension."""

COMMAND: Final = "azathoth-ui = azathoth_ui.cli:main"

LOADED: Final = re.compile(r'(?:src|href)="([^"]+)"')


def wheel_problems(
    path: Path,
) -> tuple[str, ...]:
    """Return everything wrong with one wheel; none means it holds the whole editor."""

    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        page = f"{STATIC}index.html"
        index = archive.read(page).decode() if page in names else ""
        entry_points = next(
            (
                archive.read(name).decode()
                for name in sorted(names)
                if name.endswith(".dist-info/entry_points.txt")
            ),
            "",
        )

    problems = [f"{name} is missing" for name in REQUIRED if name not in names]
    built = [name for name in names if name.startswith(ASSETS)]

    problems.extend(
        f"no {kind} under {ASSETS}"
        for kind, extension in BUILT_KINDS
        if not any(name.endswith(extension) for name in built)
    )

    if COMMAND not in entry_points.splitlines():
        problems.append("the azathoth-ui command is not declared")

    for loaded in LOADED.findall(index):
        if not loaded.startswith("/") or loaded.startswith("//"):
            problems.append(f"index.html loads {loaded} from elsewhere")
        elif f"{STATIC}{loaded.removeprefix('/')}" not in names:
            problems.append(f"index.html loads {loaded}, which the wheel lacks")

    problems.extend(f"{name} is a source map" for name in sorted(names) if name.endswith(".map"))

    return tuple(problems)


def main(
    argv: Sequence[str] | None = None,
) -> int:
    """Check each wheel named, print its problems, and return 1 if any has one."""

    paths = [Path(name) for name in (sys.argv[1:] if argv is None else argv)]

    if not paths:
        print("usage: check_wheel.py WHEEL...", file=sys.stderr)
        return 2

    failed = False

    for path in paths:
        problems = wheel_problems(path)
        failed = failed or bool(problems)

        for problem in problems:
            print(f"{path.name}: {problem}", file=sys.stderr)

        if not problems:
            print(f"{path.name}: holds the whole editor")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["wheel_problems", "main"]
