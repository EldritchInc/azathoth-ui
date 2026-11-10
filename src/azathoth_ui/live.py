"""Live runs: started from the editor, watched as they run, and cancelled (ADR 0007).

`azathoth.api` runs a workflow in one blocking call that reports each event
to a callback. The editor makes each run a live run: the call runs on a
thread of its own, its events are numbered and kept as they arrive, and the
web app reads them from a server-sent event stream it can leave and come
back to. A live run is named by an opaque handle, never by the kept run's
ID, which exists only once it has finished; its events are the service
API's own `RunEvent` JSON, so a run watched on another server could be told
the same way.

Live runs are kept in memory only. At most `MAX_RUNNING` run at once, and
the newest `KEEP_FINISHED` finished ones are remembered until the editor
stops; once a run finishes, the run Azathoth kept is its record.

Starting a run is a `POST` with a JSON body, as every change is (ADR 0003).
A file is sent in it as base64, so the body may be larger than a document:
at most `MAX_START_BYTES`, while Azathoth holds the file itself to its own
10 MB.
"""

import asyncio
import base64
import binascii
import json
import secrets
import threading
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Final, Literal
from uuid import UUID

from azathoth import api
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse
from starlette.routing import BaseRoute, Route

from azathoth_ui.browsing import WHOLE_NUMBER, instance_of, refusal

MAX_RUNNING: Final = 4
"""How many live runs the editor runs at once."""

KEEP_FINISHED: Final = 20
"""How many finished live runs the editor remembers."""

MAX_START_BYTES: Final = 14 * 1024 * 1024
"""The largest body that starts a run: a 10 MB file, as base64, with room to spare."""

POLL_SECONDS: Final = 0.05
"""How often an event stream looks for its run's new events."""

KEEP_ALIVE_SECONDS: Final = 15.0
"""How long an event stream stays quiet before it says it is still there."""

TOO_LARGE_MESSAGE: Final = "A run's input may be at most 10 MB, or 14 MB as it is sent."

BODY_MESSAGE: Final = 'Send a JSON object, such as {"workflow_id": ..., "input": ...}.'

START_FIELDS: Final = ("workflow_id", "input", "file")
"""What a body that starts a run may hold."""

STEP_FIELDS: Final = ("document", "step_id", "inputs", "files", "input", "file")
"""What a body that starts trying one step may hold."""

DOCUMENT_MESSAGE: Final = "document must be a workflow document, as a JSON object."

LiveKind = Literal["run", "step"]
"""What a live run runs: a workflow, or one step of a document tried alone."""

LiveState = Literal["running", "finished", "cancelled", "refused"]
"""Where a live run is: running, finished with its value, cancelled, or refused by Azathoth."""

LiveCall = Callable[[api.EventCallback, api.CancellationToken], api.ApiModel]
"""What a live run calls: given where to report events and a token, it returns its value."""


class TooManyRunsError(Exception):
    """The editor already runs as many live runs as it runs at once."""

    def __init__(
        self,
        running: int,
    ) -> None:
        noun = "run is" if running == 1 else "runs are"

        super().__init__(
            f"{running} {noun} already running, as many as the editor runs at once; "
            "wait for one to finish, or cancel one."
        )


@dataclass
class LiveRun:
    """One run started from the editor: its events so far, and how it ended."""

    handle: str
    kind: LiveKind
    workflow_id: UUID
    step_id: UUID | None
    started_at: datetime
    token: api.CancellationToken = field(default_factory=api.CancellationToken)
    events: list[dict[str, object]] = field(default_factory=list)
    state: LiveState = "running"
    finished_at: datetime | None = None
    result: dict[str, object] | None = None
    error: dict[str, str] | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)

    def record(
        self,
        event: api.RunEvent,
    ) -> None:
        """Keep one event the run reported, as the next of its events."""

        with self.lock:
            self.events.append(event.model_dump(mode="json"))

    def end(
        self,
        state: LiveState,
        *,
        result: api.ApiModel | None = None,
        error: api.ApiError | None = None,
    ) -> None:
        """Record how the run ended."""

        with self.lock:
            self.state = state
            self.finished_at = datetime.now(UTC)
            self.result = result.model_dump(mode="json") if result is not None else None
            self.error = {"code": error.code, "message": str(error)} if error is not None else None

    def since(
        self,
        position: int,
    ) -> tuple[list[tuple[int, dict[str, object]]], bool]:
        """Return the events after a position, numbered from 1, and whether the run has ended.

        Both are read together, so a run that has ended has no event left to read.
        """

        with self.lock:
            numbered = list(enumerate(self.events, start=1))[position:]

            return numbered, self.state != "running"

    def describe(
        self,
    ) -> dict[str, object]:
        """Return what the editor says of the run: where it is, and how it ended."""

        with self.lock:
            return {
                "handle": self.handle,
                "kind": self.kind,
                "workflow_id": str(self.workflow_id),
                "step_id": str(self.step_id) if self.step_id is not None else None,
                "state": self.state,
                "started_at": moment(self.started_at),
                "finished_at": moment(self.finished_at) if self.finished_at else None,
                "event_count": len(self.events),
                "result": self.result,
                "error": dict(self.error) if self.error is not None else None,
            }


