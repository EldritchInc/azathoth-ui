/**
 * Labelled runs and declared policies, as the editor's server describes
 * them (ADR 0011).
 */

import type { PortfolioEntry, RunDetail, WorkflowReadiness } from "../api/types";
import { LARGE_ENTRY } from "./instances";
import { READY, RUN_DETAIL } from "./runs";

/** The kept run, given restricted input. */
export const RESTRICTED_RUN: RunDetail = { ...RUN_DETAIL, sensitivity: "restricted" };

/** The large model, declared by Eris to neither retain nor train on data. */
export const DECLARED_ENTRY: PortfolioEntry = {
  ...LARGE_ENTRY,
  data_policy: { retains_data: "no", trains_on_data: "no" },
  receives_restricted: true,
  policy_declared_by: { name: "Eris Discordia", email: "eris@example.com" },
  policy_declared_at: "2026-11-18T11:00:00Z",
};

/** The workflow for restricted input: no model it could use is declared private. */
export const RESTRICTED_NOT_READY: WorkflowReadiness = {
  ...READY,
  ready: false,
  steps: READY.steps.map((step) =>
    step.kind === "prompt"
      ? {
          ...step,
          ready: false,
          models: [],
          problem:
            "openai/gpt-large cannot receive restricted input: its portfolio entry does not " +
            "say whether its provider retains data.",
        }
      : step,
  ),
};
