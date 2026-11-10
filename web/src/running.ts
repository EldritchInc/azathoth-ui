/**
 * A run as the editor watches it (ADR 0007): what each step is doing from
 * the events so far, what to say of each event, and what a run is given.
 */

import { MAX_INPUT_FILE_BYTES } from "./api/client";
import type {
  LiveRun,
  LiveState,
  RunEvent,
  RunStepDetail,
  StepFailure,
  StepMetrics,
  StepStatus,
} from "./api/types";

/**
 * Where one step of a run is: not started, running, how it ended, stopped
 * when the run ended while it was running, or, in a kept run, never reached.
 */
export type StepState = "waiting" | "running" | "stopped" | "unreached" | StepStatus;

/** What a run's events say of one step so far. */
export interface StepProgress {
  readonly state: StepState;
  readonly layer: number | null;
  /** What it says as it runs, while it runs. */
  readonly message: string | null;
  /** The message of a failed step's final attempt. */
  readonly failure: string | null;
  readonly confidence: number | null;
  /** The values it added to the run's context, by name. */
  readonly values: Readonly<Record<string, unknown>>;
}

/** What a run's events say so far: each step's progress, and the run Azathoth kept. */
export interface Progress {
  readonly steps: ReadonlyMap<string, StepProgress>;
  /** The kept run, once it has finished. */
  readonly runId: string | null;
  readonly succeeded: boolean | null;
}

const WAITING: StepProgress = {
  state: "waiting",
  layer: null,
  message: null,
  failure: null,
  confidence: null,
  values: {},
};

/** Returns what a run's events say so far, in the order they came. */
export function progressOf(events: readonly RunEvent[]): Progress {
  const steps = new Map<string, StepProgress>();
  let runId: string | null = null;
  let succeeded: boolean | null = null;

  for (const event of events) {
    if (event.type === "run_started") {
      continue;
    }
    if (event.type === "run_finished") {
      runId = event.run_id;
      succeeded = event.succeeded;
      continue;
    }

    const last = steps.get(event.step_id) ?? WAITING;

    switch (event.type) {
      case "step_started":
        steps.set(event.step_id, {
          ...last,
          state: "running",
          layer: event.layer,
          message: event.message,
        });
        break;
      case "step_finished":
        steps.set(event.step_id, {
          ...last,
          state: event.status,
          layer: event.layer,
          message: null,
          failure: event.failure,
          confidence: event.confidence,
        });
        break;
      case "context_changed":
        steps.set(event.step_id, { ...last, values: { ...last.values, ...event.values } });
        break;
    }
  }

  return { steps, runId, succeeded };
}

/**
 * Returns where one step is, waiting when the events have not named it. A
 * step still running when its run `ended`, cancelled or cut off, stopped.
 */
export function stepState(progress: Progress, step: string, ended = false): StepState {
  const state = progress.steps.get(step)?.state ?? "waiting";

  return ended && state === "running" ? "stopped" : state;
}

