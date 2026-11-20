"""Tests of the package itself: its version, its one dependency on Azathoth, and its boundary."""

import ast
import re
import tomllib
from importlib.metadata import requires
from pathlib import Path
from typing import Final

import azathoth
from azathoth import api

from azathoth_ui import __version__

PROJECT_ROOT = Path(__file__).parents[1]

SOURCE = PROJECT_ROOT / "src" / "azathoth_ui"

PUBLIC_API = "azathoth.api"
"""The only part of Azathoth the editor may import."""

AZATHOTH_PRERELEASE: Final[str | None] = "1.5.0b1"
"""The Azathoth pre-release this pre-release of the editor needs, or None for a final release.

pip takes a pre-release only when one is named, so while the editor builds
on one, `make install` and CI name it, and no other package's pre-release.
"""


def is_final(
    version: str,
) -> bool:
    """Return whether one version is a final release, not an alpha, beta or candidate."""

    return re.fullmatch(r"\d+\.\d+\.\d+", version) is not None


def azathoth_requirement() -> str:
    """Return what `make install` and CI put before what they install, to bring Azathoth.

    Nothing for a final release, whose own requirement brings Azathoth's
    final release; the pre-release it needs, within its minor release,
    otherwise.
    """

    if AZATHOTH_PRERELEASE is None:
        return ""

    return f'"azathoth-ai>={AZATHOTH_PRERELEASE},=={minor_release(__version__)}.*" '


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


def test_windows_is_given_the_time_zones_spend_is_read_in_by_azathoth() -> None:
    # Windows keeps no IANA time zone database, so spend reads one from
    # `tzdata` (ADR 0014); from 1.5.0b1 Azathoth requires it, not the editor
    # (ADR 0015).
    dependencies = project()["dependencies"]
    azathoths = [
        "".join(requirement.split()).replace("'", '"')
        for requirement in requires("azathoth-ai") or []
    ]

    assert isinstance(dependencies, list)
    assert not [name for name in dependencies if name.startswith("tzdata")]
    assert 'tzdata>=2024.1;sys_platform=="win32"' in azathoths


def test_it_requires_exactly_its_own_minor_release_of_azathoth() -> None:
    dependencies = project()["dependencies"]

    assert isinstance(dependencies, list)
    assert [name for name in dependencies if name.startswith("azathoth")] == [
        f"azathoth-ai=={minor_release(__version__)}.*"
    ]


def test_it_is_released_as_stable() -> None:
    classifiers = project()["classifiers"]

    assert isinstance(classifiers, list)
    assert "Development Status :: 5 - Production/Stable" in classifiers
    assert not [each for each in classifiers if "Beta" in each or "Alpha" in each]


def test_its_server_is_starlette_on_uvicorn() -> None:
    assert project()["dependencies"] == [
        f"azathoth-ai=={minor_release(__version__)}.*",
        "starlette>=0.40",
        "uvicorn>=0.30",
    ]
    assert project()["scripts"] == {"azathoth-ui": "azathoth_ui.cli:main"}


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


def install() -> str:
    """Return how CI and `make install` install the editor, with Azathoth from PyPI."""

    return f'python -m pip install {azathoth_requirement()}-e ".[dev]"'


def test_a_final_release_builds_on_a_final_release_of_azathoth() -> None:
    prerelease = AZATHOTH_PRERELEASE

    assert is_final(__version__) == (prerelease is None)

    if prerelease is not None:
        assert not is_final(prerelease)
        assert minor_release(prerelease) == minor_release(__version__)


def test_ci_and_make_install_azathoth_from_pypi_as_the_editor_requires_it() -> None:
    ci = (PROJECT_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    makefile = (PROJECT_ROOT / "Makefile").read_text(encoding="utf-8")

    assert install() in ci
    assert install() in makefile

    for text in (ci, makefile):
        assert "--pre" not in text

        if AZATHOTH_PRERELEASE is None:
            assert "azathoth-ai>=" not in text
            assert "azathoth-ai==" not in text
    assert "github.com/EldritchInc/azathoth" not in ci
