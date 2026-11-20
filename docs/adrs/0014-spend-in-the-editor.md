# ADR 0014: Spend in the Editor

## Status

Accepted

## Context

Azathoth 1.5.0a5 reports what an instance spent
([ADR 0132](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0132-spend-and-reports.md)):
`instance.spend.report` counts each model call once, child runs included,
says whether each dollar was billed by its provider or estimated from a
configured price, counts unpriced calls rather than taking them for free,
and groups the calls into days, ISO weeks or months as the clock reads in a
time zone, by workflow, model, provider or source. `api.spend_csv` writes
the same report for a spreadsheet. Reading it is the `read_spend` action
of Azathoth's ADR 0127.

The editor shows what one run, one execution or one experiment cost, but
not what the instance spent over a week, on which workflow or model. A
person who wants that leaves the editor for `azathoth spend`.

## Decision

- **The editor needs Azathoth 1.5.0a5,** the first with spend in the
  service API.

- **The instance's endpoints reach the call.**

  | Endpoint | Answer |
  | --- | --- |
  | `GET /spend?since=&until=&period=&group=&time_zone=&workflow_id=` | A `SpendReport` |
  | `GET /spend.csv?...` | The same report as `api.spend_csv` writes it, as a `text/csv` download |

  `since` and `until` are required, each an ISO 8601 time with its offset,
  so the server never guesses a time zone; `period`, `group` and
  `time_zone` default as Azathoth's do. A time that is missing or says no
  offset, or a period or grouping not listed, is refused as
  `invalid_argument` before Azathoth is asked. The CSV is core's own, so
  the editor's download and `azathoth spend --output csv` are the same
  bytes.

- **The web app reads in the browser's time zone.** It is the default, as
  the computer's is the command line's, named on the page, and can be
  changed. The web app turns a preset, the last 7 days, the last 30 days,
  this month or last month, or two dates, into exact times with their
  offsets in that zone, midnight to midnight, so a range across a clock
  change is as long as it was. The last 30 days is the default.

- **Spend has a page, `/spend`, in the rail.** It shows the range, the
  period, the grouping, the time zone and an optional workflow, each kept
  in the address so a report can be bookmarked and reloaded; the totals,
  billed, estimated, calls and unpriced calls; a bar for each period,
  billed and estimated stacked in their own colours and labelled, a period
  nothing was spent in said to be so; each group's spend over the range;
  and each period's groups. The same figures are a table, for screen
  readers and for copying, so no chart library is added. Download CSV
  takes the report as it stands, and the `azathoth spend` command that
  prints it is shown beside it.

- **Billed and estimated are never added.** Every figure the editor shows
  keeps them apart, as Azathoth does. Wherever a call was unpriced, the
  page says that its cost is unknown, never free.

- **Spend has two other places.** A workflow's page has a **Spend** tab,
  `/workflows/:id/spend`, its last 30 days by model; a model's page has a
  **Spend** section, its last 30 days by workflow. Each links to `/spend`
  with the same choices filled in.

- **Spend is seen only where it may be read.** The editor asks
  `read_spend` before it shows spend anywhere. Where the answer is no, the
  rail has no Spend, a workflow has no Spend tab and a model's page no
  Spend section, and `/spend` is the editor's page for an address it does
  not have. Nothing tells a person about spend they may not read; a
  refusal is for an action a person can see and try, and a page they will
  never be allowed is clutter. On the editor's own instance, and on a core
  remote until Azathoth 1.6 asks a remote's policy, the answer is always
  yes (ADR 0009).

## Consequences

- A person sees what an instance spent, when and on what, in their own
  time zone, and takes it to a spreadsheet, without leaving the editor.
- A billed dollar and an estimated one are never mistaken for each other
  on any page, and an unpriced call is never shown as free.
- Once a team's policy decides `read_spend`, people who may not read
  spend see an editor without it, rather than one refusing them.
- What one run, execution or experiment cost is still part of reading it,
  `read_runs`, as Azathoth decides; only the instance's spend over time is
  `read_spend`.
