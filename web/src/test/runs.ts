/**
 * Runs as the editor's server describes them: one started from the editor,
 * the events it reported, and how it ended.
 */

import type {
  ComponentDetail,
  LiveRun,
  RunDetail,
  RunEvent,
  RunResult,
  RunStepDetail,
  RunSummary,
  StepReadiness,
  WorkflowReadiness,
} from "../api/types";
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

/** The run as the workflow's list of runs shows it. */
export const RUN_SUMMARY: RunSummary = {
  run_id: RUN_RESULT.run_id,
  workflow_id: WORKFLOW.id,
  workflow_name: "summarize",
  workflow_revision: 3,
  invocation_id: null,
  succeeded: true,
  error: null,
  started_at: RUN_RESULT.started_at,
  completed_at: RUN_RESULT.completed_at,
  command: RUN_RESULT.command,
};

/** The kept run's first step: done, its text selected. */
export const SELECTED: RunStepDetail = {
  step_id: SELECT,
  status: "executed",
  attempts: 1,
  confidence: null,
  layer: 0,
  started_at: "2026-11-10T10:00:00.100Z",
  completed_at: "2026-11-10T10:00:00.400Z",
  strategy: "json_select",
  metrics: null,
  output: { value: "A ticket.", length: 9 },
  values: { text: "A ticket.", length: 9 },
  failures: [],
};

/** The run as Azathoth kept it: its first step done, its second skipped. */
export const RUN_DETAIL: RunDetail = {
  ...RUN_SUMMARY,
  has_result: true,
  result: "A short summary.",
  has_input: true,
  input: { text: "My printer is on fire." },
  resumes: 0,
  steps: [
    SELECTED,
    {
      step_id: SUMMARIZE,
      status: "skipped",
      attempts: 0,
      confidence: null,
      layer: 1,
      started_at: null,
      completed_at: null,
      strategy: null,
      metrics: null,
      output: null,
      values: {},
      failures: [],
    },
  ],
};

/** The selecting step, ready to run its tool here. */
const SELECT_READY: StepReadiness = {
  step_id: SELECT,
  kind: "tool",
  ready: true,
  models: [],
  tool_id: uuid(31),
  tool_version: "1.0.0",
  tool_implementation_id: uuid(32),
  problem: null,
};

/** The workflow could run here now: its tool here, its prompt on the large model first. */
export const READY: WorkflowReadiness = {
  ready: true,
  steps: [
    SELECT_READY,
    {
      step_id: SUMMARIZE,
      kind: "prompt",
      ready: true,
      models: ["openai/gpt-large", "openai/gpt-small"],
      tool_id: null,
      tool_version: null,
      tool_implementation_id: null,
      problem: null,
    },
  ],
};

/** The workflow could not run here now: no model in the portfolio meets its prompt's needs. */
export const NOT_READY: WorkflowReadiness = {
  ready: false,
  steps: [
    SELECT_READY,
    {
      step_id: SUMMARIZE,
      kind: "prompt",
      ready: false,
      models: [],
      tool_id: null,
      tool_version: null,
      tool_implementation_id: null,
      problem: "No model in the portfolio meets this step's needs.",
    },
  ],
};
