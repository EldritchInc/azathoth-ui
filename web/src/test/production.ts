/**
 * A workflow's production as the editor's server describes it: what runs,
 * the revisions that made it run, and its invocations (ADR 0010).
 */

import type {
  InvocationDetail,
  InvocationOutcome,
  InvocationSummary,
  LiveRun,
  ProductionRevisionSummary,
  ProductionState,
} from "../api/types";
import { WORKFLOW } from "./instances";
import { LIVE_RUN, SUMMARIZE } from "./runs";

/** The models production runs the summarize step on. */
export const STEP_MODELS = {
  step_id: SUMMARIZE,
  primary: "openrouter/acme/large",
  substitutes: ["openrouter/acme/small:free"],
} as const;

/** The first promotion, by nobody known: it was made before 1.5. */
export const FIRST_PROMOTION: ProductionRevisionSummary = {
  revision_id: "e1000000-0000-4000-8000-000000000001",
  workflow_id: WORKFLOW.id,
  workflow_revision: 1,
  created_at: "2026-11-15T09:00:00Z",
  author: null,
  restores: null,
  active: false,
  steps: [STEP_MODELS],
};

/** The second promotion, by Eris, of revision 2. */
export const SECOND_PROMOTION: ProductionRevisionSummary = {
  ...FIRST_PROMOTION,
  revision_id: "e1000000-0000-4000-8000-000000000002",
  workflow_revision: 2,
  created_at: "2026-11-16T09:00:00Z",
  author: { name: "Eris Discordia", email: "eris@example.com" },
};

/** A rollback, by Eris, to the first promotion: what runs now. */
export const ROLLBACK: ProductionRevisionSummary = {
  ...FIRST_PROMOTION,
  revision_id: "e1000000-0000-4000-8000-000000000003",
  created_at: "2026-11-17T09:00:00Z",
  author: { name: "Eris Discordia", email: "eris@example.com" },
  restores: FIRST_PROMOTION.revision_id,
  active: true,
};

/** Every production revision, newest first. */
export const PRODUCTION_REVISIONS: readonly ProductionRevisionSummary[] = [
  ROLLBACK,
  SECOND_PROMOTION,
  FIRST_PROMOTION,
];

/** What production runs now: the rollback. */
export const PRODUCTION: ProductionState = {
  workflow_id: WORKFLOW.id,
  workflow_name: WORKFLOW.name,
  workflow_revision: 1,
  revision: ROLLBACK,
  steps: [STEP_MODELS],
  input_schema: null,
  output_schema: null,
  command: `azathoth workflow production ${WORKFLOW.id}`,
};

/** An invocation the editor made, which succeeded. */
export const SUCCEEDED: InvocationSummary = {
  invocation_id: "f1000000-0000-4000-8000-000000000001",
  workflow_id: WORKFLOW.id,
  created_at: "2026-11-17T10:00:00Z",
  status: "succeeded",
  caller_metadata: { client: "azathoth-ui" },
  sensitivity: "internal",
  run_id: "f2000000-0000-4000-8000-000000000001",
  command: "azathoth invocation show f1000000-0000-4000-8000-000000000001",
};

/** An invocation an agent made, which has not finished. */
export const INCOMPLETE: InvocationSummary = {
  ...SUCCEEDED,
  invocation_id: "f1000000-0000-4000-8000-000000000002",
  created_at: "2026-11-17T11:00:00Z",
  status: "incomplete",
  caller_metadata: { user: "billing-agent" },
  sensitivity: "restricted",
  run_id: null,
  command: "azathoth invocation show f1000000-0000-4000-8000-000000000002",
};

/** The workflow's invocations, newest first. */
export const INVOCATIONS: readonly InvocationSummary[] = [INCOMPLETE, SUCCEEDED];

/** The succeeded invocation, read back with its input, result and run. */
export const SUCCEEDED_DETAIL: InvocationDetail = {
  invocation_id: SUCCEEDED.invocation_id,
  workflow_id: WORKFLOW.id,
  created_at: SUCCEEDED.created_at,
  status: "succeeded",
  result: { result: "A ticket, summarized." },
  error: null,
  idempotency_key: "api-1",
  input: "A long ticket.",
  sensitivity: "internal",
  caller_metadata: { client: "azathoth-ui" },
  run: {
    run_id: "f2000000-0000-4000-8000-000000000001",
    finished: true,
    resumes: 0,
    workflow_revision: 1,
    started_at: "2026-11-17T10:00:00Z",
    completed_at: "2026-11-17T10:00:02Z",
    halted: false,
    steps: [{ step_id: SUMMARIZE, status: "executed", attempts: 1, confidence: null }],
  },
  command: SUCCEEDED.command,
};

/** The incomplete invocation, read back: its run never finished, and was resumed once. */
export const INCOMPLETE_DETAIL: InvocationDetail = {
  ...SUCCEEDED_DETAIL,
  invocation_id: INCOMPLETE.invocation_id,
  created_at: INCOMPLETE.created_at,
  status: "incomplete",
  result: null,
  idempotency_key: "order-7",
  sensitivity: "restricted",
  caller_metadata: { user: "billing-agent" },
  run: {
    run_id: "f2000000-0000-4000-8000-000000000002",
    finished: false,
    resumes: 1,
    workflow_revision: null,
    started_at: null,
    completed_at: null,
    halted: null,
    steps: [],
  },
  command: INCOMPLETE.command,
};

/** How the editor's invocation ended under its key. */
export const OUTCOME: InvocationOutcome = {
  status: "succeeded",
  replayed: false,
  idempotency_key: "api-1",
  invocation_id: SUCCEEDED.invocation_id,
  result: SUCCEEDED_DETAIL.result,
  error: null,
  warnings: [],
  command: SUCCEEDED.command,
};

/** An invocation started from the editor, just started. */
export const LIVE_INVOCATION: LiveRun = {
  ...LIVE_RUN,
  handle: "1nv0ke",
  kind: "invocation",
};
