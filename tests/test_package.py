"""Tests of the package itself: its version, its one dependency on Azathoth, and its boundary."""

import ast
import re
import tomllib
from pathlib import Path

import azathoth
from azathoth import api

from azathoth_ui import __version__

PROJECT_ROOT = Path(__file__).parents[1]

SOURCE = PROJECT_ROOT / "src" / "azathoth_ui"

PUBLIC_API = "azathoth.api"
"""The only part of Azathoth the editor may import."""


def project() -> dict[str, object]:
    """Return the `[project]` table of `pyproject.toml`."""

    with (PROJECT_ROOT / "pyproject.toml").open("rb") as handle:
        table: dict[str, object] = tomllib.load(handle)["project"]

    return table


def minor_release(
    version: str,
) -> str:
    """Return the `X.Y` of any `X.Y.Z` version, final, pre-release or development."""

    matched = re.match(r"(\d+\.\d+)\.\d+", version)

    assert matched is not None, version

    return matched.group(1)


def azathoth_imports(
    path: Path,
) -> tuple[str, ...]:
    """Return every name one source file imports from Azathoth, as `module` or `module:name`."""

    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: list[str] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(
                alias.name
                for alias in node.names
                if alias.name == "azathoth" or alias.name.startswith("azathoth.")
            )
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            if node.module == "azathoth":
                names.extend(f"azathoth:{alias.name}" for alias in node.names)
            elif node.module.startswith("azathoth."):
                names.append(node.module)

    return tuple(names)


def test_the_package_and_its_metadata_declare_one_version() -> None:
    assert project()["version"] == __version__


def test_it_requires_exactly_its_own_minor_release_of_azathoth() -> None:
    assert project()["dependencies"] == [f"azathoth-ai=={minor_release(__version__)}.*"]


def test_the_installed_azathoth_is_that_minor_release() -> None:
    assert minor_release(azathoth.__version__) == minor_release(__version__)
    assert api.API_STABILITY in ("provisional", "stable")


def test_the_package_is_typed() -> None:
    assert (SOURCE / "py.typed").is_file()


def test_the_editor_uses_azathoth_only_through_its_public_api() -> None:
    allowed = {PUBLIC_API, "azathoth:api"}
    used = {
        f"{path.relative_to(PROJECT_ROOT).as_posix()}: {name}"
        for path in sorted(SOURCE.rglob("*.py"))
        for name in azathoth_imports(path)
        if name not in allowed and not name.startswith(f"{PUBLIC_API}.")
    }

    assert used == set()


def test_an_import_past_the_public_api_is_found(
    tmp_path: Path,
) -> None:
    source = tmp_path / "module.py"
    source.write_text(
        "import azathoth.workflows\n"
        "from azathoth import api, __version__\n"
        "from azathoth.persistence import Repositories\n"
        "from azathoth.api.models import RunEvent\n",
        encoding="utf-8",
    )

    assert azathoth_imports(source) == (
        "azathoth.workflows",
        "azathoth:api",
        "azathoth:__version__",
        "azathoth.persistence",
        "azathoth.api.models",
    )


INSTALL = 'python -m pip install "azathoth-ai>=1.4.0a1,==1.4.*" -e ".[dev]"'
"""How CI and `make install` install the editor: Azathoth from PyPI, its pre-releases only."""


def test_ci_and_make_install_azathoth_from_pypi_admitting_only_its_pre_releases() -> None:
    ci = (PROJECT_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    makefile = (PROJECT_ROOT / "Makefile").read_text(encoding="utf-8")

    assert INSTALL in ci
    assert INSTALL in makefile
    assert "--pre" not in ci
    assert "--pre" not in makefile
    assert "github.com/EldritchInc/azathoth" not in ci
