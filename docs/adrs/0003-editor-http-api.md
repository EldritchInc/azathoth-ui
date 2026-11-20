# ADR 0003: Editor HTTP API

## Status

Accepted; amended by [ADR 0009](0009-one-editor-any-instance.md), which builds
every instance endpoint once, for an instance.

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

The endpoints are of two kinds ([ADR 0009](0009-one-editor-any-instance.md)).
The editor's own describe it and its remotes, and are always at `/api`:
`/api/editor` and `/api/remotes...`. Every other endpoint acts on an
instance, and is built once, for one instance, below a prefix: `/api` for
the editor's own, and from Azathoth 1.6 `/api/remotes/{name}` for a remote.
The table names each at the editor's own instance.

| Endpoint | Answer |
| --- | --- |
| `GET /api/instance` | The instance, as `describe()` |
| `GET /api/commands` | The instance's name, and what goes before an `azathoth` command so that it acts on that instance, quoted for this computer's shell: `{"instance", "prefix"}` ([ADR 0009](0009-one-editor-any-instance.md)) |
| `GET /api/editor` | The editor's version, its shell, and the providers it was opened with, by name |
| `GET /api/workflows` | Every workflow at its latest revision |
| `GET /api/workflows/{id}?revision=` | One revision with its document, the latest by default |
| `GET /api/workflows/{id}/history?limit=` | Its revisions, newest first |
| `GET /api/workflows/{id}/export?revision=` | A revision exactly as `azathoth workflow export` prints it, as a download named as Azathoth suggests ([ADR 0015](0015-the-catalog-in-the-editor.md)) |
| `GET /api/workflows/{id}/diff?before=&after=` | What differs between two revisions, as Azathoth compares them |
| `POST /api/workflows/import` | Imports a document as its next revision: 201 |
| `GET /api/tools` | Every tool version at its latest revision |
| `GET /api/tools/{id}/versions` | Each version of a tool at its latest revision |
| `GET /api/tools/{id}/versions/{version}?revision=` | One revision of one exact version |
| `GET /api/tools/{id}/versions/{version}/export?revision=` | One version's revision as `azathoth tool export` prints it, as a download |
| `GET /api/tools/{id}/versions/{version}/diff?before=&after=` | What differs between two revisions of one exact version |
| `GET /api/tools/{id}/history?version=&limit=` | Its revisions, of one version when named |
| `POST /api/tools/import` | Imports a document as its version's next revision: 201 |
| `POST /api/tools/from-mcp` | The document of a tool an MCP server serves, from `{"tool"}` and exactly one of `"url"` and `"command"`, with `"authorization"`, `"grants"` and `"timeout_seconds"` optional; nothing is imported ([ADR 0015](0015-the-catalog-in-the-editor.md)) |
| `GET /api/tools/{id}/usage` | Where a tool, in any of its versions, is configured, in production and in runs |
| `GET /api/model-usage?identifier=` | Where one exact model is configured, in production and in runs |
| `GET /api/goals` | Every goal, in import order |
| `GET /api/goals/{id}` | One goal, with its success criteria, constraints and document |
| `POST /api/goals/import` | Imports a goal document: 201, or 200 for the goal already kept, unchanged |
| `GET /api/benchmarks` | Every benchmark at its latest revision |
| `GET /api/benchmarks/{id}?revision=` | One revision with its document |
| `GET /api/benchmarks/{id}/history?limit=` | Its revisions, newest first |
| `GET /api/benchmarks/{id}/export?revision=` | A revision as `azathoth benchmark export` prints it, as a download |
| `GET /api/benchmarks/{id}/diff?before=&after=` | What differs between two revisions, a restricted case's values withheld where they may not be read |
| `POST /api/benchmarks/import` | Imports a document as its next revision: 201 |
| `POST /api/benchmarks` | Creates an empty benchmark, from `{"name", "description", "version"}`, the version optional: 201 ([ADR 0012](0012-judges-and-a-runs-evidence-in-the-editor.md)) |
| `GET /api/benchmarks/{id}/cases?revision=` | A revision's cases, in order, the latest by default |
| `GET /api/benchmarks/{id}/cases/{case_id}?revision=` | One case, with its input, what it expects and what its run must cite |
| `POST /api/benchmarks/{id}/cases` | Adds a case to its next revision, from exactly one of `"run_id"`, `"input"` and `"file"`, with `"comparison"`, and `"expected"`, `"description"`, `"citations"` and `"sensitivity"` optional: 201 |
| `POST /api/benchmarks/{id}/cases/{case_id}` | Edits a case into its next revision, from any of `"comparison"`, `"expected"`, `"description"`, `"citations"` and `"sensitivity"` |
| `POST /api/benchmarks/{id}/cases/{case_id}/remove` | Leaves a case out of its next revision |
| `GET /api/benchmarks/{id}/executions?limit=` | Its saved runs and comparisons, newest first |
| `GET /api/benchmark-executions/{id}` | One execution, with every workflow, its scorecard, and each case's result |
| `GET /api/workflows/{id}/experiments?limit=` | A workflow's experiments, newest first ([ADR 0013](0013-optimization-in-the-editor.md)) |
| `GET /api/experiments/{id}` | One experiment, its candidates ranked, each with the model each step ran on |
| `GET /api/experiments/{id}/compare` | Its winner beside its baseline, with what each run cost and took, the saving per run and the 30-day projection |
| `GET /api/experiments/{id}/promotable` | Whether its winner can still be promoted, and why not, asking the providers; nothing is saved |
| `GET /api/spend?since=&until=&period=&group=&time_zone=&workflow_id=` | What the instance spent from `since` up to `until`, period by period, billed and estimated apart ([ADR 0014](0014-spend-in-the-editor.md)) |
| `GET /api/spend.csv?...` | The same report as Azathoth writes it as CSV, as a `text/csv` download named for its range |
| `GET /api/models?refresh=` | Every model the providers serve, marked by whether the local portfolio holds it, and when the providers were asked |
| `GET /api/models/{identifier}` | One model, by its identifier, slashes and all |
| `GET /api/local/portfolio` | The models the local portfolio authorizes, oldest first |
| `POST /api/local/portfolio` | Authorizes one model locally, from `{"identifier"}`: 201 |
| `POST /api/local/portfolio/remove` | Stops authorizing one model locally, from `{"identifier", "force"}` |
| `GET /api/judges` | The judge rotation, in the order judges are tried, each with its position and whether the portfolio still authorizes it ([ADR 0012](0012-judges-and-a-runs-evidence-in-the-editor.md)) |
| `POST /api/judges` | Appends one served model the portfolio authorizes to the rotation, from `{"identifier"}`: 201 |
| `POST /api/judges/remove` | Takes one model out of the rotation, from `{"identifier"}`; those after it move up |
| `POST /api/local/portfolio/policy` | Declares what one authorized model's provider does with data, from `{"identifier", "retains_data", "trains_on_data"}`, each `yes`, `no` or `unknown`, and answers with its entry, who declared it and when ([ADR 0011](0011-sensitivity-and-model-policy-in-the-editor.md)) |
| `POST /api/workflows/check` | Every reason importing a workflow document would refuse it, saving nothing ([ADR 0007](0007-running-and-watching-workflows.md)) |
| `POST /api/workflows/readiness?sensitivity=` | Whether each step of a workflow document could run here now, asking the providers; with a label, for input so labelled |
| `GET /api/workflows/{id}/runs?limit=` | A workflow's kept runs, newest first |
| `GET /api/runs/{run_id}` | One kept run, with its input, its result, its steps and its latest judgment |
| `GET /api/runs/{run_id}/feedback` | Every judgment of a run, newest first ([ADR 0012](0012-judges-and-a-runs-evidence-in-the-editor.md)) |
| `POST /api/runs/{run_id}/feedback` | Records one judgment, from `{"disposition", "reason", "corrected_output"}`, the last two optional; any other field is refused: 201 |
| `GET /api/runs/{run_id}/annotations` | A run's verified citations, as Azathoth's Web Annotation collection |
| `GET /api/runs/{run_id}/children` | The runs a run's steps started, oldest first, each with how it ended |
| `GET /api/workflows/{id}/interrupted?limit=` | A workflow's runs that started and never finished, newest first, each with the command that resumes it |
| `GET /api/workflows/{id}/production` | `{"production"}`: what production runs now, or `null` ([ADR 0010](0010-production-in-the-editor.md)) |
| `GET /api/workflows/{id}/production/revisions?limit=` | Its production revisions, newest first, the active one marked |
| `POST /api/workflows/{id}/promote` | Promotes its latest revision, or an experiment's winner from `{"experiment_id"}`: 201 |
| `POST /api/workflows/{id}/rollback` | Restores an earlier production revision, the previous one or `{"to"}`: 201 |
| `GET /api/workflows/{id}/invocations?limit=` | Its invocations, newest first |
| `GET /api/invocations/{id}` | One invocation, with its input, its outcome and its run |
| `GET /api/invocations/{id}/annotations` | Its run's verified citations |
| `POST /api/models/matching` | The local portfolio's models that meet `{"requirements", "sensitivity"}`, in the order a run tries them; with a label, only those that may receive input so labelled |
| `POST /api/live/steps` | Starts trying one step of a document alone, from `{"document", "step_id", "inputs", "files", "input" \| "file", "sensitivity"}`: 201 |
| `POST /api/live/runs` | Starts a live run of a workflow, from `{"workflow_id", "input" \| "file", "sensitivity"}`: 201 ([ADR 0007](0007-running-and-watching-workflows.md)) |
| `POST /api/live/invocations` | Invokes a workflow in production as a live run, from `{"workflow_id", "input" \| "file", "idempotency_key", "sensitivity"}`, the key and the label optional: 201 ([ADR 0010](0010-production-in-the-editor.md)) |
| `POST /api/live/invocations/{id}/resume` | Resumes an incomplete invocation as a live run: 201, or 409 once it has completed |
| `POST /api/live/benchmarks` | Runs a workflow against a benchmark as a live run, from `{"benchmark_id", "workflow_id"}`: 201, or 404 before anything starts for an unknown benchmark or workflow ([ADR 0012](0012-judges-and-a-runs-evidence-in-the-editor.md)) |
| `POST /api/live/comparisons` | Compares workflows against a benchmark as a live run, from `{"benchmark_id", "workflow_ids", "target_latency_seconds", "target_cost_usd"}`, the targets numbers: 201, or 404 before anything starts |
| `POST /api/live/optimizations` | Optimizes a workflow against a benchmark as a live run, from `{"workflow_id", "benchmark_id", "target_latency_seconds", "target_cost_usd", "generations"}`, the generations a whole number, 1 when left out: 201, or 404 before anything starts ([ADR 0013](0013-optimization-in-the-editor.md)) |
| `POST /api/live/runs/{run_id}/resume` | Resumes an interrupted run of `{"workflow_id"}` from its journal as a live run: 201; 409 `run_not_resumable` for a finished run or an invocation's, 404 for any other the workflow does not list as interrupted |
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
- **A label is optional, and only Azathoth's.** Every start, readiness and
  match takes a `sensitivity` of `public`, `internal` or `restricted`, or
  none; any other value is refused as `invalid_argument` (422), before
  Azathoth is asked, and a run given a label but no input is refused with
  Azathoth's own message. A live run describes the label it was given, or
  `null` ([ADR 0011](0011-sensitivity-and-model-policy-in-the-editor.md)).
