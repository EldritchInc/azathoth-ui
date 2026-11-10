/**
 * What Azathoth says is wrong with a workflow document, said so a person
 * knows what to change, and attached to the step it is about when there is
 * one (ADR 0007).
 *
 * Azathoth is the judge: `workflows.check` decides what is wrong, and the
 * editor only words it. Where Azathoth names a field, the editor names it as
 * the editor does, a step's input or output by its name, and says a few of
 * the commonest refusals in plain words; anything else is in Azathoth's own.
 */

import type { DocumentProblem, WorkflowCheck } from "./api/types";
import { asList, asObject, asText, stepsOf, type JsonObject, type JsonValue } from "./editing";

/** One thing wrong with a document, and the step it is about, if any. */
export interface Problem {
  readonly step: string | null;
  readonly message: string;
}

/** Returns what a person calls a step: its prompt's name, its tool's, or neither. */
export function titleOf(step: JsonObject): string {
  const specification = asObject(step.specification);
  const name =
    asText(asObject(specification.metadata).name) ??
    asText(asObject(specification.requirement).name);

  return name === null || name.trim() === "" ? "an unnamed step" : name;
}

const FIELD_NAMES: Readonly<Record<string, string | null>> = {
  specification: null,
  metadata: null,
  requirement: "tool",
  model_selection: "model selection",
  requirements: "model needs",
  prompt: "prompt",
  template: "prompt",
  bindings: "binding",
  depends_on: "runs after",
  retry_policy: "retries",
  max_attempts: "attempts",
  failure_policy: "what it does on failure",
  emit_values: "showing its values",
  result: "result",
};

/** Lists whose items are named by their `name`, or by their place when they have none. */
const ITEM_NAMES: Readonly<Record<string, string>> = {
  inputs: "input",
  outputs: "output",
  bindings: "binding",
  conditions: "condition",
  steps: "step",
};

const PLAIN: readonly (readonly [RegExp, string])[] = [
  [/^Field required$/, "is missing"],
  [/^String should have at least 1 character$/, "can’t be empty"],
  [/^Input should be a valid string$/, "must be text"],
  [/^Input should be a valid integer/, "must be a whole number"],
  [/^Input should be a valid number/, "must be a number"],
  [/^Input should be a valid boolean/, "must be true or false"],
  [/^Input should be a valid UUID/, "must be a UUID"],
  [/^Input should be a valid list$/, "must be a list"],
  [/^Input should be (a valid dictionary|an object)/, "must be an object"],
  [/^Extra inputs are not permitted$/, "isn’t something Azathoth knows"],
];

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function itemName(
  list: string | number | undefined,
  item: JsonValue | undefined,
  index: number,
): string {
  const kind = typeof list === "string" ? ITEM_NAMES[list] : undefined;
  const name = asText(asObject(item).name);

  if (kind === undefined) {
    return String(index + 1);
  }
  return name === null || name === "" ? `${kind} ${String(index + 1)}` : `${kind} “${name}”`;
}

/**
 * Returns a field's place in a document as a person names it: "model
 * selection", "input “text” › source", "the workflow’s version". Within a
 * step, the step is left out, as the problem names it beside.
 */
export function fieldName(location: readonly (string | number)[], document: JsonObject): string {
  const index = location[1];
  const inStep = location[0] === "steps" && typeof index === "number";
  const path = inStep ? location.slice(2) : location;
  const words: string[] = [];
  let node: JsonValue | undefined = inStep ? stepsOf(document)[index] : document;

  path.forEach((key, place) => {
    if (typeof key === "number") {
      const item = asList(node)[key];
      const list = path[place - 1];

      if (typeof list === "string" && list in ITEM_NAMES) {
        words.pop();
      }
      words.push(itemName(list, item, key));
      node = item;
      return;
    }

    const named = key in FIELD_NAMES ? FIELD_NAMES[key] : key.replaceAll("_", " ");

    if (named !== null && named !== undefined) {
      words.push(named);
    }
    node = asObject(node)[key];
  });

  const field = words.join(" › ");

  return !inStep && location[0] === "metadata" ? `the workflow’s ${field}` : field;
}

/** Returns one of Azathoth's problems in words, with the field it is about. */
export function worded(problem: DocumentProblem, document: JsonObject): string {
  const field = fieldName(problem.location, document);
  const plain = PLAIN.find(([pattern]) => pattern.test(problem.message))?.[1];

  if (field === "") {
    return plain === undefined ? problem.message : `It ${plain}.`;
  }
  if (plain === undefined) {
    return `${capitalized(field)}: ${problem.message}`;
  }
  return `${capitalized(field)} ${plain}.`;
}

/** Returns what Azathoth says is wrong with a document, each in words, with its step. */
export function problemsOf(check: WorkflowCheck, document: JsonObject): Problem[] {
  return check.problems.map((problem) => ({
    step: problem.step_id,
    message: worded(problem, document),
  }));
}
