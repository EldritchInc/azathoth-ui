"""Tests that the changelog's first entry is this release."""

import re
from pathlib import Path

from azathoth_ui import __version__

CHANGELOG = Path(__file__).parents[1] / "CHANGELOG.md"


def headings() -> list[str]:
    """Return the changelog's entries' headings, newest first."""

    return re.findall(r"^## (\S.*)$", CHANGELOG.read_text(encoding="utf-8"), re.MULTILINE)


def test_the_first_entry_is_this_release() -> None:
    assert headings()[0] == __version__
    assert "Unreleased" not in headings()


def test_the_first_release_says_nothing_of_pre_releases() -> None:
    assert "1.4.0b" not in CHANGELOG.read_text(encoding="utf-8")
