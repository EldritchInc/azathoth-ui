/**
 * Trying one step of a workflow alone (ADR 0007): which of its inputs may
 * be left to read as written, what each is given, and what is sent to try
 * it. An input another step gives has no step to give it, so it must be
 * given; a constant, or a field of the run's input, may be left as written,
 * and the run's input is asked for only while an input is left to read it.
 */

import type { SentFile, TrialStart } from "./api/client";
import { describeWorkflow } from "./documents";
import type { JsonObject } from "./editing";
import { givenOf, NEW_DRAFT, type InputDraft } from "./runInput";

/** One input of a step to try: where it reads from, and whether it must be given. */
export interface TrialInput {
  readonly name: string;
  /** Where it reads from as written, in words. */
  readonly from: string;
  /** Whether it may be left to read as written: a constant, or the run's input. */
  readonly optional: boolean;
  /** Whether, left as written, it reads the run's input. */
  readonly readsRun: boolean;
}

/** What a person gave a step to try so far: each input by name, and the run's input. */
export interface TrialDraft {
  readonly inputs: Readonly<Record<string, InputDraft>>;
  readonly run: InputDraft;
}

/** Nothing given yet: each input as written where it may be, and the run given text. */
export const NEW_TRIAL: TrialDraft = { inputs: {}, run: NEW_DRAFT };

/** What trying a step would be sent, or why it can't be sent yet. */
export type TrialReady =
  | { readonly ok: true; readonly start: TrialStart }
  | { readonly ok: false; readonly problem: string };

/** Returns the inputs of one step of a document, as a person tries it. */
export function trialInputs(document: JsonObject, stepId: string): TrialInput[] {
  const step = describeWorkflow(document).steps.find((each) => each.id === stepId);

  return (step?.inputs ?? []).map(({ name, from, source }) => ({
    name,
    from,
    optional: source.kind === "input" || source.kind === "constant",
    readsRun: source.kind === "input",
  }));
}

/**
 * Returns what one input has been given: as written, until it is given
 * otherwise, where it may be; text, where it must be given.
 */
export function inputDraft(draft: TrialDraft, input: TrialInput): InputDraft {
  return draft.inputs[input.name] ?? (input.optional ? { ...NEW_DRAFT, mode: "none" } : NEW_DRAFT);
}

/** Returns whether an input left as written reads the run's input, so the run needs one. */
export function needsRunInput(inputs: readonly TrialInput[], draft: TrialDraft): boolean {
  return inputs.some((input) => input.readsRun && inputDraft(draft, input).mode === "none");
}

/** Returns what trying a step is sent, from what it was given, or what is missing first. */
export function trialStart(
  document: JsonObject,
  stepId: string,
  inputs: readonly TrialInput[],
  draft: TrialDraft,
): TrialReady {
  const values: Record<string, unknown> = {};
  const files: Record<string, SentFile> = {};

  for (const input of inputs) {
    const { given, problem } = givenOf(inputDraft(draft, input));

    if (given === null) {
      return { ok: false, problem: `“${input.name}”: ${problem ?? "give it a value."}` };
    }
    if (given.kind === "json") {
      values[input.name] = given.value;
    } else if (given.kind === "file") {
      files[input.name] = given.file;
    }
  }

  const start: TrialStart = { document, step_id: stepId, inputs: values, files };

  if (!needsRunInput(inputs, draft)) {
    return { ok: true, start };
  }

  const { given, problem } = givenOf(draft.run);

  if (given === null) {
    return { ok: false, problem: `The run’s input: ${problem ?? "give it a value."}` };
  }
  switch (given.kind) {
    case "json":
      return { ok: true, start: { ...start, input: given.value } };
    case "file":
      return { ok: true, start: { ...start, file: given.file } };
    case "none":
      return { ok: true, start };
  }
}
