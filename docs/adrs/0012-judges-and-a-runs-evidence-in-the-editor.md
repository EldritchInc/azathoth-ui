# ADR 0012: Judges and a Run's Evidence in the Editor

## Status

Accepted; amended for benchmarks, on Azathoth 1.5.0a3

## Context

Azathoth 1.5.0a2 brings to the service API what the command line does with
judges and with a run's evidence
([ADR 0129](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0129-judges-and-a-runs-evidence-through-the-service-api.md)):

- `instance.judges` keeps the rotation of models that judge semantic
  benchmark cases;
- `runs.record_feedback` and `runs.feedback` take and read a person's good
  or bad judgment of a run, and every run carries its latest;
- `runs.annotations` and `invocations.annotations` export the citations a
  run's steps verified, as W3C Web Annotations;
- `runs.children` lists the runs a run's steps started;
- `runs.interrupted` finds a workflow's runs that started and never
  finished, and `runs.resume` continues one from its journal.

The editor shows none of it. It cannot keep the judges, so a benchmark with
semantic cases, which the next phase builds, could never be judged from it.
A run's page shows how it ended, but not whether a person thought it right,
what it cited, or what it started. A run that stopped is only an error
message on its page, naming a command to type.

Every page here is built to [ADR 0009](0009-one-editor-any-instance.md),
so that in Azathoth 1.6 the same pages act on a remote.

## Decision

- **The editor needs Azathoth 1.5.0a2,** the first with these calls in
  the service API.

- **The instance's endpoints reach each call.**

  | Endpoint | Answer |
  | --- | --- |
  | `GET /judges` | The rotation, in the order judges are tried |
  | `POST /judges` | Adds one judge, from `{"identifier"}`: 201 |
  | `POST /judges/remove` | Removes one judge, from `{"identifier"}` |
  | `GET /runs/{id}/feedback` | Every judgment of a run, newest first |
  | `POST /runs/{id}/feedback` | Records one, from `{"disposition", "reason", "corrected_output"}`, the last two optional: 201 |
  | `GET /runs/{id}/annotations` | Its verified citations, as Web Annotations |
  | `GET /invocations/{id}/annotations` | Its run's |
  | `GET /runs/{id}/children` | The runs its steps started, oldest first |
  | `GET /workflows/{id}/interrupted?limit=` | Its runs that started and never finished, newest first |
  | `POST /live/runs/{id}/resume` | Resumes an interrupted run of `{"workflow_id"}` as a live run: 201 |

  A resumed run is a live run as any other (ADR 0007), whose description
  names the run it resumes as `resumes_run_id`. The workflow is named
  because only `runs.interrupted` says a run is interrupted, and it lists a
  workflow's: a run that is not among them is refused before anything runs,
  as 409 when it finished, and 404 otherwise. Azathoth's new refusals keep their codes:
  `run_not_resumable` is 409, and `content_unavailable` 502, since the
  content store failed the editor, not the person.

- **The judges have a page of their own.** `/judges`, in the rail, lists
  the rotation in order, each judge with its position, and marks one the
  portfolio no longer authorizes, which is kept but never asked to judge.
  Add judge offers the authorized models that are not judges yet, and
  Remove asks first. Both are the `manage_judges` action.

- **A run's page takes and shows a person's judgment.** A Judgment section
  shows the latest disposition and every judgment, newest first, with its
  reason and corrected output. Good records a good judgment; Bad asks for a
  reason, refused before it is sent when blank, and offers a corrected
  output as JSON. Both are the `annotate_run` action. Each run in a
  workflow's run list shows its latest judgment.

- **A run's page shows its citations and its children.** A Citations
  section shows each verified citation's quote and where it was found, and
  how many checks did not verify and were left out. A Child runs section
  lists each run a step started, the step and attempt that started it, and
  how it ended, linking to its run once it finished.

- **A run that stopped can be found and resumed.** A workflow's Runs tab
  lists its interrupted runs above its finished ones, each with when it
  started, how often it was resumed, and Resume, the `run_workflow`
  action, which opens it as a live run. A run that executes an invocation
  is resumed as its invocation (ADR 0010), the `invoke` action, as that
  invocation's own page resumes it. A resumed live run says so, naming the
  run it picks up. A run's page, asked for a run
  that has not finished, says so in Azathoth's words; Azathoth names no
  workflow for such a run, so Resume is offered from the workflow's Runs
  tab, where the run is listed.

- **Restricted runs stay guarded.** A restricted run's corrected outputs
  and citation quotes are behind the same "This is restricted data" as its
  input and result (ADR 0011).

## Consequences

- The editor keeps the judges a benchmark's semantic cases need, before
  the next phase builds benchmarks in it.
- A person's judgment of a run is recorded where they read the run, and
  the corrected outputs it records are what a case is made from later.
- A run stopped by a crash or a closed editor is one click from finishing,
  from its workflow's Runs tab.

## Alternatives Considered

- **Judges on the Models page.** The rotation is ordered and judges
  benchmarks, not workflows; mixing it into the portfolio's list would
  hide its order, and a model is a judge and in the portfolio for
  different reasons.
