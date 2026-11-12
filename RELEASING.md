# Releasing azathoth-ui

The editor is released as a Python distribution, built from this repository
with its web app inside, and published to PyPI by the release workflow,
`.github/workflows/release.yml`. Publishing uses PyPI Trusted Publishing, so
no API token is stored anywhere.

## Distribution Identity

The distribution is `azathoth-ui`, its import package `azathoth_ui`, and its
command `azathoth-ui`.

It requires exactly its own minor release of Azathoth,
`azathoth-ai==<major>.<minor>.*`, from PyPI. A minor release of the editor is
released after that Azathoth release is published, never before: until then,
nothing could install it.

## Version Authority

The version is recorded in:

```text
pyproject.toml
src/azathoth_ui/__init__.py
```

The tests require them to agree, and require the changelog's first entry to
be that version. The release workflow refuses a tag that is not `v` followed
by the version in `pyproject.toml`.

A release's version is therefore set in both, and its `CHANGELOG.md` entry
named for it, in a commit merged to `main`, before it is tagged.

PyPI never accepts the same version twice, even after a release is deleted.
A version that was published wrongly is fixed by publishing the next one.

## Release Prerequisites

Once, before the first release:

- a pending publisher on PyPI for `azathoth-ui`, naming the repository
  `EldritchInc/azathoth-ui`, the workflow `release.yml`, and the environment
  `pypi`;
- the same on TestPyPI, with the environment `testpypi`;
- recommended: a required reviewer on the `pypi` environment, under
  Settings → Environments in GitHub, so a pushed tag waits for approval before
  anything reaches PyPI.

## Validation

Before releasing, `make check` passes locally, and CI is green on the commit
being released: the web app, the server on 3 platforms with 3 Pythons, and
the wheel.

## How the Release Workflow Validates the Distributions

The `build` job checks exactly what is published:

1. it reads the version from `pyproject.toml`;
2. for a tag, it requires the tag to be exactly `v` followed by that version;
3. it builds the web app with `make install-web build-web`, then the source
   distribution and the wheel with `python -m build`;
4. it checks the wheel with `scripts/check_wheel.py`;
5. it installs the wheel alone into a clean environment, outside the
   checkout, so its own requirement brings Azathoth from PyPI;
6. it requires `azathoth-ui --version` to print `azathoth-ui <version>`, and
   starts the editor and uses it once, with `scripts/smoke.py`;
7. it passes those same files, unchanged, to the publishing job.

A tagged run publishes to PyPI; a manual run publishes to TestPyPI. Nothing
is rebuilt between validation and publication.

## Trial Release on TestPyPI

Before the first release, and whenever the release workflow changes, publish
the release candidate to TestPyPI:

1. merge the release commit to `main`;
2. in GitHub, open Actions → Release → Run workflow, and run it on `main`.

Then install it into a fresh venv, outside the checkout, and open it:

```bash
rm -rf ~/azathoth-ui-testpypi-check
python3 -m venv ~/azathoth-ui-testpypi-check/.venv
source ~/azathoth-ui-testpypi-check/.venv/bin/activate
python -m pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ "azathoth-ui==<version>"
azathoth-ui --version
azathoth-ui --database ~/azathoth-ui-testpypi-check/editor.db
```

```powershell
Remove-Item -Recurse -Force ~/azathoth-ui-testpypi-check -ErrorAction SilentlyContinue
py -m venv ~/azathoth-ui-testpypi-check/.venv
~/azathoth-ui-testpypi-check/.venv/Scripts/Activate.ps1
python -m pip install --index-url https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ "azathoth-ui==<version>"
azathoth-ui --version
azathoth-ui --database ~/azathoth-ui-testpypi-check/editor.db
```

`--version` must print `azathoth-ui <version>`. The editor opens in the
browser; its overview must name the new database, the Azathoth release it
requires, and a stable service API. Press Ctrl+C to stop it, then clean up:

```bash
deactivate
rm -rf ~/azathoth-ui-testpypi-check
```

```powershell
deactivate
Remove-Item -Recurse -Force ~/azathoth-ui-testpypi-check
```

`--extra-index-url` lets pip take Azathoth and the editor's other
dependencies from PyPI, because TestPyPI does not carry them. Pinning
`==<version>` makes sure the trial version is what was installed.

## Release

A release is triggered by pushing a version tag from the merged, validated
release commit on `main`:

```bash
git switch main
git pull
git tag -a v<version> -m "azathoth-ui <version>"
git push origin v<version>
```

The workflow then builds, validates and publishes to PyPI. When the `pypi`
environment has a required reviewer, publishing waits for that approval.

Push a release tag once. Never move or reuse a tag that has been pushed. A tag
pushed by mistake, before anything was published, is removed with:

```bash
git tag -d v<version>
git push origin --delete v<version>
```

After publication, create the GitHub Release from the tag. Its notes are the
version's entry in [`CHANGELOG.md`](CHANGELOG.md):

```bash
awk -v version=<version> '$0 == "## " version {found = 1; next} /^## / {found = 0} found' CHANGELOG.md > release-notes.md
gh release create v<version> --title "azathoth-ui <version>" --notes-file release-notes.md
```
