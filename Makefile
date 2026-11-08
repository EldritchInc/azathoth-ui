.PHONY: install check check-server

# Azathoth itself comes from PyPI. While 1.4 is in pre-release, naming its
# first pre-release lets pip take Azathoth's pre-releases, and no other
# package's.
install:
	python -m pip install "azathoth-ai>=1.4.0a1,==1.4.*" -e ".[dev]"

check: check-server

check-server:
	python -m ruff check .
	python -m ruff format --check .
	python -m mypy src/azathoth_ui tests
	python -m pytest
