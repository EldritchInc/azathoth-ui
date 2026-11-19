/**
 * How the editor names a person's judgment of a run (ADR 0012).
 */

import type { FeedbackDisposition } from "./api/types";

/** How each disposition is named. */
export const DISPOSITION_NAMES: Readonly<Record<FeedbackDisposition, string>> = {
  good: "Good",
  bad: "Bad",
};
