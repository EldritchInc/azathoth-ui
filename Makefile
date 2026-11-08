.PHONY: install install-web check check-server check-web build-web wheel

# Azathoth itself comes from PyPI. While 1.4 is in pre-release, naming its
# first pre-release lets pip take Azathoth's pre-releases, and no other
# package's.
install:
	python -m pip install "azathoth-ai>=1.4.0a1,==1.4.*" -e ".[dev]"

# The web app's dependencies, exactly as web/package-lock.json pins them.
install-web:
	cd web && npm ci

check: check-server check-web

check-server:
	python -m ruff check .
	python -m ruff format --check .
	python -m mypy src/azathoth_ui tests
	python -m pytest

check-web:
	cd web && npm run lint
	cd web && npm run format:check
	cd web && npm run typecheck
	cd web && npm test

# Builds the web app into src/azathoth_ui/static, where the server serves it.
build-web:
	cd web && npm run build

# Builds the wheel, with the web app in it, into dist/.
wheel: build-web
	python -m build