def moment(
    value: datetime,
) -> str:
    """Return a moment as the API writes it: UTC, in ISO 8601, ending in `Z`."""

    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


class LiveRuns:
    """The live runs of one editor: at most so many running, so many finished remembered."""

    def __init__(
        self,
        *,
        max_running: int = MAX_RUNNING,
        keep_finished: int = KEEP_FINISHED,
    ) -> None:
        """Run at most `max_running` at once, and remember the newest `keep_finished` that ended."""

        self._max_running = max_running
        self._keep_finished = keep_finished
        self._lock = threading.Lock()
        self._runs: dict[str, LiveRun] = {}

    def start(
        self,
        kind: LiveKind,
        call: LiveCall,
        *,
        workflow_id: UUID,
        step_id: UUID | None = None,
    ) -> LiveRun:
        """Start one live run of `call` on a thread of its own, and return it.

        Raises:
            TooManyRunsError: As many runs as the editor runs at once are running.
        """

        with self._lock:
            running = sum(1 for run in self._runs.values() if run.state == "running")

            if running >= self._max_running:
                raise TooManyRunsError(running)

            run = LiveRun(
                handle=secrets.token_urlsafe(12),
                kind=kind,
                workflow_id=workflow_id,
                step_id=step_id,
                started_at=datetime.now(UTC),
            )
            self._runs[run.handle] = run

        threading.Thread(
            target=self._execute,
            args=(run, call),
            name=f"azathoth-ui live {kind} {run.handle}",
            daemon=True,
        ).start()

        return run

    def get(
        self,
        handle: str,
    ) -> LiveRun:
        """Return one live run.

        Raises:
            NotFoundError: The editor does not know it, or no longer remembers it.
        """

        with self._lock:
            run = self._runs.get(handle)

        if run is None:
            raise api.NotFoundError(
                f"No live run {handle} is known; it may have finished long ago."
            )

        return run

    def runs(
        self,
    ) -> tuple[LiveRun, ...]:
        """Return every live run the editor remembers, newest first."""

        with self._lock:
            return tuple(reversed(self._runs.values()))

    def _execute(
        self,
        run: LiveRun,
        call: LiveCall,
    ) -> None:
        """Run one live run's call to its end, and record how it ended."""

        try:
            result = call(run.record, run.token)
        except api.RunCancelledError as exc:
            run.end("cancelled", error=exc)
        except api.ApiError as exc:
            run.end("refused", error=exc)
        except Exception as exc:
            #
            # Whatever else a run raises ends that run, and only that run.
            #
            run.end("refused", error=api.ApiError(f"{type(exc).__name__}: {exc}"))
        else:
            run.end("finished", result=result)

        self._forget_old()

    def _forget_old(
        self,
    ) -> None:
        """Forget the oldest finished runs beyond those the editor remembers."""

        with self._lock:
            ended = [handle for handle, run in self._runs.items() if run.state != "running"]

            for handle in ended[: max(0, len(ended) - self._keep_finished)]:
                del self._runs[handle]


def live_of(
    request: Request,
) -> LiveRuns:
    """Return the editor's live runs."""

    live: LiveRuns = request.app.state.live

    return live


async def start_body(
    request: Request,
    fields: tuple[str, ...],
    noun: str,
) -> dict[str, object] | Response:
    """Return the JSON object a start sends, or the response that refuses it.

    Raises:
        InvalidArgumentError: It is not a JSON object, or holds a field it may not.
    """

    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()

    if media_type != "application/json":
        return refusal(415, "unsupported_media_type", f"Send the {noun} as application/json.")

    declared = request.headers.get("content-length", "")

    if declared.isdigit() and int(declared) > MAX_START_BYTES:
        return refusal(413, "request_too_large", TOO_LARGE_MESSAGE)

    body = bytearray()

    async for chunk in request.stream():
        body.extend(chunk)

        if len(body) > MAX_START_BYTES:
            return refusal(413, "request_too_large", TOO_LARGE_MESSAGE)

    try:
        value: object = json.loads(body.decode("utf-8"))
    except ValueError:
        raise api.InvalidArgumentError(BODY_MESSAGE) from None

    if not isinstance(value, dict):
        raise api.InvalidArgumentError(BODY_MESSAGE)

    unknown = sorted(str(key) for key in value if key not in fields)

    if unknown:
        raise api.InvalidArgumentError(
            f"A {noun} takes {', '.join(fields[:-1])} and {fields[-1]}, not {', '.join(unknown)}."
        )

    return {str(key): item for key, item in value.items()}


