/**
 * Spend as the editor's server describes it: one report of two days in New
 * York, the first with two workflows' calls, one of them unpriced, the
 * second with none (ADR 0014).
 */

import type { SpendQuery } from "../api/client";
import type { SpendGroupTotals, SpendReport, SpendTotals } from "../api/types";
import { REVIEW_WORKFLOW, WORKFLOW } from "./instances";

export const NEW_YORK = "America/New_York";

/** Nothing spent. */
export const NOTHING: SpendTotals = {
  billed_usd: 0,
  estimated_usd: 0,
  calls: 0,
  unpriced_calls: 0,
};

/** The word count workflow's one billed call. */
export const COUNTED: SpendGroupTotals = {
  key: WORKFLOW.id,
  label: WORKFLOW.name,
  billed_usd: 0.25,
  estimated_usd: 0,
  calls: 1,
  unpriced_calls: 0,
};

/** The review workflow's estimated call, and its unpriced one. */
export const REVIEWED: SpendGroupTotals = {
  key: REVIEW_WORKFLOW.id,
  label: REVIEW_WORKFLOW.name,
  billed_usd: 0,
  estimated_usd: 0.5,
  calls: 2,
  unpriced_calls: 1,
};

const FIRST_DAY: SpendTotals = {
  billed_usd: 0.25,
  estimated_usd: 0.5,
  calls: 3,
  unpriced_calls: 1,
};

/** What the query below asks for. */
export const SPEND_QUERY: SpendQuery = {
  since: "2026-11-18T00:00:00-05:00",
  until: "2026-11-20T00:00:00-05:00",
  period: "day",
  group: "workflow",
  timeZone: NEW_YORK,
  workflowId: null,
};

/** Two days in New York, by workflow. */
export const SPEND_REPORT: SpendReport = {
  since: SPEND_QUERY.since,
  until: SPEND_QUERY.until,
  time_zone: NEW_YORK,
  period: "day",
  group: "workflow",
  workflow_id: null,
  periods: [
    {
      start: "2026-11-18T00:00:00-05:00",
      end: "2026-11-19T00:00:00-05:00",
      totals: FIRST_DAY,
      groups: [REVIEWED, COUNTED],
    },
    {
      start: "2026-11-19T00:00:00-05:00",
      end: "2026-11-20T00:00:00-05:00",
      totals: NOTHING,
      groups: [],
    },
  ],
  groups: [REVIEWED, COUNTED],
  totals: FIRST_DAY,
  command:
    "azathoth spend --since 2026-11-18T00:00:00-05:00 --until 2026-11-20T00:00:00-05:00 --by day --group workflow --time-zone America/New_York",
};
