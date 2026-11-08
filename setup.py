"""The editor's build: everything is in `pyproject.toml`, except one refusal.

A wheel without the web app would install an editor that can only say it is
not built, so building one refuses until `make build-web` has put the web app
in `src/azathoth_ui/static`. An editable install, for working on the
checkout, does not need it.
"""

from pathlib import Path
from typing import Final

from setuptools import setup
from setuptools.command.build_py import build_py

STATIC: Final = Path(__file__).resolve().parent / "src" / "azathoth_ui" / "static"
"""Where `make build-web` builds the web app into the package."""


def require_web_app(
    static: Path,
) -> None:
    """Refuse to build when one folder holds no built web app."""

    index = static / "index.html"

    if not index.is_file():
        raise SystemExit(
            f"error: {index} is missing. Run `make build-web` before building the wheel."
        )


class BuildPy(build_py):
    """`build_py` that refuses to build a wheel without the web app."""

    def needs_web_app(self) -> bool:
        """Return whether this build makes a wheel, rather than an editable install."""

        return not self.editable_mode

    def run(self) -> None:
        """Check for the web app, then build as usual."""

        if self.needs_web_app():
            require_web_app(STATIC)

        super().run()


if __name__ == "__main__":
    setup(cmdclass={"build_py": BuildPy})
