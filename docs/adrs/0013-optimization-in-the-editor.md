# ADR 0013: Optimization in the Editor

## Status

Accepted

## Context

Azathoth 1.5.0a4 brings optimization to the service API
([ADR 0131](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0131-optimization-through-the-service-api.md)):
`instance.optimization` optimizes a workflow against a benchmark as it
runs, telling each generation and candidate and stopping between
candidates when cancelled; `instance.experiments` reads what it recorded,
compares an experiment's winner with what promoting it would replace, says
what that would save and projects it over production's last 30 days, and
says whether the winner can still be promoted.

The editor promotes a workflow's latest revision, and can promote an
experiment's winner by its ID (ADR 0010), but cannot start the optimization
that finds one, watch it, read an experiment, or see what promoting would
change. A person deciding whether to promote has to leave the editor for
`workflow optimize`, `experiment show` and `experiment compare`.

## Decision

- **The editor needs Azathoth 1.5.0a4,** the first with optimization in
  the service API.

- **The instance's endpoints reach each call.**

  | Endpoint | Answer |
  | --- | --- |
  | `GET /workflows/{id}/experiments?limit=` | A workflow's experiments, newest first |
  | `GET /experiments/{id}` | One experiment, its candidates ranked, each with the model each step ran on |
  | `GET /experiments/{id}/compare` | Its winner beside its baseline, with what each run cost and took, the saving per run and the 30-day projection |
  | `GET /experiments/{id}/promotable` | Whether its winner can still be promoted, and why not; nothing is saved |
  | `POST /live/optimizations` | Optimizes `{"workflow_id", "benchmark_id", "target_latency_seconds", "target_cost_usd", "generations"}` as a live run: 201 |

  Promoting the winner is `POST /workflows/{id}/promote` with
  `{"experiment_id"}`, as it already is (ADR 0010). An unknown workflow or
  benchmark is refused, 404, before an optimization starts; what Azathoth
  checks before any candidate runs ends the live run, refused.

- **Optimization runs live.** An optimization is a live run (ADR 0007) of
  kind `optimization`, naming its `benchmark_id`. Its events are
  Azathoth's `generation_started`, `candidate_finished` and
  `generation_finished`; its result is the session's summary, naming the
  winning experiment. Cancel stops it between candidates: every experiment
  it finished is kept, and nothing is reported as its result. It counts
  against the editor's live-run limit as any live run does.

- **A workflow's page gains two places.**
  - **Optimize**, beside Run, opens `/workflows/:id/optimize`:
    a benchmark, latency and cost targets, and generations, 1 by default,
    any whole number from 1 as the command line takes. Its live page shows
    each generation as it starts, each candidate's passes and score as it
    finishes, and each generation's winner and how many candidates it
    proposes; once it ends, it links to the winning experiment.
  - **Experiments**, a tab at `/workflows/:id/experiments`, lists each
    experiment, newest first: when it was recorded, the benchmark and the
    revision it ran, its candidates and cases, its winner's score and its
    label.

- **An experiment has a page,** `/experiments/:id`, with three sections.
  - **Candidates:** each ranked, with each step's model, its scorecard,
    its passes and its judge totals, and each case linking to its run.
  - **Compare:** what the winner is compared against, production or the
    configured candidate, or why nothing is; each step whose model
    changes, baseline before winner; each case on both sides; each side's
    cost and time per run; what the winner saves per run, a negative saving
    said as a cost; and the projection over production's last 30 days,
    always labelled as a projection, never as a measurement.
  - **Promote the winner:** the editor asks `promotable` first. A winner
    that can no longer be rebuilt says why and cannot be promoted. One that
    can is promoted only once confirmed, naming the instance and the model
    each prompt step will be pinned to, and then links to the workflow's
    Production tab.

- **Every change names its action.** Optimizing is `optimize`; promoting
  the winner is `promote`. A restricted experiment's results, its
  candidates' cases and the comparison of them, stay hidden until shown,
  the `read_restricted` action (ADR 0011).

## Consequences

- A person optimizes a workflow, watches it, reads every experiment and
  promotes the winner without leaving the editor.
- What promoting would change and save is in front of the person deciding,
  in measured dollars and seconds, with the projection said to be one.
- A winner that can no longer be promoted says so before anyone tries.
- The spend and report pages that follow build on the costs the editor
  already shows.
