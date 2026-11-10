# Azathoth UI

A local editor for [Azathoth](https://github.com/EldritchInc/azathoth)
workflows, served on your own computer and opened in your browser.

The editor keeps an Azathoth instance of its own, and drives it only through
Azathoth's public service API, `azathoth.api`. It is in development for
Azathoth 1.4, and is not published yet.

## Running it

```bash
azathoth-ui
```

The command creates the editor's own Azathoth instance the first time,
serves the editor on `127.0.0.1`, and opens it in your browser. It prints the
address it opened, with a key for this launch; only a browser that has opened
that address can use the editor. Press Ctrl+C to stop it.

- `--database` edits another Azathoth database, an SQLite file or a
  PostgreSQL URL. `AZATHOTH_DATABASE` does the same.
- `--port` listens on one port rather than any free one.
- `--no-browser` prints the address without opening it.

Providers are configured as they are for Azathoth's own command line, through
the environment: set `OPENROUTER_API_KEY`, or `AZATHOTH_BEDROCK=1` with your
AWS credentials, before launching it. The Models page then lists what they
serve, and keeps the editor's local portfolio, the models its workflows may
use; a shared server keeps its own
([ADR 0006](docs/adrs/0006-local-models-and-the-portfolio.md)).
A workflow's Run button runs it on text, JSON or a file, a PDF, an image or
text, and shows the run as it goes: each step lit on the graph as it starts
and ends, every event in words, and how it ended. A run goes on if you leave
its page, and the editor's rail points to the runs still running. Every run
is kept and listed on its workflow's page, with what each step did
([ADR 0007](docs/adrs/0007-running-and-watching-workflows.md)).
[ADR 0001](docs/adrs/0001-local-server-security.md) explains how the server
keeps other sites and other users out.

## Development

The editor is built against released Azathoth from PyPI. While 1.4 is in
pre-release, `make install` takes Azathoth's pre-release, and no other
package's:

The web app needs Node `^20.19.0 || >=22.12.0`, and npm.

```bash
python -m venv .venv
source .venv/bin/activate
make install
make install-web
make build-web
make check
```

`make build-web` builds the web app into the package, where `azathoth-ui`
serves it. `make check` lints, type-checks and tests both halves: the Python
package, and the web app with ESLint, Prettier, TypeScript and Vitest. It
never runs Azathoth's own test suite.

`make wheel` builds the web app, then the wheel with it, into `dist/`.
Building a wheel refuses until the web app is built.

To work on the web app with hot reloading, start the server on a fixed port,
open the address it prints once, then start Vite and open
<http://127.0.0.1:5173>:

```bash
azathoth-ui --port 8765 --no-browser
cd web && npm run dev
```

## License

MIT. See [LICENSE](LICENSE).