/** How each step state is named to a person. */
export const STEP_STATE_NAMES: Readonly<Record<StepState, string>> = {
  waiting: "Waiting",
  running: "Running",
  stopped: "Stopped",
  unreached: "Not run",
  executed: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

/** How each live run state is named to a person. */
export const LIVE_STATE_NAMES: Readonly<Record<LiveState, string>> = {
  running: "Running",
  finished: "Finished",
  cancelled: "Cancelled",
  refused: "Refused",
};

/** Returns how a finished run is named: a run that ran to its end may still have failed. */
export function outcomeName(live: LiveRun, succeeded: boolean | null): string {
  if (live.state !== "finished") {
    return LIVE_STATE_NAMES[live.state];
  }
  return succeeded === false ? "Failed" : "Succeeded";
}

function finishedLine(title: string, status: StepStatus, failure: string | null): string {
  switch (status) {
    case "executed":
      return `${title} finished.`;
    case "skipped":
      return `${title} was skipped.`;
    case "failed":
      return failure === null ? `${title} failed.` : `${title} failed: ${failure}`;
  }
}

/** Returns what to say of one event, naming steps by their titles. */
export function eventLine(event: RunEvent, titleOf: (step: string) => string): string {
  switch (event.type) {
    case "run_started":
      return "The run started.";
    case "step_started":
      return event.message === null
        ? `${titleOf(event.step_id)} started.`
        : `${titleOf(event.step_id)} started: “${event.message}”`;
    case "step_finished":
      return finishedLine(titleOf(event.step_id), event.status, event.failure);
    case "context_changed": {
      const names = Object.keys(event.values);

      return names.length === 0
        ? `${titleOf(event.step_id)} added nothing to the context.`
        : `${titleOf(event.step_id)} added ${names.join(", ")}.`;
    }
    case "run_finished":
      return event.succeeded ? "The run succeeded." : "The run failed.";
  }
}

/** Returns how long passed between two moments, as people say it: "40 ms", "0.4 s", "1 min 5 s". */
export function duration(from: string, to: string | null, now: Date = new Date()): string {
  const end = to === null ? now.getTime() : new Date(to).getTime();
  const seconds = Math.max(0, (end - new Date(from).getTime()) / 1000);

  if (seconds < 0.1) {
    return `${String(Math.round(seconds * 1000))} ms`;
  }
  if (seconds < 10) {
    return `${seconds.toFixed(1)} s`;
  }
  if (seconds < 60) {
    return `${String(Math.round(seconds))} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);

  return rest === 0 ? `${String(minutes)} min` : `${String(minutes)} min ${String(rest)} s`;
}

/** How a person gives a run its input. */
export type InputMode = "text" | "json" | "file" | "none";

/** What a run would be given, or why it cannot be given it. */
export type ReadInput =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly problem: string };

/** Returns the JSON a person typed as a run's input, or what is wrong with it. */
export function readJson(text: string): ReadInput {
  if (text.trim() === "") {
    return { ok: false, problem: 'Write the input as JSON, such as {"text": "…"}.' };
  }
  try {
    const value: unknown = JSON.parse(text);

    return { ok: true, value };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "it doesn't read as JSON";

    return { ok: false, problem: `This isn't JSON yet: ${reason}` };
  }
}

const BINARY_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const TEXT_TYPES: Readonly<Record<string, string>> = {
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  html: "text/html",
  xml: "text/xml",
};

const TAKEN_BINARY = new Set(Object.values(BINARY_TYPES));

/** What Azathoth takes as a file, said to a person. */
export const TAKEN_FILES = "JSON, text, PDF, PNG, JPEG and WebP files";

/** Returns the media type Azathoth would take a file as, or `null` when it takes none. */
export function mediaTypeOf(name: string, type: string): string | null {
  const given = type.split(";", 1)[0]?.trim().toLowerCase() ?? "";

  if (given === "application/json" || given.startsWith("text/") || TAKEN_BINARY.has(given)) {
    return given;
  }
  if (given !== "" && given !== "application/octet-stream") {
    return null;
  }

  const extension = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";

  return BINARY_TYPES[extension] ?? TEXT_TYPES[extension] ?? null;
}

/** Returns why Azathoth would not take a file, or `null` when it would. */
export function fileProblem(name: string, type: string, size: number): string | null {
  if (mediaTypeOf(name, type) === null) {
    return `Azathoth takes ${TAKEN_FILES}; ${name} isn't one.`;
  }
  if (size > MAX_INPUT_FILE_BYTES) {
    return `${name} is ${megabytes(size)}; a run's file may be at most 10 MB.`;
  }
  return null;
}

/** Returns a size as people read it: "812 KB", "3.4 MB". */
export function megabytes(size: number): string {
  if (size < 1024 * 1024) {
    return `${String(Math.max(1, Math.round(size / 1024)))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns bytes as base64, as the server takes a file's content. */
export function base64Of(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";

  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
}

/** What one run says of one step: where it is, and what it did as far as it is known. */
export interface StepRun {
  readonly state: StepState;
  /** What it says as it runs, while it runs. */
  readonly message: string | null;
  /** The message of a failed step's final attempt. */
  readonly failure: string | null;
  readonly values: Readonly<Record<string, unknown>>;
  /** How many times it was tried, once that is known. */
  readonly attempts: number | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly strategy: string | null;
  readonly metrics: StepMetrics | null;
  readonly hasOutput: boolean;
  readonly output: unknown;
  /** Each attempt that failed, once they are known. */
  readonly failures: readonly StepFailure[];
}

/** Returns what a live run's events say of one step so far. */
export function liveStepRun(progress: Progress, step: string, ended: boolean): StepRun {
  const known = progress.steps.get(step);

  return {
    state: stepState(progress, step, ended),
    message: known?.message ?? null,
    failure: known?.failure ?? null,
    values: known?.values ?? {},
    attempts: null,
    startedAt: null,
    completedAt: null,
    strategy: null,
    metrics: null,
    hasOutput: false,
    output: null,
    failures: [],
  };
}

/** Returns what a kept run says of one step, never reached when it does not name it. */
export function keptStepRun(detail: RunStepDetail | undefined): StepRun {
  return {
    state: detail?.status ?? "unreached",
    message: null,
    failure: detail?.failures.at(-1)?.message ?? null,
    values: detail?.values ?? {},
    attempts: detail?.attempts ?? 0,
    startedAt: detail?.started_at ?? null,
    completedAt: detail?.completed_at ?? null,
    strategy: detail?.strategy ?? null,
    metrics: detail?.metrics ?? null,
    hasOutput: detail?.status === "executed",
    output: detail?.output ?? null,
    failures: detail?.failures ?? [],
  };
}

/** Returns what a step's strategy measured, as labelled facts a person reads. */
export function measured(metrics: StepMetrics): (readonly [string, string])[] {
  const facts: (readonly [string, string])[] = [];
  const { provider, model } = metrics;

  if (model !== null) {
    facts.push(["Model", provider === null ? model : `${provider}/${model}`]);
  }
  if (metrics.total_tokens !== null || metrics.prompt_tokens !== null) {
    const parts = [
      metrics.prompt_tokens === null ? null : `${metrics.prompt_tokens.toLocaleString("en")} in`,
      metrics.completion_tokens === null
        ? null
        : `${metrics.completion_tokens.toLocaleString("en")} out`,
    ].filter((part) => part !== null);
    const total = metrics.total_tokens ?? 0;

    facts.push(["Tokens", parts.length === 0 ? total.toLocaleString("en") : parts.join(", ")]);
  }
  if (metrics.latency_ms !== null) {
    facts.push([
      "Latency",
      metrics.latency_ms < 1000
        ? `${String(Math.round(metrics.latency_ms))} ms`
        : `${(metrics.latency_ms / 1000).toFixed(1)} s`,
    ]);
  }
  if (
    metrics.estimated_cost_usd !== null &&
    (metrics.estimated_cost_usd > 0 || metrics.model !== null)
  ) {
    facts.push(["Cost", cost(metrics.estimated_cost_usd)]);
  }
  return facts;
}

/** Returns an estimated cost in dollars: to the cent, or to four places below one. */
export function cost(usd: number): string {
  return usd === 0 ? "$0" : usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
