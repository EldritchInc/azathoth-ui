# ADR 0003: Editor HTTP API

## Status

Accepted

## Context

The web app reaches Azathoth only through the editor's own server, and the
server reaches it only through `azathoth.api`
([ADR 0120](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0120-public-service-api.md)).
The server's HTTP API is therefore a thin, stable translation of that API:
the web app should learn nothing from it that `azathoth.api` does not say,
and should never be able to change anything in place.

Most of the work people do in the editor is on its own local instance: they
create or pull workflows, work on them there, and push a finished one to a
shared server. Every component the editor shows comes with the `azathoth`
command that does the same thing, and that command has to work on the
editor's own database, which the command line takes only from
`AZATHOTH_DATABASE`.

## Decision

Every endpoint is behind the guard of [ADR 0001](0001-local-server-security.md),
answers in JSON, and is never cached.

| Endpoint | Answer |
| --- | --- |
| `GET /api/instance` | The instance, as `describe()` |
| `GET /api/editor` | The editor's version, its shell, the prefix that names its database in a command, and the providers it was opened with, by name |
| `GET /api/workflows` | Every workflow at its latest revision |
| `GET /api/workflows/{id}?revision=` | One revision with its document, the latest by default |
| `GET /api/workflows/{id}/history?limit=` | Its revisions, newest first |
| `POST /api/workflows/import` | Imports a document as its next revision: 201 |
| `GET /api/tools` | Every tool version at its latest revision |
| `GET /api/tools/{id}/versions/{version}?revision=` | One revision of one exact version |
| `GET /api/tools/{id}/history?version=&limit=` | Its revisions, of one version when named |
| `POST /api/tools/import` | Imports a document as its version's next revision: 201 |
| `GET /api/benchmarks` | Every benchmark at its latest revision |
| `GET /api/benchmarks/{id}?revision=` | One revision with its document |
| `GET /api/benchmarks/{id}/history?limit=` | Its revisions, newest first |
| `POST /api/benchmarks/import` | Imports a document as its next revision: 201 |
| `GET /api/models?refresh=` | Every model the providers serve, marked by whether the local portfolio holds it, and when the providers were asked |
| `GET /api/models/{identifier}` | One model, by its identifier, slashes and all |
| `GET /api/local/portfolio` | The models the local portfolio authorizes, oldest first |
| `POST /api/local/portfolio` | Authorizes one model locally, from `{"identifier"}`: 201 |
| `POST /api/local/portfolio/remove` | Stops authorizing one model locally, from `{"identifier", "force"}` |
| `POST /api/workflows/check` | Every reason importing a workflow document would refuse it, saving nothing ([ADR 0007](0007-running-and-watching-workflows.md)) |
| `POST /api/workflows/readiness` | Whether each step of a workflow document could run here now, asking the providers |
| `GET /api/workflows/{id}/runs?limit=` | A workflow's kept runs, newest first |
| `GET /api/runs/{run_id}` | One kept run, with its input, its result and its steps |
| `POST /api/models/matching` | The local portfolio's models that meet `{"requirements"}`, in the order a run tries them |
| `POST /api/live/steps` | Starts trying one step of a document alone, from `{"document", "step_id", "inputs", "files", "input" \| "file"}`: 201 |
| `POST /api/live/runs` | Starts a live run of a workflow, from `{"workflow_id", "input" \| "file"}`: 201 ([ADR 0007](0007-running-and-watching-workflows.md)) |
| `GET /api/live` | Every live run the editor remembers, newest first |
| `GET /api/live/{handle}` | One live run: where it is, and how it ended |
| `GET /api/live/{handle}/events?after=` | Its events as a server-sent event stream, then its end |
| `POST /api/live/{handle}/cancel` | Asks it to stop: 202, as it stands now |
| `GET /api/remotes` | Every remote the instance names, by name, each with whether its token variable is set, never its value ([ADR 0008](0008-shipping-to-a-remote.md)) |
| `POST /api/remotes` | Names one remote, from `{"name", "url", "token_variable"}`: 201 |
| `POST /api/remotes/remove` | Forgets one name, from `{"name"}`; nothing at the remote changes |
| `POST /api/remotes/{name}/status` | How the workflows, tool versions and benchmarks named, or everything either side holds, relate to the remote's, from `{"workflows", "tools", "benchmarks"}` |
| `POST /api/remotes/{name}/push` | Pushes what is named, with what it needs; the report holds Azathoth's warnings |
| `POST /api/remotes/{name}/pull` | Pulls what is named, and restricted benchmarks too with `"include_restricted": true`; the report says what it forked and withheld |

- **Answers are `azathoth.api`'s own models,** dumped as JSON. A list or a
  history is `{"items": [...]}`, so either can gain fields without breaking
  the web app.
- **Errors keep Azathoth's codes.** `{"error": {"code", "message"}}`, with a
  status for the error's kind (ADR 0001). An id that is not a UUID, or a
  `revision` or `limit` that is not a whole number, is refused as
  `invalid_argument` (422) before Azathoth is asked, with a message that
  names it: `'abc' is not a workflow id.`, `revision must be a whole number,
  not 'two'.`
- **Importing never edits in place.** A document is sent as
  `application/json` (otherwise 415, `unsupported_media_type`), at most 10 MB
  (otherwise 413, `document_too_large`, checked from its declared length and
  again as it arrives), in UTF-8 (otherwise `invalid_document`). It becomes
  its component's next revision, and the answer is Azathoth's import,
  `{"created", "<kind>"}`: 201 when a revision was made. A document
  identical to the latest revision makes none, as Azathoth 1.4.0b1 decides
  (its ADR 0122): 200, `created` false, and that revision. A revision that
  returns to an earlier one says which, as `identical_to`.
- **Tool versions live under `/versions/`,** so that no version name, such as
  `history`, can be mistaken for another endpoint.
- **Commands name the editor's database.** `GET /api/editor` gives the
  prefix the web app puts before every command it shows, quoted for this
  computer's shell: `AZATHOTH_DATABASE='/path/ui.db' ` in POSIX shells,
  `$env:AZATHOTH_DATABASE='C:\path\ui.db'; ` in PowerShell on Windows. The
  server, which knows the platform and the path, writes it, so the web app
  never quotes anything itself.
- **The web app routes its own pages.** Any address outside `/api/` and
  `/_/` that is not a file the build made (one under `/assets/`, or a file at
  the top such as `/icon.svg`) gets the web app's page, so links into the
  editor and reloads work. Without a build, every such address says how to
  build one.

## Consequences

- The web app's types mirror `azathoth.api`'s models one to one; when core
  adds a field, the editor shows it by changing the web app alone.
- Every state-changing endpoint is a `POST` that needs this server's
  `Origin` and a JSON body, so no form on another site can submit one.
- A file name at the top of the build must have an extension, and the build
  must keep its other files under `assets/`, or the web app's routing will
  answer for them.
