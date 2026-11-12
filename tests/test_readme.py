"""Tests that the README, which PyPI shows as the editor's page, holds for this release."""

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parents[1]

README = PROJECT_ROOT / "README.md"


def text() -> str:
    """Return the README."""

    return README.read_text(encoding="utf-8")


def test_every_link_is_absolute_so_it_works_on_pypi() -> None:
    targets = re.findall(r"\]\(([^)]+)\)", text())

    assert targets
    assert all(target.startswith("https://") for target in targets), targets


def test_it_says_which_azathoth_it_needs_and_that_it_is_released() -> None:
    readme = " ".join(text().split())

    assert "and needs Azathoth 1.4." in readme
    assert "beta" not in readme.lower()
    assert "pre-release" not in readme
    assert "1.4.0b" not in readme


def test_it_installs_from_pypi_with_azathoth_beside_it() -> None:
    readme = text()

    assert "## Installing it\n" in readme
    assert "```bash\npython -m pip install azathoth-ui\n```" in readme
    assert "pip brings Azathoth 1.4 with it, from PyPI." in readme
