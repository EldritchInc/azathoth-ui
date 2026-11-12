"""Tests that the release workflow publishes exactly what it checked, as RELEASING.md says."""

import re
from pathlib import Path

from tests.test_ci import runs

PROJECT_ROOT = Path(__file__).parents[1]

RELEASE = PROJECT_ROOT / ".github" / "workflows" / "release.yml"

RELEASING = PROJECT_ROOT / "RELEASING.md"


def workflow() -> str:
    """Return the release workflow."""

    return RELEASE.read_text(encoding="utf-8")


def jobs() -> dict[str, str]:
    """Return each release job's text, by its name."""

    body = workflow().split("\njobs:\n", 1)[1]
    parts = re.split(r"^  ([a-z-]+):\n", body, flags=re.MULTILINE)

    return dict(zip(parts[1::2], parts[2::2], strict=True))


def releasing() -> str:
    """Return RELEASING.md."""

    return RELEASING.read_text(encoding="utf-8")


def test_a_tag_publishes_and_a_manual_run_tries_it_out() -> None:
    assert 'on:\n  push:\n    tags:\n      - "v*"\n  workflow_dispatch:\n' in workflow()
    assert "permissions:\n  contents: read\n" in workflow()
    assert list(jobs()) == ["build", "publish-pypi", "publish-testpypi"]


def test_the_build_checks_the_wheel_it_publishes_as_ci_does() -> None:
    build = jobs()["build"]

    assert 'node-version: "22"' in build
    assert "cache-dependency-path: web/package-lock.json" in build
    assert 'python-version: "3.13"' in build
    assert runs(build) == [
        "version=\"$(python -c \"import tomllib; print(tomllib.load(open('pyproject.toml', "
        "'rb'))['project']['version'])\")\"",
        'echo "version=${version}" >> "$GITHUB_OUTPUT"',
        'if [ "$GITHUB_REF_NAME" != "v$VERSION" ]; then',
        'echo "Tag $GITHUB_REF_NAME does not match the declared version $VERSION." >&2',
        "exit 1",
        "fi",
        "make install-web build-web",
        "python -m pip install build",
        "python -m build",
        "python scripts/check_wheel.py dist/*.whl",
        'python -m venv "$RUNNER_TEMP/release-check"',
        '"$RUNNER_TEMP/release-check/bin/python" -m pip install dist/*.whl',
        'test "$("$RUNNER_TEMP/release-check/bin/azathoth-ui" --version)" = "azathoth-ui $VERSION"',
        '\'"$RUNNER_TEMP/release-check/bin/python" "$GITHUB_WORKSPACE/scripts/smoke.py"\'',
    ]
    assert "if: github.event_name == 'push'" in build
    assert build.count("working-directory: ${{ runner.temp }}") == 2
    assert "if-no-files-found: error" in build


def test_a_tag_publishes_to_pypi_and_a_manual_run_to_testpypi() -> None:
    pypi = jobs()["publish-pypi"]
    testpypi = jobs()["publish-testpypi"]

    assert "if: github.event_name == 'push'" in pypi
    assert "if: github.event_name == 'workflow_dispatch'" in testpypi

    for job, environment, url in (
        (pypi, "pypi", "https://pypi.org/p/azathoth-ui"),
        (testpypi, "testpypi", "https://test.pypi.org/p/azathoth-ui"),
    ):
        assert "needs: build" in job
        assert f"name: {environment}\n      url: {url}\n" in job
        assert "permissions:\n      id-token: write\n" in job
        assert "name: distributions" in job
        assert "uses: pypa/gh-action-pypi-publish@release/v1" in job
        assert "actions/checkout" not in job
        assert "python -m build" not in job

    assert "repository-url: https://test.pypi.org/legacy/" in testpypi
    assert "repository-url" not in pypi


def test_the_workflow_stores_no_token() -> None:
    assert "secrets." not in workflow()
    assert "password" not in workflow()


def test_releasing_names_the_publishers_the_workflow_needs() -> None:
    text = " ".join(releasing().split())

    assert (
        "`EldritchInc/azathoth-ui`, the workflow `release.yml`, and the environment `pypi`" in text
    )
    assert "the same on TestPyPI, with the environment `testpypi`" in text


def test_releasing_tags_the_release_the_workflow_requires() -> None:
    assert 'git tag -a v<version> -m "azathoth-ui <version>"\ngit push origin v<version>\n' in (
        releasing()
    )


def test_releasing_tries_the_testpypi_release_with_azathoth_from_pypi() -> None:
    install = (
        "python -m pip install --index-url https://test.pypi.org/simple/ "
        '--extra-index-url https://pypi.org/simple/ "azathoth-ui==<version>"'
    )

    assert releasing().count(install) == 2


def test_releasing_publishes_this_versions_changelog_entry_as_the_github_release() -> None:
    assert (
        'awk -v version=<version> \'$0 == "## " version {found = 1; next} '
        "/^## / {found = 0} found' CHANGELOG.md > release-notes.md"
    ) in releasing()
    assert (
        'gh release create v<version> --title "azathoth-ui <version>" --notes-file release-notes.md'
    ) in releasing()


def test_releasing_lists_the_two_places_the_version_is_kept() -> None:
    assert "```text\npyproject.toml\nsrc/azathoth_ui/__init__.py\n```" in releasing()
