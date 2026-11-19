# ADR 0012: Judges and a Run's Evidence in the Editor

## Status

Accepted

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
