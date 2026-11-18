/**
 * How the editor says what an invocation is: how it ended, who made it,
 * and the label its input carried (ADR 0010).
 */

import {
  isInvocationOutcome,
  type InvocationOutcome,
  type LiveRun,
  type Sensitivity,
} from "./api/types";

/** What the editor's server tells production of itself, as each invocation's caller. */
export const EDITOR_CALLER = { client: "azathoth-ui" } as const;

/** How an invocation ended, or that it has not, as a person reads it. */
export const INVOCATION_STATUS_NAMES: Readonly<Record<InvocationOutcome["status"], string>> = {
  succeeded: "Succeeded",
  failed: "Failed",
  incomplete: "Incomplete",
  rejected: "Rejected",
};

/** The label an invocation's input carried, as a person reads it. */
export const SENSITIVITY_NAMES: Readonly<Record<Sensitivity, string>> = {
  public: "Public",
  internal: "Internal",
  restricted: "Restricted",
};

/**
 * Returns who made an invocation, from its caller metadata: the editor,
 * what any other caller said of itself, or that none was named.
 */
export function callerName(metadata: Readonly<Record<string, unknown>>): string {
  if (metadata.client === EDITOR_CALLER.client) {
    return "The editor";
  }

  const said = Object.entries(metadata).map(
    ([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`,
  );

  return said.length === 0 ? "No caller named" : said.join(", ");
}

/** Returns how a live invocation ended under its key, once it has. */
export function invocationOutcomeOf(live: LiveRun): InvocationOutcome | null {
  return live.kind === "invocation" && isInvocationOutcome(live.result) ? live.result : null;
}
