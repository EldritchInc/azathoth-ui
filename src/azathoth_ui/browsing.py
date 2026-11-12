"""The browsing API: the workflows, tools, benchmarks and runs in the editor's own instance.

Every answer is `azathoth.api`'s own model as JSON. A list or a history is
`{"items": [...]}`, newest revision first for a history. An id or a number
that cannot be read is refused as an invalid argument before Azathoth is
asked, and anything Azathoth refuses answers with its own code and message.

Importing takes one document as `application/json`, at most
`MAX_DOCUMENT_BYTES`, and makes it its component's next revision: nothing is
ever changed in place. It answers with Azathoth's import, whose `created`
says whether a revision was made: 201 when one was, and 200 when the
document is the latest revision's, which then is the one returned.
Checking a workflow document, and asking whether it could run here, take
one the same way and save nothing (ADR 0003, ADR 0007).
"""

import re
from collections.abc import Callable
from typing import Final
from uuid import UUID

from azathoth import api
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import BaseRoute, Route

MAX_DOCUMENT_BYTES: Final = 10 * 1024 * 1024
"""The largest document the editor imports."""

TOO_LARGE_MESSAGE: Final = "A document may be at most 10 MB."

MEDIA_TYPE_MESSAGE: Final = "Send the document as application/json."

NOT_UTF8_MESSAGE: Final = "The document is not UTF-8 text."

WHOLE_NUMBER: Final = re.compile(r"[0-9]+")


def instance_of(
    request: Request,
) -> api.Azathoth:
    """Return the instance the editor serves."""

    instance: api.Azathoth = request.app.state.instance

    return instance


def items(
    models: tuple[api.ApiModel, ...],
) -> JSONResponse:
    """Answer with a list of models."""

    return JSONResponse({"items": [model.model_dump(mode="json") for model in models]})


def one(
    model: api.ApiModel,
    *,
    status: int = 200,
) -> JSONResponse:
    """Answer with one model."""

    return JSONResponse(model.model_dump(mode="json"), status_code=status)


def identifier(
    request: Request,
    name: str,
    kind: str,
) -> UUID:
    """Return the id one path parameter names, or refuse it as an invalid argument."""

    text: str = request.path_params[name]

    try:
        return UUID(text)
    except ValueError:
        raise api.InvalidArgumentError(f"{text!r} is not a {kind} id.") from None


def whole_number(
    request: Request,
    name: str,
) -> int | None:
    """Return the whole number one query parameter gives, `None` when it is absent."""

    text = request.query_params.get(name)

    if text is None:
        return None

    if WHOLE_NUMBER.fullmatch(text) is None:
        raise api.InvalidArgumentError(f"{name} must be a whole number, not {text!r}.")

    return int(text)


def refusal(
    status: int,
    code: str,
    message: str,
) -> JSONResponse:
    """Answer a request the editor refuses before asking Azathoth."""

    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


async def document_of(
    request: Request,
) -> str | Response:
    """Return the document a request sends, or the response that refuses it.

    Raises:
        InvalidDocumentError: It is not UTF-8 text.
    """

    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()

    if media_type != "application/json":
        return refusal(415, "unsupported_media_type", MEDIA_TYPE_MESSAGE)

    declared = request.headers.get("content-length", "")

    if declared.isdigit() and int(declared) > MAX_DOCUMENT_BYTES:
        return refusal(413, "document_too_large", TOO_LARGE_MESSAGE)

    body = bytearray()

    async for chunk in request.stream():
        body.extend(chunk)

        if len(body) > MAX_DOCUMENT_BYTES:
            return refusal(413, "document_too_large", TOO_LARGE_MESSAGE)

    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        raise api.InvalidDocumentError(NOT_UTF8_MESSAGE) from None


async def judged_by(
    request: Request,
    judge: Callable[[str], api.ApiModel],
    *,
    status: int = 200,
) -> Response:
    """Answer with what one call of the service API makes of the request's document."""

    document = await document_of(request)

    if isinstance(document, Response):
        return document

    return one(await run_in_threadpool(judge, document), status=status)


Imported = api.WorkflowImport | api.ToolImport | api.BenchmarkImport
"""What importing one document did, as Azathoth says."""


async def import_with(
    request: Request,
    importer: Callable[[str], Imported],
) -> Response:
    """Import the request's document with one importer, as its component's next revision.

    It answers 201 when a revision was made, and 200 when the document is
    the latest revision's, so nothing was (ADR 0122).
    """

    document = await document_of(request)

    if isinstance(document, Response):
        return document

    imported = await run_in_threadpool(importer, document)

    return one(imported, status=201 if imported.created else 200)


def list_workflows(
    request: Request,
) -> Response:
    """`GET /api/workflows`: every workflow at its latest revision."""

    return items(instance_of(request).workflows.list())


def get_workflow(
    request: Request,
) -> Response:
    """`GET /api/workflows/{id}?revision=`: one revision of a workflow, the latest by default."""

    workflow_id = identifier(request, "workflow_id", "workflow")
    revision = whole_number(request, "revision")

    return one(instance_of(request).workflows.get(workflow_id, revision=revision))


def workflow_history(
    request: Request,
) -> Response:
    """`GET /api/workflows/{id}/history?limit=`: a workflow's revisions, newest first."""

    workflow_id = identifier(request, "workflow_id", "workflow")
    limit = whole_number(request, "limit")

    return items(instance_of(request).workflows.history(workflow_id, limit=limit))