- **A resume names what it resumes.** A live run describes the interrupted
  run it picks up as `resumes_run_id`, or `null`. A content store that fails
  as citations are exported is `content_unavailable`, 502, since it failed
  the editor, not the person ([ADR 0012](0012-judges-and-a-runs-evidence-in-the-editor.md)).
- **Left out is not `null`.** Adding a case without `"expected"` expects
  its run's latest correction, and `"expected": null` expects null;
  editing a case leaves what is left out as it was, and `"citations": null`
  stops requiring citations, as Azathoth decides. Every change to a case
  answers with the case and the benchmark's revision that holds it. A
  benchmark run or a comparison is a live run of kind `benchmark` or
  `comparison` that names its `benchmark_id`; its events are Azathoth's
  `case_started` and `case_finished`, its result the execution it saved,
  and `judge_unavailable` is 409 ([ADR 0012](0012-judges-and-a-runs-evidence-in-the-editor.md)).
- **An optimization is a live run too.** It is of kind `optimization` and
  names its `benchmark_id`; its events are Azathoth's `generation_started`,
  `candidate_finished` and `generation_finished`, and its result the
  session's summary, naming the winning experiment. Cancelled, it stops
  between candidates and keeps every experiment it finished. Promoting a
  winner is production's own `promote`, given `{"experiment_id"}`
  ([ADR 0013](0013-optimization-in-the-editor.md)).
