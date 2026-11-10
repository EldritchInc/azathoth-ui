/**
 * Runs as the editor's server describes them: one started from the editor,
 * the events it reported, and how it ended.
 */

import type { ComponentDetail, LiveRun, RunEvent, RunResult } from "../api/types";
import { uuid, VALID_DOCUMENT, WORKFLOW_DETAIL } from "./documents";
import { WORKFLOW } from "./instances";

/** The step that selects a ticket's text. */
export const SELECT = uuid(11);

/** The step that summarizes it. */
export const SUMMARIZE = uuid(12);

/** The workflow run, at its latest revision: the summarize ticket document. */
export const RUN_WORKFLOW: ComponentDetail = { ...WORKFLOW_DETAIL, document: VALID_DOCUMENT };

/** A run that has just started. */
export const LIVE_RUN: LiveRun = {
  handle: "h4ndle",
  kind: "run",
  workflow_id: WORKFLOW.id,
  step_id: null,
  state: "running",
  started_at: "2026-11-10T10:00:00Z",
  finished_at: null,
  event_count: 0,
  result: null,
  error: null,
};

/** How the run ended. */
export const RUN_RESULT: RunResult = {
  run_id: "b1000000-0000-4000-8000-000000000001",
  workflow_id: WORKFLOW.id,
  workflow_revision: 3,
  succeeded: true,
  has_result: true,
  result: "A short summary.",
  error: null,
  warnings: [],
  started_at: "2026-11-10T10:00:00Z",
  completed_at: "2026-11-10T10:00:02.500Z",
  command: "azathoth run show b1000000-0000-4000-8000-000000000001",
};

/** The events of a run whose first step finished, before its second started. */
export const RUN_EVENTS: readonly RunEvent[] = [
  { type: "run_started", workflow_id: WORKFLOW.id },
  { type: "step_started", step_id: SELECT, layer: 0, message: null },
  {
    type: "step_finished",
    step_id: SELECT,
    layer: 0,
    status: "executed",
    failure: null,
    confidence: null,
  },
  { type: "context_changed", step_id: SELECT, values: { text: "A ticket.", length: 9 } },
  { type: "run_finished", run_id: RUN_RESULT.run_id, succeeded: true },
];

/** The run once it has finished. */
export const FINISHED_RUN: LiveRun = {
  ...LIVE_RUN,
  state: "finished",
  finished_at: "2026-11-10T10:00:02.500Z",
  event_count: RUN_EVENTS.length,
  result: { ...RUN_RESULT },
};
