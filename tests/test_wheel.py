"""Tests of the wheel: the build that refuses to leave the web app out, and the checks CI runs."""

import tomllib
import zipfile
from pathlib import Path

import pytest
from setuptools import Distribution

import setup
from azathoth_ui.app import STATIC_DIRECTORY
from scripts.check_wheel import wheel_problems
from scripts.smoke import printed_address

PROJECT_ROOT = Path(__file__).parents[1]

ENTRY_POINTS = "[console_scripts]\nazathoth-ui = azathoth_ui.cli:main\n"

INDEX = (
    "<!doctype html><html><head>"
    '<link rel="icon" type="image/svg+xml" href="/icon.svg" />'
    '<script type="module" crossorigin src="/assets/index-CeXuR1xu.js"></script>'
    '<link rel="stylesheet" crossorigin href="/assets/index-BHY4PMxJ.css">'
    '</head><body><div id="root"></div></body></html>'
)

COMPLETE = {
    "azathoth_ui/__init__.py": "",
    "azathoth_ui/py.typed": "",
    "azathoth_ui/assets/page.css": "",
    "azathoth_ui/assets/icon.svg": "<svg/>",
    "azathoth_ui/static/index.html": INDEX,
    "azathoth_ui/static/icon.svg": "<svg/>",
    "azathoth_ui/static/assets/index-CeXuR1xu.js": "",
    "azathoth_ui/static/assets/index-BHY4PMxJ.css": "",
    "azathoth_ui/static/assets/fraunces-latin-full-normal-CFFu7zhK.woff2": "",
    "azathoth_ui-1.4.0.dist-info/entry_points.txt": ENTRY_POINTS,
}


def wheel(
    directory: Path,
    files: dict[str, str],
) -> Path:
    """Write a wheel holding exactly these files, and return its path."""

    path = directory / "azathoth_ui-1.4.0-py3-none-any.whl"

    with zipfile.ZipFile(path, "w") as archive:
        for name, text in files.items():
            archive.writestr(name, text)

    return path


def without(
    *names: str,
) -> dict[str, str]:
    """Return the complete wheel's files, less some."""

    return {name: text for name, text in COMPLETE.items() if name not in names}


def test_the_build_refuses_a_package_without_the_web_app(
    tmp_path: Path,
) -> None:
    with pytest.raises(SystemExit) as refused:
        setup.require_web_app(tmp_path / "static")

    assert str(refused.value) == (
        f"error: {tmp_path / 'static' / 'index.html'} is missing. "
        "Run `make build-web` before building the wheel."
    )


def test_the_build_takes_a_package_with_the_web_app(
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text(INDEX, encoding="utf-8")

    setup.require_web_app(tmp_path)


def test_the_build_checks_the_packages_own_static_folder() -> None:
    assert setup.STATIC == STATIC_DIRECTORY


def test_an_editable_install_needs_no_web_app() -> None:
    command = setup.BuildPy(Distribution())

    command.editable_mode = True
    assert not command.needs_web_app()

    command.editable_mode = False
    assert command.needs_web_app()


def test_make_wheel_builds_the_web_app_first() -> None:
    makefile = (PROJECT_ROOT / "Makefile").read_text(encoding="utf-8")

    assert "\nwheel: build-web\n\tpython -m build\n" in makefile


def test_the_package_data_takes_the_whole_build() -> None:
    with (PROJECT_ROOT / "pyproject.toml").open("rb") as handle:
        setuptools = tomllib.load(handle)["tool"]["setuptools"]

    assert setuptools["package-data"] == {
        "azathoth_ui": ["py.typed", "assets/*", "static/**/*"],
    }


def test_a_complete_wheel_has_no_problems(
    tmp_path: Path,
) -> None:
    assert wheel_problems(wheel(tmp_path, COMPLETE)) == ()


def test_a_wheel_without_the_web_app_says_what_is_missing(
    tmp_path: Path,
) -> None:
    files = {
        name: text for name, text in COMPLETE.items() if not name.startswith("azathoth_ui/static/")
    }

    assert wheel_problems(wheel(tmp_path, files)) == (
        "azathoth_ui/static/index.html is missing",
        "azathoth_ui/static/icon.svg is missing",
        "no script under azathoth_ui/static/assets/",
        "no stylesheet under azathoth_ui/static/assets/",
        "no font under azathoth_ui/static/assets/",
    )


def test_a_wheel_without_the_servers_own_pages_or_types_says_so(
    tmp_path: Path,
) -> None:
    files = without("azathoth_ui/py.typed", "azathoth_ui/assets/page.css")

    assert wheel_problems(wheel(tmp_path, files)) == (
        "azathoth_ui/py.typed is missing",
        "azathoth_ui/assets/page.css is missing",
    )


def test_a_wheel_without_the_command_says_so(
    tmp_path: Path,
) -> None:
    files = without("azathoth_ui-1.4.0.dist-info/entry_points.txt")

    assert wheel_problems(wheel(tmp_path, files)) == ("the azathoth-ui command is not declared",)


def test_a_page_that_loads_from_elsewhere_is_a_problem(
    tmp_path: Path,
) -> None:
    files = dict(COMPLETE)
    files["azathoth_ui/static/index.html"] = INDEX.replace(
        "</head>", '<link rel="stylesheet" href="https://fonts.example.com/a.css"></head>'
    )

    assert wheel_problems(wheel(tmp_path, files)) == (
        "index.html loads https://fonts.example.com/a.css from elsewhere",
    )


def test_a_protocol_relative_address_is_elsewhere_too(
    tmp_path: Path,
) -> None:
    files = dict(COMPLETE)
    files["azathoth_ui/static/index.html"] = INDEX.replace(
        "</head>", '<script src="//cdn.example.com/a.js"></script></head>'
    )

    assert wheel_problems(wheel(tmp_path, files)) == (
        "index.html loads //cdn.example.com/a.js from elsewhere",
    )


def test_a_page_that_names_a_file_the_wheel_lacks_is_a_problem(
    tmp_path: Path,
) -> None:
    files = without("azathoth_ui/static/assets/index-BHY4PMxJ.css")
    files["azathoth_ui/static/assets/other.css"] = ""

    assert wheel_problems(wheel(tmp_path, files)) == (
        "index.html loads /assets/index-BHY4PMxJ.css, which the wheel lacks",
    )


def test_source_maps_stay_out_of_the_wheel(
    tmp_path: Path,
) -> None:
    files = dict(COMPLETE)
    files["azathoth_ui/static/assets/index-CeXuR1xu.js.map"] = "{}"

    assert wheel_problems(wheel(tmp_path, files)) == (
        "azathoth_ui/static/assets/index-CeXuR1xu.js.map is a source map",
    )


def test_the_smoke_test_finds_the_address_the_command_prints() -> None:
    url = "http://127.0.0.1:54195/?token=jAGDI5GlRfGK1vKZ1HNoTGfpqXpI-tvgN3pZ38gNLJ8"

    assert printed_address(f"  {url}\n") == url
    assert printed_address("Azathoth UI is running at\n") is None
    assert printed_address("http://localhost:8000/?token=abc\n") is None