def uuid_field(
    body: dict[str, object],
    name: str,
    kind: str,
    *,
    label: str | None = None,
) -> UUID:
    """Return the id one field of a body names, or refuse it, by `label`, as an invalid argument."""

    value = body.get(name)
    refused = api.InvalidArgumentError(f"{label or name} must be a {kind} id.")

    if not isinstance(value, str):
        raise refused

    try:
        return UUID(value)
    except ValueError:
        raise refused from None


def run_file(
    value: object,
    name: str = "file",
) -> api.RunFile:
    """Return the file one field sends, its content in base64, or refuse it.

    Raises:
        InvalidArgumentError: It is not a file with its content in base64.
    """

    if (
        not isinstance(value, dict)
        or not isinstance(value.get("media_type"), str)
        or not isinstance(value.get("content"), str)
    ):
        raise api.InvalidArgumentError(
            f'{name} must be {{"media_type", "content"}}, its content in base64.'
        )

    try:
        content = base64.b64decode(value["content"], validate=True)
    except (binascii.Error, ValueError):
        raise api.InvalidArgumentError(f"{name}.content must be base64.") from None

    return api.RunFile(content=content, media_type=value["media_type"])


def run_input(
    body: dict[str, object],
) -> api.RunInput | api.RunFile | None:
    """Return the input a start gives its run: its JSON, a file, or none.

    A JSON null given is input; an input left out is none.

    Raises:
        InvalidArgumentError: Both are given, or the file cannot be read.
    """

    if "input" in body and "file" in body:
        raise api.InvalidArgumentError("Give a run input or a file, not both.")

    if "file" in body:
        return run_file(body["file"])

    if "input" in body:
        return api.RunInput.model_validate({"payload": body["input"]})

    return None


def started(
    run: LiveRun,
) -> JSONResponse:
    """Answer a start with the run it started: 201."""

    return JSONResponse(run.describe(), status_code=201)


async def start_run(
    request: Request,
) -> Response:
    """`POST /api/live/runs` `{"workflow_id", "input" | "file"}`: start a run: 201."""

    body = await start_body(request, START_FIELDS, "run")

    if isinstance(body, Response):
        return body

    workflow_id = uuid_field(body, "workflow_id", "workflow")
    given = run_input(body)
    instance = instance_of(request)
    await run_in_threadpool(instance.workflows.get, workflow_id)

    def call(
        on_event: api.EventCallback,
        cancel: api.CancellationToken,
    ) -> api.RunResult:
        """Run the workflow, reporting its events, until it ends or is cancelled."""

        return instance.runs.run(workflow_id, input=given, on_event=on_event, cancel=cancel)

    try:
        run = live_of(request).start("run", call, workflow_id=workflow_id)
    except TooManyRunsError as exc:
        return refusal(429, "too_many_runs", str(exc))

    return started(run)


def document_field(
    body: dict[str, object],
) -> tuple[dict[str, Any], UUID]:
    """Return the workflow document a body sends, and the id its metadata gives.

    Raises:
        InvalidArgumentError: It is not a JSON object, or names no workflow id.
    """

    document = body.get("document")

    if not isinstance(document, dict):
        raise api.InvalidArgumentError(DOCUMENT_MESSAGE)

    metadata = document.get("metadata")
    workflow_id = uuid_field(
        metadata if isinstance(metadata, dict) else {},
        "id",
        "workflow",
        label="document's metadata.id",
    )

    return {str(key): value for key, value in document.items()}, workflow_id


def step_inputs(
    body: dict[str, object],
) -> dict[str, Any]:
    """Return the values and files a body gives a step's inputs, by input name.

    A value is JSON as the body held it; a file is an `api.RunFile`.

    Raises:
        InvalidArgumentError: Either is not an object, a file cannot be read,
            or an input is given both ways.
    """

    values = body.get("inputs", {})
    files = body.get("files", {})

    if not isinstance(values, dict):
        raise api.InvalidArgumentError("inputs must be a JSON object of values by input name.")

    if not isinstance(files, dict):
        raise api.InvalidArgumentError("files must be a JSON object of files by input name.")

    both = next((str(name) for name in values if name in files), None)

    if both is not None:
        raise api.InvalidArgumentError(f"Give input {both!r} as a value or a file, not both.")

    return {
        **{str(name): value for name, value in values.items()},
        **{str(name): run_file(value, f"files.{name}") for name, value in files.items()},
    }


