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

## Consequences

- The web app starts a run, reads its stream, and can be closed and opened
  again on the same run, from its handle, without missing an event.
- A run that outlives the editor's server is cut off with it, as a run the
  command line starts is cut off when it is killed; Azathoth's journal
  keeps what it had done, to resume it from.
- The editor never runs more than 4 workflows at once, so a burst of clicks
  cannot pile up threads.
