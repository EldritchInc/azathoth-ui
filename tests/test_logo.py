"""Tests that the Eldritch, Inc. logo is one drawing wherever the editor shows it."""

import re
from pathlib import Path

from azathoth_ui.app import ASSETS_DIRECTORY
from azathoth_ui.pages import MARK, logo_path, sign_in_page

PROJECT_ROOT = Path(__file__).parents[1]

LOGO = ASSETS_DIRECTORY / "logo.svg"

ICONS = (ASSETS_DIRECTORY / "icon.svg", PROJECT_ROOT / "web" / "public" / "icon.svg")

WEB_LOGO = PROJECT_ROOT / "web" / "src" / "logo.ts"


def path_in(
    text: str,
) -> str:
    """Return the outline one SVG or TypeScript file draws the logo with."""

    matched = re.search(r'\sd="([^"]+)"|LOGO_PATH =\s+"([^"]+)"', text)

    assert matched is not None

    return matched.group(1) or matched.group(2)


def test_the_logo_takes_the_colour_of_the_text_around_it() -> None:
    logo = LOGO.read_text(encoding="utf-8")

    assert 'fill="currentColor"' in logo
    assert logo_path() == path_in(logo)
    assert len(logo_path()) > 10_000


def test_the_icon_and_the_web_apps_logo_draw_the_same_outline() -> None:
    outline = logo_path()

    for icon in ICONS:
        assert path_in(icon.read_text(encoding="utf-8")) == outline, icon

    assert path_in(WEB_LOGO.read_text(encoding="utf-8")) == outline


def test_the_icon_has_a_colour_of_its_own_for_light_and_dark_tabs() -> None:
    for icon in ICONS:
        text = icon.read_text(encoding="utf-8")

        assert 'fill="#4a56a6"' in text, icon
        assert "<style" not in text


def test_the_servers_pages_show_the_logo_inline() -> None:
    assert logo_path() in MARK
    assert 'fill="currentColor"' in MARK
    assert MARK in sign_in_page()
    assert 'aria-hidden="true"' in MARK
