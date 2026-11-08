"""Tests that the web app and the Python package agree on where it is built and how."""

import json
import re
from pathlib import Path

from azathoth_ui.app import ASSETS_DIRECTORY, STATIC_DIRECTORY
from azathoth_ui.pages import BUILD_COMMAND

PROJECT_ROOT = Path(__file__).parents[1]

WEB = PROJECT_ROOT / "web"


def makefile_targets() -> dict[str, list[str]]:
    """Return each Makefile target's recipe lines."""

    targets: dict[str, list[str]] = {}
    current: list[str] | None = None

    for line in (PROJECT_ROOT / "Makefile").read_text(encoding="utf-8").splitlines():
        matched = re.match(r"([a-z-]+):(.*)$", line)

        if matched is not None:
            current = targets.setdefault(matched.group(1), [])
            current.extend(matched.group(2).split())
        elif line.startswith("\t") and current is not None:
            current.append(line.strip())

    return targets


def test_the_page_without_a_build_names_the_target_that_builds_it() -> None:
    assert BUILD_COMMAND == "make build-web"
    assert makefile_targets()["build-web"] == ["cd web && npm run build"]


def test_make_check_checks_the_web_app_too() -> None:
    targets = makefile_targets()

    assert targets["check"] == ["check-server", "check-web"]
    assert targets["check-web"] == [
        "cd web && npm run lint",
        "cd web && npm run format:check",
        "cd web && npm run typecheck",
        "cd web && npm test",
    ]
    assert targets["install-web"] == ["cd web && npm ci"]


def test_vite_builds_where_the_server_serves_from() -> None:
    config = (WEB / "vite.config.ts").read_text(encoding="utf-8")
    matched = re.search(r'new URL\("([^"]+)", import\.meta\.url\)', config)

    assert matched is not None
    assert (WEB / matched.group(1)).resolve() == STATIC_DIRECTORY.resolve()
    assert "emptyOutDir: true" in config
    assert "assetsInlineLimit: 0" in config


def test_the_build_is_never_committed() -> None:
    ignored = (PROJECT_ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()

    assert "src/azathoth_ui/static/" in ignored
    assert "web/node_modules/" in ignored


def test_the_web_app_and_the_servers_pages_share_one_icon() -> None:
    web_icon = (WEB / "public" / "icon.svg").read_bytes()

    assert web_icon == (ASSETS_DIRECTORY / "icon.svg").read_bytes()


def test_the_scripts_make_check_runs_exist() -> None:
    package = json.loads((WEB / "package.json").read_text(encoding="utf-8"))

    assert package["private"] is True
    assert package["scripts"]["build"] == "tsc --noEmit && vite build"
    assert package["scripts"]["lint"] == "eslint . --max-warnings 0"
    assert package["scripts"]["format:check"] == "prettier --check ."
    assert package["scripts"]["typecheck"] == "tsc --noEmit"
    assert package["scripts"]["test"] == "vitest run"


def test_the_web_app_loads_nothing_from_elsewhere() -> None:
    index = (WEB / "index.html").read_text(encoding="utf-8")

    assert re.findall(r'(?:src|href)="([^"]+)"', index) == ["/icon.svg", "/src/main.tsx"]
    assert "<style" not in index
    assert "<script>" not in index
