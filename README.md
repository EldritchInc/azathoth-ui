# Azathoth UI

A local editor for [Azathoth](https://github.com/EldritchInc/azathoth)
workflows, served on your own computer and opened in your browser.

The editor keeps an Azathoth instance of its own, and drives it only through
Azathoth's public service API, `azathoth.api`. It is in development for
Azathoth 1.4, and is not published yet.

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