- **Spend names its range exactly.** `since` and `until` are required, each
  an ISO 8601 time with its offset, so the server never guesses a time
  zone; the web app reads them in the browser's. A time that is missing or
  says no offset, a `period` other than `day`, `week` or `month`, a
  `group` other than `workflow`, `model`, `provider` or `source`, or a
  `workflow_id` that is not a UUID is `invalid_argument` (422) before
  Azathoth is asked; `time_zone` is UTC unless named
  ([ADR 0014](0014-spend-in-the-editor.md)).
- **Tool versions live under `/versions/`,** so that no version name, such as
  `history`, can be mistaken for another endpoint.
- **An export is Azathoth's own bytes.** It answers `application/json`
  with the export's text exactly, and a `Content-Disposition` naming the
  file as Azathoth suggests, so the editor's download and the command
  line's `export` are the same file. A comparison names both revisions
  with `before` and `after`, each required and a revision number from 1,
  or `invalid_argument` (422) before Azathoth is asked; it is `diff`, since
  a benchmark's `/compare` compares workflows on it
  ([ADR 0015](0015-the-catalog-in-the-editor.md)).
- **A model's usage is asked by query,** since its identifier holds
  slashes and `/models/{identifier}` takes the rest of the path.
- **Making a tool from an MCP server imports nothing.** Its body is
  checked before Azathoth is asked: `tool` is required text, `url` and
  `authorization` text, `command` and `grants` lists of text, and
  `timeout_seconds` a number above 0; naming the server both ways or
  neither is Azathoth's own refusal. A server that cannot be reached or
  listed is `mcp_unavailable` (502), the instance unable to use it.
- **Commands name the editor's database.** `GET /api/commands` gives the
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
