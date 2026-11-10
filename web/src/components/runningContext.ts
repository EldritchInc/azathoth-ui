/**
 * What a graph needs to show a run on its steps: what the run says of each
 * step, by its id (ADR 0007).
 */

import { createContext } from "react";

import type { StepRun } from "../running";

/** What the run being shown says of each step, or `null` when no run is shown. */
export const RunningContext = createContext<ReadonlyMap<string, StepRun> | null>(null);
