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
the environment. [ADR 0001](docs/adrs/0001-local-server-security.md) explains
how the server keeps other sites and other users out.

## Development

The editor is built against released Azathoth from PyPI. While 1.4 is in
pre-release, `make install` takes Azathoth's pre-release, and no other
package's:

```bash
python -m venv .venv
source .venv/bin/activate
make install
make check
```

`make check` lints, type-checks and tests the Python package. It never runs
Azathoth's own test suite.

## License

MIT. See [LICENSE](LICENSE).
