# ADR 0007: Running and Watching Workflows

## Status

Accepted

## Context

A person composing a workflow wants to run it and watch what it does: each
step as it starts and finishes, the values it adds, how it ended. A run may
be given JSON or a document, a PDF or an image, and may take minutes when a
model is slow.

`azathoth.api` runs a workflow in one blocking call, `runs.run`, that
reports each event to a callback on the run's thread and stops when its
cancellation token is cancelled
([ADR 0120](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0120-public-service-api.md)).
It takes a file as `RunFile`, checked and kept as `--input-file` keeps one,
at most 10 MB
([ADR 0121](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0121-service-api-second-round.md)).
The finished run is kept, and `runs.get` reads it back. A browser cannot
hold one HTTP request open for the length of a run and also be told of each
event, nor should a reload or a closed tab end a run.

Runs on a shared instance will one day be watched from the editor too, so
nothing about watching a run should depend on its running here.

## Decision

- **A run started from the editor is a live run.** The editor's server runs
  the blocking call on a thread of its own, numbers each event as it
  arrives and keeps it, and records how the run ended: `finished` with its
  value, `cancelled`, or `refused` with the error Azathoth gave. Leaving the
  page, reloading or closing the tab never stops it; only cancelling does.
- **A live run is named by an opaque handle,** never by the kept run's ID,
  which exists only once the run has finished. Its events are the service
  API's own `RunEvent` JSON. A run watched on another server can be given a
  handle and told in the same events, so the web app watches it the same
  way.
- **Events are a server-sent event stream.** `GET /api/live/{handle}/events`
  sends every event as `run_event`, numbered from 1 as its `id`, then one
  `end` holding the run as `GET /api/live/{handle}` describes it, and
  closes. A reader that reconnects with `Last-Event-ID`, or asks with
  `?after=`, is sent only what came after. A quiet stream says it is still
  there every 15 seconds. A stream is a `GET`, read only by this server's
  own pages, as ADR 0001 guards every request.
- **Starting and cancelling are `POST`s with this server's `Origin`,** as
  every change is (ADR 0003). `POST /api/live/runs` takes
  `{"workflow_id", "input"}` or `{"workflow_id", "file"}`; a JSON null given
  as `input` is input, and leaving it out gives none. A file is
  `{"media_type", "content"}`, its content in base64, so the body is JSON
  like every other. Base64 makes 10 MB about 13.4 MB, so a start may be at
  most 14 MB (otherwise 413, `request_too_large`), while Azathoth holds the
  file itself to its own 10 MB.
- **A workflow that is not configured is refused at once** (404); anything
  Azathoth refuses once the run has started, such as a file that is not its
  media type or a step with no tool, ends the live run `refused`, with its
  code and message.
- **At most 4 live runs run at once.** Each holds a thread for as long as
  it runs; a fifth is refused (429, `too_many_runs`) with a message saying
  to wait for one or cancel one.
- **Live runs are kept in memory only,** and the newest 20 finished ones
  are remembered until the editor stops. Once a run has finished, the run
  Azathoth kept is its record; a live run's `result` names it by `run_id`.

- **Trying one step is a live run too,** of kind `step`. `POST
  /api/live/steps` takes the document, imported or not, the `step_id`, the
  values its inputs are given by name as `inputs` and files as `files`, and
  the run's input as `input` or `file`, for an input that reads it. Its
  events and its end stream as a run's do; there is no run to start or
  finish, so it reports only its step's events, and its `result` is
  Azathoth's `StepTrial`. Nothing of it is kept.
- **The editor asks Azathoth what it makes of a document,** rather than
  repeating its rules. `POST /api/workflows/check` names every reason
  importing the document would refuse it, with where and in which step,
  asking no provider. `POST /api/workflows/readiness` says whether each step
  could run here now, and on what, asking the providers. Neither saves
  anything. Both take the document as an import does, at most 10 MB.
- **The models a step's requirements match are Azathoth's answer, kept a
  while.** `POST /api/models/matching` asks `models.matching`, which asks
  the providers; the editor keeps each answer by its requirements for as
  long as it keeps the catalog, so a step being edited asks once for each
  set of requirements it has. Every answer is forgotten when the local
  portfolio changes, or the catalog is refreshed.
- **The runs Azathoth kept are read as it keeps them:** `GET
  /api/workflows/{id}/runs` newest first, and `GET /api/runs/{run_id}` with
  every step's output, values, measurements and failed attempts.

- **The web app runs a workflow from its page.** Run opens
  `/workflows/{id}/run`, where the run is given text, which most workflows
  take; JSON, any value, run only once it reads as JSON; a file, checked for
  its type and its 10 MB before it is read and sent; or nothing. Starting
  the run opens `/live/{handle}`.
- **A live run's page shows it as it goes.** Each step on the graph, and in
  the outline, says where it is: waiting, running, done, failed, skipped, or
  stopped when the run ended while it ran. Every event is said in words as
  it comes, beside the graph on a wide screen and under it otherwise. Once
  the run ends, the page shows its result, or the step it failed on and why,
  or that it was cancelled or refused, and names the run Azathoth kept. The
  page reads the stream from its handle, so a reload, or opening it from
  another tab, shows the run from its first event.
- **The rail points to the runs still running.** It asks which are every 2
  seconds while any is running, and every 15 while none is, and links to the
  newest.

## Consequences

- The web app starts a run, reads its stream, and can be closed and opened
  again on the same run, from its handle, without missing an event.
- A run that outlives the editor's server is cut off with it, as a run the
  command line starts is cut off when it is killed; Azathoth's journal
  keeps what it had done, to resume it from.
- The editor never runs more than 4 workflows at once, so a burst of clicks
  cannot pile up threads.
