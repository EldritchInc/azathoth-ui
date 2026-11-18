"""Tests that the editor builds every instance's endpoints once, for an instance (ADR 0009)."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from azathoth import api
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.testclient import TestClient

from azathoth_ui.catalog import Catalog
from azathoth_ui.instances import instance_routes
from azathoth_ui.live import LiveRuns
from azathoth_ui.scoping import LOCAL_INSTANCE, InstanceContext, context_of
from tests.test_app import browser
from tests.test_browsing import WORKFLOW, WORKFLOW_ID

SOURCE = Path(__file__).parents[1] / "src" / "azathoth_ui"


def opened(
    path: Path,
) -> api.Azathoth:
    """Initialize and open an instance in one SQLite file."""

    api.initialize(path)

    return api.open(path)


def context(
    name: str,
    instance: api.Azathoth,
    prefix: str,
) -> InstanceContext:
    """Return the context the editor would serve one instance with."""

    return InstanceContext(
        name=name,
        instance=instance,
        catalog=Catalog(instance.models),
        portfolio=instance.portfolio,
        live=LiveRuns(),
        command_prefix=prefix,
    )


@pytest.fixture
def two_instances(
    tmp_path: Path,
) -> Iterator[tuple[api.Azathoth, api.Azathoth]]:
    """Yield a local instance and a second one holding one workflow, both closed afterwards."""

    local = opened(tmp_path / "local.db")
    other = opened(tmp_path / "other.db")

    other.workflows.import_document(WORKFLOW)

    try:
        yield local, other
    finally:
        local.close()
        other.close()


@pytest.fixture
def client(
    two_instances: tuple[api.Azathoth, api.Azathoth],
) -> TestClient:
    """Return a client of the same endpoints mounted twice: locally, and for a second instance."""

    local, other = two_instances
    app = Starlette(
        routes=[
            *instance_routes(context(LOCAL_INSTANCE, local, "LOCAL "), prefix="/api"),
            *instance_routes(context("staging", other, "--remote staging "), prefix="/elsewhere"),
        ]
    )

    return TestClient(app)


def test_each_mount_answers_from_its_own_instance(
    client: TestClient,
) -> None:
    assert client.get("/api/workflows").json() == {"items": []}

    (staged,) = client.get("/elsewhere/workflows").json()["items"]

    assert staged["name"] == "summarize"


def test_each_mount_describes_its_own_instance(
    client: TestClient,
    tmp_path: Path,
) -> None:
    assert client.get("/api/instance").json()["database"] == str(tmp_path / "local.db")
    assert client.get("/elsewhere/instance").json()["database"] == str(tmp_path / "other.db")


def test_each_mount_writes_commands_for_its_own_instance(
    client: TestClient,
) -> None:
    assert client.get("/api/commands").json() == {"instance": "local", "prefix": "LOCAL "}
    assert client.get("/elsewhere/commands").json() == {
        "instance": "staging",
        "prefix": "--remote staging ",
    }


def test_an_endpoint_with_path_parameters_answers_under_another_mount(
    client: TestClient,
) -> None:
    assert client.get(f"/elsewhere/workflows/{WORKFLOW_ID}").json()["name"] == "summarize"
    assert client.get(f"/elsewhere/workflows/{WORKFLOW_ID}/history").json()["items"]


def test_the_local_instance_is_served_under_the_api(
    tmp_path: Path,
) -> None:
    local = opened(tmp_path / "ui.db")

    try:
        response = browser(local, tmp_path / "missing").get("/api/commands")
    finally:
        local.close()

    assert response.status_code == 200
    assert response.json()["instance"] == LOCAL_INSTANCE
    assert str(tmp_path / "ui.db") in response.json()["prefix"]


def test_a_request_outside_any_instance_has_no_context() -> None:
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": []})

    with pytest.raises(RuntimeError, match="is not served for an instance"):
        context_of(request)


@pytest.mark.parametrize("module", ["browsing.py", "catalog.py", "live.py", "instances.py"])
def test_no_instance_endpoint_reads_the_app_for_its_instance(
    module: str,
) -> None:
    assert "request.app.state" not in (SOURCE / module).read_text(encoding="utf-8")