async def import_workflow(
    request: Request,
) -> Response:
    """`POST /api/workflows/import`: import a workflow document as its next revision."""

    return await import_with(request, instance_of(request).workflows.import_document)


async def check_workflow(
    request: Request,
) -> Response:
    """`POST /api/workflows/check`: every reason importing a document would refuse it.

    Nothing is saved, and no provider is asked.
    """

    return await judged_by(request, instance_of(request).workflows.check)


async def workflow_readiness(
    request: Request,
) -> Response:
    """`POST /api/workflows/readiness`: whether each step of a document could run here now.

    The providers are asked what they serve, as a run asks them; nothing is saved.
    """

    return await judged_by(request, instance_of(request).runs.readiness)


def workflow_runs(
    request: Request,
) -> Response:
    """`GET /api/workflows/{id}/runs?limit=`: a workflow's kept runs, newest first."""

    workflow_id = identifier(request, "workflow_id", "workflow")
    limit = whole_number(request, "limit")

    return items(instance_of(request).runs.list(workflow_id, limit=limit))


def get_run(
    request: Request,
) -> Response:
    """`GET /api/runs/{run_id}`: one kept run, with its input, its result and its steps."""

    return one(instance_of(request).runs.get(identifier(request, "run_id", "run")))


def list_tools(
    request: Request,
) -> Response:
    """`GET /api/tools`: every tool version at its latest revision."""

    return items(instance_of(request).tools.list())


def get_tool(
    request: Request,
) -> Response:
    """`GET /api/tools/{id}/versions/{version}?revision=`: one revision of one tool version."""

    tool_id = identifier(request, "tool_id", "tool")
    version: str = request.path_params["version"]
    revision = whole_number(request, "revision")

    return one(instance_of(request).tools.get(tool_id, version, revision=revision))


def tool_history(
    request: Request,
) -> Response:
    """`GET /api/tools/{id}/history?version=&limit=`: a tool's revisions, newest first."""

    tool_id = identifier(request, "tool_id", "tool")
    version = request.query_params.get("version")
    limit = whole_number(request, "limit")

    return items(instance_of(request).tools.history(tool_id, version=version, limit=limit))


async def import_tool(
    request: Request,
) -> Response:
    """`POST /api/tools/import`: import a tool document as its version's next revision."""

    return await import_with(request, instance_of(request).tools.import_document)


def list_benchmarks(
    request: Request,
) -> Response:
    """`GET /api/benchmarks`: every benchmark at its latest revision."""

    return items(instance_of(request).benchmarks.list())


def get_benchmark(
    request: Request,
) -> Response:
    """`GET /api/benchmarks/{id}?revision=`: one revision of a benchmark, the latest by default."""

    benchmark_id = identifier(request, "benchmark_id", "benchmark")
    revision = whole_number(request, "revision")

    return one(instance_of(request).benchmarks.get(benchmark_id, revision=revision))


def benchmark_history(
    request: Request,
) -> Response:
    """`GET /api/benchmarks/{id}/history?limit=`: a benchmark's revisions, newest first."""

    benchmark_id = identifier(request, "benchmark_id", "benchmark")
    limit = whole_number(request, "limit")

    return items(instance_of(request).benchmarks.history(benchmark_id, limit=limit))


async def import_benchmark(
    request: Request,
) -> Response:
    """`POST /api/benchmarks/import`: import a benchmark document as its next revision."""

    return await import_with(request, instance_of(request).benchmarks.import_document)


def browsing_routes() -> list[BaseRoute]:
    """Return the browsing API's routes."""

    return [
        Route("/api/workflows", list_workflows, methods=["GET"]),
        Route("/api/workflows/import", import_workflow, methods=["POST"]),
        Route("/api/workflows/check", check_workflow, methods=["POST"]),
        Route("/api/workflows/readiness", workflow_readiness, methods=["POST"]),
        Route("/api/workflows/{workflow_id}", get_workflow, methods=["GET"]),
        Route("/api/workflows/{workflow_id}/history", workflow_history, methods=["GET"]),
        Route("/api/workflows/{workflow_id}/runs", workflow_runs, methods=["GET"]),
        Route("/api/runs/{run_id}", get_run, methods=["GET"]),
        Route("/api/tools", list_tools, methods=["GET"]),
        Route("/api/tools/import", import_tool, methods=["POST"]),
        Route("/api/tools/{tool_id}/history", tool_history, methods=["GET"]),
        Route("/api/tools/{tool_id}/versions/{version}", get_tool, methods=["GET"]),
        Route("/api/benchmarks", list_benchmarks, methods=["GET"]),
        Route("/api/benchmarks/import", import_benchmark, methods=["POST"]),
        Route("/api/benchmarks/{benchmark_id}", get_benchmark, methods=["GET"]),
        Route("/api/benchmarks/{benchmark_id}/history", benchmark_history, methods=["GET"]),
    ]


__all__ = [
    "MAX_DOCUMENT_BYTES",
    "MEDIA_TYPE_MESSAGE",
    "NOT_UTF8_MESSAGE",
    "TOO_LARGE_MESSAGE",
    "browsing_routes",
    "identifier",
    "whole_number",
]
