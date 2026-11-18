# ADR 0010: Production in the Editor

## Status

Accepted

## Context

The editor builds a workflow, runs it and ships it, but cannot put it into
production, take it out again, or show what production did with it. The
command line does all of that: `workflow promote`, `workflow rollback`,
`workflow production`, `workflow revisions`, `workflow invoke`, `workflow
invocations`, `invocation show` and `invocation resume`. Azathoth 1.5.0a1
brings each to the service API, as `instance.production`,
`runs.invoke` and `instance.invocations`, and records who made each
production revision and what a rollback restored
([ADR 0128](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0128-production-through-the-service-api.md)).

Every page added here is built to [ADR 0009](0009-one-editor-any-instance.md):
its endpoints in `instance_routes`, its calls and links through the
instance scope, and each button naming its action, so that in Azathoth 1.6
the same pages show a remote's production.

A workflow's page already shows its revisions and its runs, one under the
other. Production is a third view of the same workflow, and the longest.

## Decision

- **The editor needs Azathoth 1.5.0a1,** the first with production in the
  service API.

- **A workflow's page has tabs, each its own route.** Revisions at
  `/workflows/:id`, so every existing link still lands where it did; Runs
  at `/workflows/:id/runs`; Production at `/workflows/:id/production`. The
  three routes render the same workflow page, each naming its tab, so the
  page draws the header and the tab bar once and only what is below them
  changes. The tabs are instance links, so each is marked current
  by its address, and under a remote's pages each is that remote's.
  `?revision=` belongs to the Revisions tab alone. Editing, running and
  invoking stay full pages of their own: `/edit`, `/run` and `/invoke`.

- **Production is read and changed through the instance's endpoints.**

  | Endpoint | Answer |
  | --- | --- |
  | `GET /workflows/{id}/production` | `{"production": ProductionState \| null}`: what production runs now, or nothing |
  | `GET /workflows/{id}/production/revisions?limit=` | Its production revisions, newest first, the active one marked |
  | `POST /workflows/{id}/promote` | Promotes its latest revision, or an experiment's winner from `{"experiment_id"}`: 201 |
  | `POST /workflows/{id}/rollback` | Restores an earlier production revision, the previous one or `{"to"}`: 201 |
  | `GET /workflows/{id}/invocations?limit=` | Its invocations, newest first |
  | `GET /invocations/{id}` | One invocation, with its input, outcome and run |
  | `POST /live/invocations` | Invokes it in production, as a live run: 201 |
  | `POST /live/invocations/{id}/resume` | Resumes an incomplete invocation, as a live run: 201 |

  A workflow with nothing in production is not an error: its production is
  `null`. Azathoth's new refusals keep their codes, with the status of
  their kind: `nothing_to_roll_back_to`, `model_not_authorized` and
  `candidate_unavailable` are 409, and `workflow_result_missing` is 422.

- **Promoting and rolling back ask first, and say where.** Each is the
  `promote` action. Its confirm names the instance it changes, and says
  what goes into production: the workflow's latest revision, or the
  production revision a rollback restores, with the models each step will
  run on. Promotion and rollback answer with the revision they saved, and
  the tab shows it at once.

- **The Production tab shows what runs, how it got there, and what it
  did.** What production runs now: the workflow revision, who promoted or
  rolled back and when, and each prompt step's model and approved
  substitutes. Then every production revision, newest first, the active
  one marked, each with its author and what it restored, and each earlier
  one with "Roll back to this". Then the workflow's invocations, newest
  first, each with its outcome, its caller, its sensitivity label and when
  it was made, linking to its own page.

- **A refusal says what to do.** Each shows Azathoth's message. A
  rollback refused because a step's model is no longer authorized links to
  that model's page, where it can be authorized again.

- **Invoking is a live run through production.** `/workflows/:id/invoke`
  takes text, JSON or a file, as running does, and an idempotency key if
  one is given; Azathoth makes one otherwise. It is the `invoke` action.
  The invocation runs in the editor's server as a live run does, its
  events stream to the same live-run page, and its end carries Azathoth's
  `InvocationOutcome`. Its caller metadata is
  `{"client": "azathoth-ui"}`, so production's own list tells the
  editor's invocations from an agent's or a job's.

- **An invocation has a page of its own.** `/invocations/:id` shows what
  it was given, its idempotency key, and how it ended: its result, or its
  failure's code and message. Its run links to the run's page once it has
  one; until then it says how often it was resumed. An incomplete
  invocation can be resumed from its page, the `invoke` action, as a live
  run.

## Consequences

- The editor does everything the command line does with production, on
  its own instance, and in 1.6 on a remote with nothing rebuilt.
- A workflow's page splits into tabs, and the Runs tab moves to its own
  address; links to `/workflows/:id` still open the workflow, on its
  revisions.
- The editor's invocations are recorded as the editor's, under keys it
  shows, so the same invocation given again replays rather than runs.
- An invocation started from the editor runs on the editor's server, so
  closing the editor stops it; its journal keeps it, and its page resumes
  it.

## Alternatives Considered

- **A tab in the address's query, `?tab=production`.** One route, and an
  unknown tab would fall back quietly, but a navigation link marks itself
  current by its path alone, `?tab=` would share the query with
  `?revision=`, which only the Revisions tab uses, and the workflow's other
  pages, `/edit` and `/run`, are already paths.
- **Invoking without streaming.** Waiting for the outcome alone would be
  simpler, and would show nothing of a slow invocation while it runs;
  running it as a live run shows it as a run is shown.
- **Promoting without confirming.** Promotion changes what every caller of
  the workflow gets; a confirm that names the instance costs one click.
