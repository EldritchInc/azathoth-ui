"""Tests that ADRs 0016 and 0017, the README and the changelog say what the editor does on a remote.

The decision quotes what the editor says and serves exactly: the paths a
remote's endpoints are under, what goes after a command, the body a
permissions ask must have, and how many resources one asks of and for how
long an answer is kept, as the server and the web app each hold them.
"""

import re
from pathlib import Path

from azathoth_ui.remote_instances import REMOTE_PREFIX, remote_suffix
from azathoth_ui.remote_service import (
    MAX_RESOURCES,
    PERMISSIONS_MESSAGE,
    PERMISSIONS_PATH,
    SERVICE_PATH,
    TIMEOUT_SECONDS,
)
from azathoth_ui.remotes import TOKEN_COMMAND_MESSAGE

ROOT = Path(__file__).parents[1]

ADRS = ROOT / "docs" / "adrs"

ADR = ADRS / "0016-working-on-a-remote.md"

AMENDED = ADRS / "0009-one-editor-any-instance.md"

README = ROOT / "README.md"

CHANGELOG = ROOT / "CHANGELOG.md"

WEB_PERMISSIONS = ROOT / "web" / "src" / "remotePermissions.ts"

LINK = "https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0016-working-on-a-remote.md"

COMMAND_ADR = ADRS / "0017-a-remotes-token-from-its-command.md"

COMMAND_LINK = (
    "https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/"
    "0017-a-remotes-token-from-its-command.md"
)

WEB_REMOTE_LIST = ROOT / "web" / "src" / "components" / "RemoteList.tsx"


def text(
    document: Path,
) -> str:
    return document.read_text(encoding="utf-8")


def flat(
    document: Path,
) -> str:
    """Return a document with its lines joined, as prose reads across them."""

    return " ".join(text(document).split())


def web_constant(
    name: str,
) -> int:
    """Return one whole-number constant the web app's permissions keep."""

    found = re.search(rf"export const {name} = ([\d_]+);", text(WEB_PERMISSIONS))

    assert found is not None, name

    return int(found.group(1).replace("_", ""))


def test_the_decision_names_where_a_remotes_endpoints_and_pages_are() -> None:
    decision = flat(ADR)

    assert f"`{REMOTE_PREFIX}`" in decision
    assert "`/remotes/{name}`" in decision
    assert f"`GET {REMOTE_PREFIX}/service`" in decision
    assert f"`{REMOTE_PREFIX}/permissions`" in decision
    assert f"`{SERVICE_PATH}`" in decision
    assert f"`{PERMISSIONS_PATH}`" in decision


def test_the_decision_quotes_what_the_editor_says() -> None:
    decision = flat(ADR)

    assert f"`{remote_suffix('<name>').strip()}`" in decision
    assert PERMISSIONS_MESSAGE in [line.strip() for line in text(ADR).splitlines()]
    assert f"{TIMEOUT_SECONDS:g} seconds" in decision


def test_the_decision_says_how_many_resources_are_asked_of_and_for_how_long() -> None:
    decision = flat(ADR)
    kept = web_constant("PERMISSIONS_TTL") // 1000

    assert web_constant("MAX_RESOURCES") == MAX_RESOURCES
    assert f"at most {MAX_RESOURCES} at a time" in decision
    assert f"kept for {kept} seconds" in decision


def test_the_decision_amends_the_one_it_says_and_is_listed() -> None:
    status = text(AMENDED).split("## Status\n", 1)[1].split("\n## ", 1)[0]

    assert "amended by [ADR 0016](0016-working-on-a-remote.md)" in " ".join(status.split())
    assert text(ADR).startswith(
        "# ADR 0016: Working on a Remote\n\n## Status\n\nAccepted; amended by [ADR 0017]"
    )
    assert "| [0016](0016-working-on-a-remote.md) | Working on a Remote | Accepted |" in text(
        ADRS / "README.md"
    )


def test_the_readme_says_what_the_editor_does_on_a_remote() -> None:
    readme = flat(README)

    assert f"([ADR 0016]({LINK}))" in readme
    assert "`/remotes/<name>`" in readme
    assert "--remote <name>" in readme


def test_the_changelog_cites_the_decision() -> None:
    entry = text(CHANGELOG).split("\n## ", 2)[1]

    assert f"({LINK})" in entry
    assert "/permissions" in entry
    assert "/service" in entry


def test_the_token_command_decision_quotes_the_refusal_and_the_line_the_form_shows() -> None:
    decision = text(COMMAND_ADR)
    line = re.search(r"export const TOKEN_COMMAND_LINE = '([^']+)';", text(WEB_REMOTE_LIST))

    assert line is not None
    assert TOKEN_COMMAND_MESSAGE in [each.strip() for each in decision.splitlines()]
    assert f"`{line.group(1)}`" in flat(COMMAND_ADR)
    assert "`api.token_of`" in flat(COMMAND_ADR)
    assert "`token_set`" in flat(COMMAND_ADR)


def test_the_token_command_decision_amends_0016_and_is_listed() -> None:
    status = text(ADR).split("## Status\n", 1)[1].split("\n## ", 1)[0]

    assert "amended by [ADR 0017](0017-a-remotes-token-from-its-command.md)" in " ".join(
        status.split()
    )
    assert text(COMMAND_ADR).startswith(
        "# ADR 0017: A Remote's Token from Its Command\n\n## Status\n\nAccepted\n"
    )
    assert (
        "| [0017](0017-a-remotes-token-from-its-command.md) | A Remote's Token from Its Command "
        "| Accepted |"
    ) in text(ADRS / "README.md")


def test_the_readme_and_changelog_say_a_remotes_token_may_come_from_a_command() -> None:
    readme = flat(README)
    entry = text(CHANGELOG).split("\n## ", 2)[1]

    assert f"([ADR 0017]({COMMAND_LINK}))" in readme
    assert "--token-command" in readme
    assert f"({COMMAND_LINK})" in entry
    assert "--token-command" in entry
