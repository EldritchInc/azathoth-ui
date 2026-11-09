"""The server's own pages, for when the web app cannot answer.

One asks for the launch key; the other says the installation has no web app
built into it. Both are static HTML under the strict policy of ADR 0001: no
script, no inline style, one stylesheet from the server itself.
"""

import re
from html import escape
from pathlib import Path
from typing import Final

from azathoth import api

TITLE: Final = "Azathoth UI"
"""Every page's title."""

ASSETS_PATH: Final = "/_/"
"""Where the server serves its pages' stylesheet and icon, without the key."""

BUILD_COMMAND: Final = "make build-web"
"""How a checkout of the editor builds its web app into the package."""

LOGO_FILE: Final = Path(__file__).parent / "assets" / "logo.svg"
"""The Eldritch, Inc. logo, in the text's colour."""

LOGO_VIEW_BOX: Final = "0 0 407.758 407.678"

LOGO_TRANSFORM: Final = "translate(-114.737 -108.016)"


def logo_path() -> str:
    """Return the outline the Eldritch, Inc. logo is drawn with."""

    matched = re.search(r'\sd="([^"]+)"', LOGO_FILE.read_text(encoding="utf-8"))

    if matched is None:
        raise RuntimeError(f"{LOGO_FILE} draws no outline.")

    return matched.group(1)


MARK: Final = (
    f'<svg viewBox="{LOGO_VIEW_BOX}" aria-hidden="true" focusable="false">'
    f'<path transform="{LOGO_TRANSFORM}" fill="currentColor" d="{logo_path()}"/></svg>'
)
"""The Eldritch, Inc. logo, inline, so that it takes the page's colours."""

ORBITS: Final = """\
<svg class="orbits" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
<g fill="none" stroke="currentColor" stroke-width="0.35">
<ellipse rx="96" ry="34" transform="rotate(-24)"/>
<ellipse rx="74" ry="27" transform="rotate(36)"/>
<ellipse rx="52" ry="19" transform="rotate(-64)"/>
<ellipse rx="30" ry="11" transform="rotate(12)"/>
</g>
<circle r="6" class="nucleus"/>
<g transform="rotate(-24)"><circle cx="-83" cy="-17" r="1.8" class="piper"/></g>
<g transform="rotate(36)"><circle cx="52" cy="19" r="1.5" class="piper"/></g>
<g transform="rotate(-64)"><circle cx="26" cy="-16.5" r="1.3" class="piper"/></g>
</svg>"""
"""The large, slow drawing behind each page."""


def page(
    heading: str,
    body: str,
) -> str:
    """Return one whole page: its heading, as text, and its body, as HTML already escaped."""

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>{TITLE}</title>
<link rel="icon" type="image/svg+xml" href="{ASSETS_PATH}icon.svg">
<link rel="stylesheet" href="{ASSETS_PATH}page.css">
</head>
<body>
{ORBITS}
<main>
<div class="mark">{MARK}<span>Azathoth</span></div>
<h1>{escape(heading)}</h1>
{body}
</main>
</body>
</html>
"""


def sign_in_page() -> str:
    """Return the page a browser without the launch key sees."""

    return page(
        "Open the editor from your terminal",
        "<p>The editor answers only the browser it was opened in. Open the address "
        "<code>azathoth-ui</code> printed when it started: it carries this launch's key.</p>\n"
        "<p>Lost the address? Stop the editor and start it again for a new one.</p>\n"
        '<code class="command">azathoth-ui</code>',
    )


def not_built_page(
    description: api.InstanceDescription,
) -> str:
    """Return the page shown when this installation has no web app, with the instance it serves."""

    facts = (
        ("Database", description.database),
        ("Backend", description.backend),
        ("Azathoth", description.azathoth_version),
        ("Service API", description.api_stability),
    )
    rows = "\n".join(f"<dt>{escape(name)}</dt><dd>{escape(value)}</dd>" for name, value in facts)

    return page(
        "The server is up, but the editor isn't built",
        "<p>This installation has no web app in it. Build it from your azathoth-ui "
        "checkout, then reload this page.</p>\n"
        f'<code class="command">{escape(BUILD_COMMAND)}</code>\n'
        f'<dl class="facts">\n{rows}\n</dl>',
    )


__all__ = [
    "ASSETS_PATH",
    "BUILD_COMMAND",
    "LOGO_FILE",
    "LOGO_TRANSFORM",
    "LOGO_VIEW_BOX",
    "MARK",
    "ORBITS",
    "TITLE",
    "logo_path",
    "not_built_page",
    "page",
    "sign_in_page",
]
