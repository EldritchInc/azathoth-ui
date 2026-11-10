/**
 * How a prompt step chooses its model (ADR 0006): by what it needs, from the
 * models the portfolio authorizes, or one model always.
 *
 * Which of the local portfolio's models a step could run on is Azathoth's
 * to say, and the editor asks it (`models.matching`, ADR 0007). `meets`
 * repeats Azathoth's `ModelQuery.matches` only for the hints about models
 * outside the portfolio, which Azathoth does not match yet: how many more
 * the providers serve, and the steps a model could serve once it is added.
 */

import type { ModelSummary } from "./api/types";
import {
  asList,
  asObject,
  asText,
  idOf,
  isObject,
  stepsOf,
  type JsonObject,
  type JsonValue,
} from "./editing";
import { CAPABILITIES, MODALITIES, NO_FILTER, type ModelFilter } from "./models";
import { titleOf } from "./problems";

/** What a prompt step needs of its model; a need left out is any. */
export interface Needs {
  readonly capabilities: readonly string[];
  /** What it must read: text, unless the step says otherwise. */
  readonly reads: readonly string[];
  /** What it must write: text, unless the step says otherwise. */
  readonly writes: readonly string[];
  readonly context: number | null;
  readonly output: number | null;
  readonly inputPrice: number | null;
  readonly outputPrice: number | null;
  readonly knownPricing: boolean;
}

/** How a prompt step chooses its model. */
export type Selection =
  | { readonly kind: "needs"; readonly needs: Needs }
  | { readonly kind: "fixed"; readonly identifier: string };

function textsOr(value: JsonValue | undefined, fallback: readonly string[]): string[] {
  return value === undefined
    ? [...fallback]
    : asList(value).filter((item): item is string => typeof item === "string");
}

function numberOf(value: JsonValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}

/** Returns what a step's model needs, as Azathoth reads a step's requirements. */
export function needsOf(requirements: JsonObject): Needs {
  return {
    capabilities: textsOr(requirements.required_capabilities, []),
    reads: textsOr(requirements.required_input_modalities, ["text"]),
    writes: textsOr(requirements.required_output_modalities, ["text"]),
    context: numberOf(requirements.minimum_context_window_tokens),
    output: numberOf(requirements.minimum_output_tokens),
    inputPrice: numberOf(requirements.maximum_input_usd_per_million_tokens),
    outputPrice: numberOf(requirements.maximum_output_usd_per_million_tokens),
    knownPricing: requirements.require_known_pricing === true,
  };
}

/** Returns how a step chooses its model, or `null` for a step that runs no model. */
export function selectionOf(step: JsonObject): Selection | null {
  const selection = asObject(asObject(step.specification).model_selection);

  if (isObject(selection.requirements)) {
    return { kind: "needs", needs: needsOf(selection.requirements) };
  }

  const provider = asText(selection.provider);
  const model = asText(selection.model);

  return provider === null || model === null || provider === "" || model === ""
    ? null
    : { kind: "fixed", identifier: `${provider}/${model}` };
}

function atLeast(known: number | null, least: number | null): boolean {
  return least === null || (known !== null && known >= least);
}

/** Returns whether a model meets what a step needs, by Azathoth's rules. */
export function meets(model: ModelSummary, needs: Needs): boolean {
  const input = model.input_usd_per_million_tokens;
  const output = model.output_usd_per_million_tokens;
  const priced = input !== null && output !== null;
  const capped = needs.inputPrice !== null || needs.outputPrice !== null;

  if ((needs.knownPricing || capped) && !priced) {
    return false;
  }
  return (
    needs.capabilities.every((capability) => model.capabilities.includes(capability)) &&
    needs.reads.every((modality) => model.input_modalities.includes(modality)) &&
    needs.writes.every((modality) => model.output_modalities.includes(modality)) &&
    atLeast(model.context_window_tokens, needs.context) &&
    atLeast(model.maximum_output_tokens, needs.output) &&
    (needs.inputPrice === null || (input !== null && input <= needs.inputPrice)) &&
    (needs.outputPrice === null || (output !== null && output <= needs.outputPrice))
  );
}

/** A workflow, as far as the editor needs one to find the steps that could use a model. */
export interface WorkflowDocument {
  readonly id: string;
  readonly name: string;
  readonly document: JsonObject;
}

/** One step that could run on a model: one that needs what it does, or always runs on it. */
export interface Use {
  readonly workflowId: string;
  readonly workflowName: string;
  readonly stepId: string;
  readonly step: string;
  /** Whether the step always runs on this model, rather than choosing it. */
  readonly fixed: boolean;
}

/** Returns the steps of the workflows that could run on a model, in each workflow's order. */
export function stepsThatCouldUse(
  model: ModelSummary,
  workflows: readonly WorkflowDocument[],
): Use[] {
  return workflows.flatMap((workflow) =>
    stepsOf(workflow.document).flatMap((step): Use[] => {
      const selection = selectionOf(step);
      const fixed = selection?.kind === "fixed" && selection.identifier === model.identifier;
      const chooses = selection?.kind === "needs" && meets(model, selection.needs);

      return fixed || chooses
        ? [
            {
              workflowId: workflow.id,
              workflowName: workflow.name,
              stepId: idOf(step),
              step: titleOf(step),
              fixed,
            },
          ]
        : [];
    }),
  );
}

/**
 * Returns the catalog's filter nearest a step's needs: what it reads past
 * text, what it can do, its context and its prices. The catalog cannot ask
 * for what a model writes, its longest answer or known prices, so it may
 * show a few models the step would not choose.
 */
export function filterFor(needs: Needs): ModelFilter {
  return {
    ...NO_FILTER,
    reads: needs.reads.filter(
      (modality) => modality !== "text" && MODALITIES.some(([each]) => each === modality),
    ),
    can: needs.capabilities.filter((capability) =>
      CAPABILITIES.some(([each]) => each === capability),
    ),
    context: needs.context,
    inputPrice: needs.inputPrice,
    outputPrice: needs.outputPrice,
  };
}
