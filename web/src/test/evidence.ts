/**
 * Judges and a run's evidence as the editor's server describes them: the
 * rotation, a run's judgments, its citations, the runs it started, and a
 * workflow's interrupted runs (ADR 0012).
 */

import type {
  Annotations,
  InterruptedRun,
  JudgeSummary,
  LiveRun,
  RunChildSummary,
  RunFeedback,
} from "../api/types";
import { LARGE_MODEL, REVIEW_WORKFLOW, SMALL_MODEL, WORKFLOW } from "./instances";
import { LIVE_RUN, RUN_SUMMARY, SUMMARIZE } from "./runs";

/** The first judge: the large model, which the portfolio authorizes. */
export const LARGE_JUDGE: JudgeSummary = {
  identifier: LARGE_MODEL.identifier,
  provider: LARGE_MODEL.provider,
  model: LARGE_MODEL.model,
  position: 1,
  authorized: true,
  command: "azathoth judge list",
};

/** The second judge: the small model, which the portfolio no longer authorizes. */
export const SMALL_JUDGE: JudgeSummary = {
  identifier: SMALL_MODEL.identifier,
  provider: SMALL_MODEL.provider,
  model: SMALL_MODEL.model,
  position: 2,
  authorized: false,
  command: "azathoth judge list",
};

/** The rotation, in the order judges are tried. */
export const JUDGES: readonly JudgeSummary[] = [LARGE_JUDGE, SMALL_JUDGE];

/** A judgment that the run was bad, with what it should have produced: the newest. */
export const BAD_JUDGMENT: RunFeedback = {
  feedback_id: "c1000000-0000-4000-8000-000000000002",
  run_id: RUN_SUMMARY.run_id,
  disposition: "bad",
  reason: "It left out the fire.",
  corrected_output: "A printer is on fire.",
  created_at: "2026-11-18T10:00:00Z",
  command: RUN_SUMMARY.command,
};

/** An earlier judgment that the run was good. */
export const GOOD_JUDGMENT: RunFeedback = {
  feedback_id: "c1000000-0000-4000-8000-000000000001",
  run_id: RUN_SUMMARY.run_id,
  disposition: "good",
  reason: null,
  corrected_output: null,
  created_at: "2026-11-18T09:00:00Z",
  command: RUN_SUMMARY.command,
};

/** Every judgment of the run, newest first. */
export const JUDGMENTS: readonly RunFeedback[] = [BAD_JUDGMENT, GOOD_JUDGMENT];

/** One citation the run's summarizing step verified, as a Web Annotation. */
export const CITATION: Readonly<Record<string, unknown>> = {
  id: `urn:azathoth:run:${RUN_SUMMARY.run_id}:step:${SUMMARIZE}:record:0:check:0`,
  type: "Annotation",
  motivation: "highlighting",
  body: {
    type: "TextualBody",
    purpose: "describing",
    format: "text/plain",
    value: "Supports: the printer is on fire.",
  },
  target: {
    type: "SpecificResource",
    source: "https://tickets.example.com/7",
    selector: [{ type: "TextQuoteSelector", exact: "My printer is on fire." }],
  },
};

/** The run's citations, as `azathoth run annotations` prints them. */
export const ANNOTATIONS: Annotations = {
  subject_id: RUN_SUMMARY.run_id,
  run_id: RUN_SUMMARY.run_id,
  collection: {
    "@context": "http://www.w3.org/ns/anno.jsonld",
    id: `urn:azathoth:run:${RUN_SUMMARY.run_id}`,
    type: "AnnotationCollection",
    label: `Citations of run ${RUN_SUMMARY.run_id}: 1 verified, 1 not verified and left out.`,
    total: 1,
    first: { type: "AnnotationPage", startIndex: 0, items: [CITATION] },
  },
  items: [CITATION],
  command: `azathoth run annotations ${RUN_SUMMARY.run_id}`,
};

/** A run the summarizing step started, which finished. */
export const FINISHED_CHILD: RunChildSummary = {
  child_run_id: "d1000000-0000-4000-8000-000000000001",
  child_workflow_id: REVIEW_WORKFLOW.id,
  child_invocation_id: null,
  parent_run_id: RUN_SUMMARY.run_id,
  parent_step_id: SUMMARIZE,
  parent_attempt: 1,
  depth: 1,
  started_at: "2026-11-10T10:00:01Z",
  status: "succeeded",
  command: "azathoth run show d1000000-0000-4000-8000-000000000001",
};

/** A run the step's second attempt started by invoking production, kept nowhere yet. */
export const UNFINISHED_CHILD: RunChildSummary = {
  ...FINISHED_CHILD,
  child_run_id: "d1000000-0000-4000-8000-000000000002",
  child_invocation_id: "d2000000-0000-4000-8000-000000000002",
  parent_attempt: 2,
  started_at: "2026-11-10T10:00:02Z",
  status: "unfinished",
  command: null,
};

/** The runs the run started, oldest first. */
export const CHILDREN: readonly RunChildSummary[] = [FINISHED_CHILD, UNFINISHED_CHILD];

/** A run of the workflow that stopped part way, never resumed. */
export const INTERRUPTED: InterruptedRun = {
  run_id: "a1000000-0000-4000-8000-000000000001",
  workflow_id: WORKFLOW.id,
  workflow_name: WORKFLOW.name,
  workflow_revision: 3,
  invocation_id: null,
  started_at: "2026-11-18T08:00:00Z",
  last_recorded_at: "2026-11-18T08:00:01Z",
  resumes: 0,
  command: "azathoth run resume a1000000-0000-4000-8000-000000000001",
};

/** An invocation's run that stopped part way, resumed once and stopped again. */
export const INTERRUPTED_INVOCATION: InterruptedRun = {
  ...INTERRUPTED,
  run_id: "a1000000-0000-4000-8000-000000000002",
  invocation_id: "a2000000-0000-4000-8000-000000000002",
  started_at: "2026-11-18T07:00:00Z",
  last_recorded_at: "2026-11-18T07:30:00Z",
  resumes: 1,
  command: "azathoth invocation resume a2000000-0000-4000-8000-000000000002",
};

/** The workflow's interrupted runs, newest first. */
export const INTERRUPTED_RUNS: readonly InterruptedRun[] = [INTERRUPTED, INTERRUPTED_INVOCATION];

/** The interrupted run being resumed from the editor, just started. */
export const RESUMING: LiveRun = {
  ...LIVE_RUN,
  handle: "r3sume",
  resumes_run_id: INTERRUPTED.run_id,
};