- **Editing a judgment.** Azathoth keeps judgments immutable (its ADR
  0068); a new judgment is a new record, and the editor shows them all, so
  why a run was first judged as it was is never lost.
- **A separate page of interrupted runs.** A stopped run belongs to its
  workflow, beside the runs that finished; a page of its own would be one
  more place to look.

## Amendment: Benchmarks

### Context

Azathoth 1.5.0a3 brings benchmarks to the service API
([ADR 0130](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0130-benchmarks-through-the-service-api.md)):
`instance.benchmarks` reads a benchmark's cases, creates a benchmark,
adds, edits and removes its cases, turns a run into a case, runs and
compares workflows against it as it runs, and reads what it saved.

The editor shows a benchmark's document and lists its cases, and nothing
more. The judges this decision keeps judge a benchmark's semantic cases,
and the corrected outputs a person records on a run are what a case is
made from, but neither can reach a benchmark from the editor.

### Decision

- **The editor needs Azathoth 1.5.0a3,** the first with benchmarks in
  the service API.

- **The instance's endpoints reach each call.**

  | Endpoint | Answer |
  | --- | --- |
  | `POST /benchmarks` | Creates one, from `{"name", "description", "version"}`, the version optional: 201 |
  | `GET /benchmarks/{id}/cases?revision=` | A revision's cases, in order, the latest by default |
  | `GET /benchmarks/{id}/cases/{case_id}?revision=` | One case, with its input and expected value |
  | `POST /benchmarks/{id}/cases` | Adds one, from exactly one of `"run_id"`, `"input"` and `"file"`, with `"comparison"`, and `"expected"`, `"description"`, `"citations"` and `"sensitivity"` optional: 201 |
  | `POST /benchmarks/{id}/cases/{case_id}` | Edits one, from any of `"comparison"`, `"expected"`, `"description"`, `"citations"` and `"sensitivity"` |
  | `POST /benchmarks/{id}/cases/{case_id}/remove` | Removes one |
  | `GET /benchmarks/{id}/executions?limit=` | Its saved runs and comparisons, newest first |
  | `GET /benchmark-executions/{id}` | One, with every workflow and case |
  | `POST /live/benchmarks` | Runs a workflow against one, from `{"benchmark_id", "workflow_id"}`, as a live run: 201 |
  | `POST /live/comparisons` | Compares workflows against one, from `{"benchmark_id", "workflow_ids", "target_latency_seconds", "target_cost_usd"}`, as a live run: 201 |

  A key that is left out and a key that is `null` mean different things,
  as they do to Azathoth. Adding a case without `"expected"` expects the
  run's latest correction, and `"expected": null` expects null. Editing a
  case leaves what is left out as it was, and `"citations": null` stops
  requiring citations. A file is sent as a run's is (ADR 0007): a PDF or an
  image is kept as content, and text or JSON as the value it reads as.
  Every change answers with the case and the revision it saved.

- **A benchmark runs live.** A benchmark run and a comparison are live runs
  (ADR 0007), of kind `benchmark` and `comparison`, naming their
  `benchmark_id`. Their events are Azathoth's `case_started` and
  `case_finished`; their result is the execution Azathoth saved. Cancel
  stops one between cases: the case runs that finished are kept, and no
  execution is recorded. Azathoth's new refusal keeps its code:
  `judge_unavailable` is 409, a conflict with the judge rotation.

- **A benchmark's page has tabs,** as a workflow's does: Cases, its
  document, and Executions.
  - **Cases** lists each case with where it came from (a run, a file or
    JSON), its comparison and its label. Add case takes JSON or a file, a
    comparison and an expected value. New benchmark, on the Benchmarks
    list, takes a name and a description.
  - **A case's page** shows its input and what it expects. Edit changes
    its comparison, expected value, description, citations or label;
    Remove asks first, naming the instance. A label can only be raised.
  - **Executions** lists each saved run and comparison, newest first,
    with the revision it ran and how many cases passed. An execution's
    page, `/benchmark-executions/:id`, shows its scoring targets, its
    workflows ranked with their scorecards, and each case's result,
    linking to its run.
  - **Run** and **Compare** start a benchmark run, with a workflow, or a
    comparison, with workflows and latency and cost targets, and open it
    as a live run. Its page shows each case as it starts and finishes, how
    many have passed, Cancel, and, once it ends, a link to its execution.

- **A run becomes a case from its page.** Add to a benchmark, beside the
  Judgment section, offers the instance's benchmarks and a comparison, and
  says whether the run's latest correction will be expected or asks for a
  value. The case keeps the run's label.

- **Every change names its action.** Creating a benchmark and adding,
  editing or removing a case is `edit_benchmark`; running and comparing is
  `run_benchmark`. A restricted case's input and expected value, and a
  restricted execution's results, stay hidden until shown, the
  `read_restricted` action (ADR 0011).

### Consequences

- A person builds, grows and runs a benchmark without leaving the editor,
  and a run judged bad becomes a case where it was judged.
- A benchmark runs as visibly as a workflow does, one case at a time, and
  can be stopped without leaving a half-finished result behind.
- The pages that optimize next build on benchmarks the editor already
  makes and runs.
