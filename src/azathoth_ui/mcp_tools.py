"""Making a tool's document from a tool an MCP server serves (ADR 0015).

The server is asked for its tools, as `azathoth tool from-mcp` asks it, and
the answer is Azathoth's `DocumentExport`: the document, pinned as the
server serves it now, and the file name it suggests. Nothing is imported;
importing the document is `POST /api/tools/import`, a separate step, so a
person reads what they import. A server that cannot be reached or listed
answers 502.
"""

from typing import Final

from azathoth import api
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from azathoth_ui.browsing import instance_of, one
from azathoth_ui.live import start_body

FROM_MCP_FIELDS: Final = (
    "tool",
    "url",
    "command",
    "authorization",
    "grants",
    "timeout_seconds",
)
"""What a body that makes a tool from an MCP server may hold."""


def _text(
    body: dict[str, object],
    name: str,
) -> str | None:
    """Return one optional text field, `None` when it is left out or null.

    Raises:
        InvalidArgumentError: It is given and is not text.
    """

    value = body.get(name)

    if value is None:
        return None

    if not isinstance(value, str):
        raise api.InvalidArgumentError(f"{name} must be text.")

    return value


def _texts(
    body: dict[str, object],
    name: str,
) -> tuple[str, ...]:
    """Return one optional list of text, empty when it is left out.

    Raises:
        InvalidArgumentError: It is given and is not a list of text.
    """

    value = body.get(name)

    if value is None:
        return ()

    if not isinstance(value, list) or not all(isinstance(each, str) for each in value):
        raise api.InvalidArgumentError(f"{name} must be a list of text.")

    return tuple(value)


def _timeout(
    body: dict[str, object],
) -> float | None:
    """Return the timeout a body names, `None` when it names none.

    Raises:
        InvalidArgumentError: It is not a number of seconds above 0.
    """

    value = body.get("timeout_seconds")

    if value is None:
        return None

    if isinstance(value, bool) or not isinstance(value, int | float) or value <= 0:
        raise api.InvalidArgumentError("timeout_seconds must be a number of seconds above 0.")

    return float(value)


async def tool_from_mcp(
    request: Request,
) -> Response:
    """`POST /api/tools/from-mcp`: the document of a tool an MCP server serves.

    The body is `{"tool", "url"}` for a server reached over HTTP, with
    `"authorization"` naming the variable that holds its token, or
    `{"tool", "command"}` for one started by a command, with `"grants"`
    naming what it is given; either may name `"timeout_seconds"`. Naming the
    server both ways or neither is Azathoth's own refusal.
    """

    body = await start_body(request, FROM_MCP_FIELDS, "tool to make")

    if isinstance(body, Response):
        return body

    tool = _text(body, "tool")

    if not tool:
        raise api.InvalidArgumentError("tool must name the tool the server serves.")

    url = _text(body, "url")
    command = _texts(body, "command")
    authorization = _text(body, "authorization")
    grants = _texts(body, "grants")
    timeout_seconds = _timeout(body)
    tools = instance_of(request).tools

    exported = await run_in_threadpool(
        lambda: tools.from_mcp(
            tool,
            url=url,
            command=command,
            authorization=authorization,
            grants=grants,
            timeout_seconds=timeout_seconds,
        )
    )

    return one(exported)


def mcp_tool_routes() -> list[Route]:
    """Return the endpoint that makes a tool from an MCP server, below an instance's prefix."""

    return [
        Route("/tools/from-mcp", tool_from_mcp, methods=["POST"]),
    ]


__all__ = [
    "FROM_MCP_FIELDS",
    "mcp_tool_routes",
]
