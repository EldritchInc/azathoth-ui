/**
 * What a graph needs to show a run on its steps: where each step is, by
 * its id (ADR 0007).
 */

import { createContext } from "react";

import type { StepState } from "../running";

/** Where each step of the run being shown is, or `null` when no run is shown. */
export const RunningContext = createContext<ReadonlyMap<string, StepState> | null>(null);
