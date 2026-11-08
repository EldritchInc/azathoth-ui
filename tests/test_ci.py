"""Tests that CI checks both halves of the editor, and the wheel that ships them."""

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parents[1]

CI = PROJECT_ROOT / ".github" / "workflows" / "ci.yml"


def jobs() -> dict[str, str]:
    """Return each CI job's text, by its name."""

    text = CI.read_text(encoding="utf-8")
    body = text.split("\njobs:\n", 1)[1]
    parts = re.split(r"^  ([a-z-]+):\n", body, flags=re.MULTILINE)

    return dict(zip(parts[1::2], parts[2::2], strict=True))


def runs(
    job: str,
) -> list[str]:
    """Return the commands one job runs, in order, one line each."""

    commands: list[str] = []

    for block in re.findall(r"run: (\|\n(?:          .+\n)+|.+)", job):
        lines = block.splitlines()[1:] if block.startswith("|") else [block]
        commands.extend(line.strip() for line in lines)

    return commands


def test_ci_has_a_job_for_the_web_app_the_server_and_the_wheel() -> None:
    assert list(jobs()) == ["web", "server", "wheel"]


def test_the_web_job_checks_and_builds_the_web_app_with_its_lock() -> None:
    web = jobs()["web"]

    assert 'node-version: "22"' in web
    assert "cache-dependency-path: web/package-lock.json" in web
    assert "working-directory: web" in web
    assert runs(web) == [
        "npm ci",
        "npm run lint",
        "npm run format:check",
        "npm run typecheck",
        "npm test",
        "npm run build",
    ]


def test_the_server_job_runs_every_os_and_python() -> None:
    server = jobs()["server"]

    for name in ("ubuntu-latest", "macos-latest", "windows-latest", '"3.11"', '"3.12"', '"3.13"'):
        assert f"- {name}" in server
    assert runs(server)[1:] == [
        "python -m ruff check .",
        "python -m ruff format --check .",
        "python -m mypy src/azathoth_ui tests",
        "python -m pytest",
    ]


def test_the_wheel_job_builds_checks_installs_and_starts_the_editor() -> None:
    wheel = jobs()["wheel"]

    assert "needs:\n      - web\n      - server\n" in wheel
    assert runs(wheel) == [
        "make install-web build-web",
        "python -m pip install build",
        "python -m build",
        "python scripts/check_wheel.py dist/*.whl",
        'python -m venv "$RUNNER_TEMP/editor"',
        '"$RUNNER_TEMP/editor/bin/python" -m pip install "azathoth-ai>=1.4.0a1,==1.4.*" dist/*.whl',
        '\'"$RUNNER_TEMP/editor/bin/python" "$GITHUB_WORKSPACE/scripts/smoke.py"\'',
    ]
    assert "working-directory: ${{ runner.temp }}" in wheel
    assert "if-no-files-found: error" in wheel
