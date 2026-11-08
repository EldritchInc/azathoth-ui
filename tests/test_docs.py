"""Tests of the editor's decision records."""

import re
from pathlib import Path

ADRS = Path(__file__).parents[1] / "docs" / "adrs"


def test_every_decision_is_listed_by_its_number_and_title() -> None:
    index = (ADRS / "README.md").read_text(encoding="utf-8")
    records = sorted(ADRS.glob("[0-9][0-9][0-9][0-9]-*.md"))

    assert records

    for record in records:
        heading = record.read_text(encoding="utf-8").splitlines()[0]
        matched = re.fullmatch(r"# ADR (\d{4}): (.+)", heading)

        assert matched is not None, record.name
        number, title = matched.groups()

        assert record.name.startswith(f"{number}-")
        assert f"| [{number}]({record.name}) | {title} | Accepted |" in index
