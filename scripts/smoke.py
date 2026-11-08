"""Start the installed editor and use it once: `python scripts/smoke.py`.

Run with the Python the wheel is installed in. It starts `azathoth-ui` on a
new database, opens the address it prints the way a browser would, and checks
that the web app's page and the instance it describes come back.
"""

import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Final

ADDRESS: Final = re.compile(r"http://127\.0\.0\.1:\d+/\?token=[A-Za-z0-9_-]+")


def printed_address(
    line: str,
) -> str | None:
    """Return the address with the launch key on one line of the command's output, if any."""

    matched = ADDRESS.search(line)

    return matched.group(0) if matched is not None else None


def smoke(
    database: Path,
) -> str:
    """Start the editor on one database, use it once, and return what it served."""

    process = subprocess.Popen(
        [sys.executable, "-m", "azathoth_ui", "--no-browser", "--database", str(database)],
        stdout=subprocess.PIPE,
        text=True,
    )

    try:
        if process.stdout is None:
            raise SystemExit("azathoth-ui's output could not be read")

        address = None

        for line in process.stdout:
            address = printed_address(line)

            if address is not None:
                break

        if address is None:
            raise SystemExit(f"azathoth-ui printed no address, and exited {process.wait()}")

        base = address.split("/?", 1)[0]
        browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

        with browser.open(address, timeout=30) as response:
            page = response.read().decode()

        if '<div id="root"></div>' not in page:
            raise SystemExit("the editor did not serve its web app")

        with browser.open(f"{base}/api/instance", timeout=30) as response:
            instance = json.load(response)

        if instance["database"] != str(database):
            raise SystemExit(f"the editor serves {instance['database']}, not {database}")

        return f"served the web app and {instance['database']} ({instance['azathoth_version']})"
    finally:
        process.terminate()
        process.wait(timeout=30)


def main() -> int:
    """Run the smoke test on a new database in a temporary folder."""

    with tempfile.TemporaryDirectory() as directory:
        print(smoke(Path(directory) / "ui.db"))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["printed_address", "smoke", "main"]