async def start_step(
    request: Request,
) -> Response:
    """`POST /api/live/steps` `{"document", "step_id", ...}`: start trying one step: 201.

    `inputs` gives the step's inputs values by name, and `files` gives them
    files; `input` or `file` is the run's input, for an input that reads it.
    """

    body = await start_body(request, STEP_FIELDS, "step to try")

    if isinstance(body, Response):
        return body

    document, workflow_id = document_field(body)
    step_id = uuid_field(body, "step_id", "step")
    given = step_inputs(body)
    source = run_input(body)
    instance = instance_of(request)

    def call(
        on_event: api.EventCallback,
        cancel: api.CancellationToken,
    ) -> api.StepTrial:
        """Try the step, reporting its events, until it ends or is cancelled."""

        return instance.runs.try_step(
            document,
            step_id,
            inputs=given,
            input=source,
            on_event=on_event,
            cancel=cancel,
        )

    try:
        run = live_of(request).start("step", call, workflow_id=workflow_id, step_id=step_id)
    except TooManyRunsError as exc:
        return refusal(429, "too_many_runs", str(exc))

    return started(run)


def list_live(
    request: Request,
) -> Response:
    """`GET /api/live`: every live run the editor remembers, newest first."""

    return JSONResponse({"items": [run.describe() for run in live_of(request).runs()]})


def get_live(
    request: Request,
) -> Response:
    """`GET /api/live/{handle}`: one live run: where it is, and how it ended."""

    return JSONResponse(live_of(request).get(request.path_params["handle"]).describe())


def cancel_live(
    request: Request,
) -> Response:
    """`POST /api/live/{handle}/cancel`: ask a live run to stop: 202, as it stands now.

    A run that has ended is as it was.
    """

    run = live_of(request).get(request.path_params["handle"])
    run.token.cancel()

    return JSONResponse(run.describe(), status_code=202)


def position(
    request: Request,
) -> int:
    """Return the last event the stream's reader saw: `Last-Event-ID`, or `?after=`, or none."""

    header = request.headers.get("last-event-id")
    name, text = ("after", request.query_params.get("after", "0"))

    if header is not None:
        name, text = "Last-Event-ID", header

    if WHOLE_NUMBER.fullmatch(text) is None:
        raise api.InvalidArgumentError(f"{name} must be a whole number, not {text!r}.")

    return int(text)


def message(
    event: str,
    data: object,
    *,
    number: int | None = None,
) -> str:
    """Return one server-sent event."""

    lines = [] if number is None else [f"id: {number}"]

    return "\n".join([*lines, f"event: {event}", f"data: {json.dumps(data)}", "", ""])


async def messages(
    run: LiveRun,
    after: int,
) -> AsyncIterator[str]:
    """Yield a live run's events after a position as they come, then how it ended."""

    seen = after
    quiet = 0.0

    while True:
        events, ended = run.since(seen)

        for number, event in events:
            yield message("run_event", event, number=number)
            seen = number
            quiet = 0.0

        if ended:
            yield message("end", run.describe())
            return

        await asyncio.sleep(POLL_SECONDS)
        quiet += POLL_SECONDS

        if quiet >= KEEP_ALIVE_SECONDS:
            yield ": still running\n\n"
            quiet = 0.0


def stream_live(
    request: Request,
) -> Response:
    """`GET /api/live/{handle}/events`: a live run's events as they come, then its end.

    Every event is numbered, so a reader that reconnects with `Last-Event-ID`,
    or asks with `?after=`, reads only what came after it.
    """

    run = live_of(request).get(request.path_params["handle"])

    return StreamingResponse(messages(run, position(request)), media_type="text/event-stream")


def live_routes() -> list[BaseRoute]:
    """Return the live runs API's routes."""

    return [
        Route("/api/live", list_live, methods=["GET"]),
        Route("/api/live/runs", start_run, methods=["POST"]),
        Route("/api/live/steps", start_step, methods=["POST"]),
        Route("/api/live/{handle}", get_live, methods=["GET"]),
        Route("/api/live/{handle}/events", stream_live, methods=["GET"]),
        Route("/api/live/{handle}/cancel", cancel_live, methods=["POST"]),
    ]


__all__ = [
    "DOCUMENT_MESSAGE",
    "KEEP_ALIVE_SECONDS",
    "KEEP_FINISHED",
    "MAX_RUNNING",
    "MAX_START_BYTES",
    "POLL_SECONDS",
    "STEP_FIELDS",
    "TOO_LARGE_MESSAGE",
    "START_FIELDS",
    "LiveCall",
    "LiveKind",
    "LiveRun",
    "LiveRuns",
    "LiveState",
    "TooManyRunsError",
    "live_of",
    "live_routes",
    "run_file",
    "start_body",
    "started",
    "uuid_field",
]
