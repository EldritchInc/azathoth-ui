/**
 * Editing a workflow document: each edit takes a document and returns a new
 * one, leaving the first as it was and every field it does not know alone.
 *
 * A document is JSON as Azathoth imports and exports it. Step ids are UUIDs,
 * which the caller makes, so every edit is the same each time it is made.
 * What Azathoth would refuse, an edit may still make on the way to something
 * it accepts; `problems` says what is wrong.
 */

/** A JSON value. */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** A JSON object. */
export type JsonObject = Readonly<Record<string, JsonValue>>;

/** Where an input's value comes from. */
export type Source =
  | { readonly kind: "input"; readonly field: string }
  | { readonly kind: "step"; readonly step: string; readonly name: string }
  | { readonly kind: "context"; readonly name: string }
  | { readonly kind: "constant"; readonly value: JsonValue };

/** A test a condition makes of a value. */
export type Operator =
  | "equal"
  | "not_equal"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal";

/** What a step does when it fails for the last time. */
export type FailurePolicy = "fail_workflow" | "continue" | "skip_dependents";

/** The kinds of step a person can add: one that asks a model, and one that runs a tool. */
export type StepKind = "prompt" | "tool";

/** The event a run's input arrives in. */
export const INPUT_EVENT = "workflow.input.received";

/** The workflow's input, as a source. */
export const WORKFLOW_INPUT: Source = { kind: "input", field: "input" };

/** What a new prompt step asks of its model: text in, text out, nothing more. */
export const DEFAULT_REQUIREMENTS: JsonObject = {
  required_capabilities: [],
  required_input_modalities: ["text"],
  required_output_modalities: ["text"],
  minimum_context_window_tokens: null,
  minimum_output_tokens: null,
  maximum_input_usd_per_million_tokens: null,
  maximum_output_usd_per_million_tokens: null,
  require_known_pricing: false,
};

/** How a new step retries: it does not. */
export const DEFAULT_RETRY: JsonObject = {
  max_attempts: 1,
  initial_delay_seconds: 0,
  backoff_multiplier: 1,
  maximum_delay_seconds: null,
};

/** Returns whether a value is a JSON object. */
export function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns a value when it is an object, or an empty one. */
export function asObject(value: JsonValue | undefined): JsonObject {
  return isObject(value) ? value : {};
}

function isList(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

/** Returns a value when it is a list, or an empty one. */
export function asList(value: JsonValue | undefined): readonly JsonValue[] {
  return isList(value) ? value : [];
}

/** Returns a value when it is a string, or `null`. */
export function asText(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function without(record: JsonObject, key: string): JsonObject {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
}

/** Returns the document's steps, each an object. */
export function stepsOf(document: JsonObject): JsonObject[] {
  return asList(document.steps).filter(isObject);
}

/** Returns a step's id, or `""` when it has none. */
export function idOf(step: JsonObject): string {
  return asText(step.id) ?? "";
}

function withSteps(document: JsonObject, steps: readonly JsonObject[]): JsonObject {
  return { ...document, steps };
}

function updateStep(
  document: JsonObject,
  id: string,
  change: (step: JsonObject) => JsonObject,
): JsonObject {
  return withSteps(
    document,
    stepsOf(document).map((step) => (idOf(step) === id ? change(step) : step)),
  );
}

function updateSpecification(
  document: JsonObject,
  id: string,
  change: (specification: JsonObject) => JsonObject,
): JsonObject {
  return updateStep(document, id, (step) => ({
    ...step,
    specification: change(asObject(step.specification)),
  }));
}

/** Returns a source as a document writes it. */
export function sourceDocument(source: Source): JsonObject {
  switch (source.kind) {
    case "input":
      return { event_type: INPUT_EVENT, field_name: source.field };
    case "step":
      return { producer_step_id: source.step, name: source.name };
    case "context":
      return { name: source.name };
    case "constant":
      return { value: source.value };
  }
}

/** Returns where a document's source comes from, or `null` when it names none Azathoth knows. */
export function sourceOf(value: JsonValue | undefined): Source | null {
  const source = asObject(value);

  if ("value" in source) {
    return { kind: "constant", value: source.value ?? null };
  }
  if (asText(source.event_type) !== null) {
    return { kind: "input", field: asText(source.field_name) ?? "" };
  }
  if ("producer_step_id" in source) {
    return {
      kind: "step",
      step: asText(source.producer_step_id) ?? "",
      name: asText(source.name) ?? "",
    };
  }

  const name = asText(source.name);

  return name === null ? null : { kind: "context", name };
}

/**
 * Returns the variables a prompt's text names, in the order they first
 * appear: each `{name}`, where a doubled brace is a brace and names nothing.
 */
export function variablesOf(prompt: string): string[] {
  const found: string[] = [];
  let index = 0;

  while (index < prompt.length) {
    const character = prompt[index];
    const next = prompt[index + 1];

    if ((character === "{" && next === "{") || (character === "}" && next === "}")) {
      index += 2;
      continue;
    }
    if (character === "{") {
      const end = prompt.indexOf("}", index + 1);

      if (end === -1) {
        break;
      }

      const name = (prompt.slice(index + 1, end).split(/[!:]/, 1)[0] ?? "").trim();

      if (name !== "" && !found.includes(name)) {
        found.push(name);
      }
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return found;
}

/** Returns a name not yet taken, the one asked for when it is free, or with a number after it. */
export function uniqueName(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) {
    return name;
  }

  let number = 2;

  while (taken.includes(`${name}_${String(number)}`)) {
    number += 1;
  }
  return `${name}_${String(number)}`;
}

function namesOf(bindings: JsonValue | undefined): string[] {
  return asList(bindings).flatMap((binding) => {
    const name = asText(asObject(binding).name);

    return name === null ? [] : [name];
  });
}

/**
 * Returns a step with its prompt's variables bound again: a variable keeps
 * its binding while it is in the text and what it binds is there, a
 * variable without one takes the input of its name, and a binding whose
 * variable is gone goes.
 */
function bound(step: JsonObject): JsonObject {
  const specification = asObject(step.specification);

  if (!isObject(specification.template)) {
    return step;
  }

  const template = specification.template;
  const inputs = namesOf(step.inputs);
  const variables = variablesOf(asText(template.text) ?? "");
  const bindings = asList(template.bindings).filter(isObject);
  const kept = variables.flatMap((variable): JsonObject[] => {
    const binding = bindings.find((each) => asText(each.variable_name) === variable);

    if (binding !== undefined) {
      const input = asText(binding.input_name);

      if (input === null || inputs.includes(input)) {
        return [binding];
      }
    }
    return inputs.includes(variable) ? [{ variable_name: variable, input_name: variable }] : [];
  });

  return {
    ...step,
    specification: { ...specification, template: { ...template, bindings: kept } },
  };
}

// The workflow.

/** The ids a new workflow needs: its own, its first step's, and that step's prompt's. */
export interface NewWorkflowIds {
  readonly workflow: string;
  readonly step: string;
  readonly specification: string;
}

/**
 * Returns a new workflow: one prompt step that answers the workflow's
 * input, whose answer is the workflow's result. Its descriptions are left
 * for the person to write.
 */
export function newWorkflow(ids: NewWorkflowIds, name = "New workflow"): JsonObject {
  const document: JsonObject = {
    metadata: { id: ids.workflow, name, description: "", version: "1.0.0" },
    steps: [],
    result: { name: "answer" },
  };
  const withStep = addStep(document, "prompt", {
    step: ids.step,
    specification: ids.specification,
  });
  const withInput = addInput(withStep, ids.step, "input", WORKFLOW_INPUT);
  const withPrompt = setPromptText(withInput, ids.step, "{input}");

  return addOutput(setStepName(withPrompt, ids.step, "Answer"), ids.step, "answer");
}

/** Returns the document with its name, description or version changed. */
export function setMetadata(
  document: JsonObject,
  change: { readonly name?: string; readonly description?: string; readonly version?: string },
): JsonObject {
  return { ...document, metadata: { ...asObject(document.metadata), ...change } };
}

/** A part of a version a release changes. */
export type VersionPart = "major" | "minor" | "patch";

/** Returns a version one release on, or `null` when it is not `major.minor.patch`. */
export function bumped(version: string, part: VersionPart): string | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());

  if (match === null) {
    return null;
  }

  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];

  switch (part) {
    case "major":
      return `${String(major + 1)}.0.0`;
    case "minor":
      return `${String(major)}.${String(minor + 1)}.0`;
    case "patch":
      return `${String(major)}.${String(minor)}.${String(patch + 1)}`;
  }
}

/** Returns the document with its result read from a step's output, by name alone, or none. */
export function setResult(
  document: JsonObject,
  result: { readonly step: string | null; readonly name: string } | null,
): JsonObject {
  return {
    ...document,
    result:
      result === null
        ? null
        : result.step === null
          ? { name: result.name }
          : { producer_step_id: result.step, name: result.name },
  };
}

// Steps.

/** The ids a new step needs: its own, and its prompt's when it asks a model. */
export interface NewStepIds {
  readonly step: string;
  readonly specification?: string;
}

/**
 * Returns the document with a step added at the end: a prompt step that
 * asks a model, or a tool step, running after the steps named. A prompt
 * step without a prompt id is given its step's.
 */
export function addStep(
  document: JsonObject,
  kind: StepKind,
  ids: NewStepIds,
  after: readonly string[] = [],
): JsonObject {
  const specification: JsonObject =
    kind === "prompt"
      ? {
          metadata: {
            id: ids.specification ?? ids.step,
            name: "New step",
            description: "",
            version: "1.0.0",
          },
          template: { text: "", bindings: [] },
          model_selection: { requirements: DEFAULT_REQUIREMENTS },
        }
      : { requirement: { name: "", version: null, runtime: null } };
  const step: JsonObject = {
    id: ids.step,
    specification,
    depends_on: [...new Set(after)],
    inputs: [],
    outputs: [],
    conditions: [],
    retry_policy: DEFAULT_RETRY,
    failure_policy: "fail_workflow",
  };

  return withSteps(document, [...stepsOf(document), step]);
}

/**
 * Returns the document without a step. What named it is kept, as near to
 * working as it can be: steps no longer depend on it, its conditions go, an
 * input or the result read from it reads its name from the context instead,
 * and a step's prompt keeps every binding.
 */
export function removeStep(document: JsonObject, id: string): JsonObject {
  const fromIt = (value: JsonValue | undefined): boolean =>
    asText(asObject(value).producer_step_id) === id;
  const steps = stepsOf(document)
    .filter((step) => idOf(step) !== id)
    .map((step) => ({
      ...step,
      depends_on: asList(step.depends_on).filter((each) => each !== id),
      inputs: asList(step.inputs).map((input) => {
        const fields = asObject(input);

        return fromIt(fields.source)
          ? { ...fields, source: { name: asText(asObject(fields.source).name) ?? "" } }
          : input;
      }),
      conditions: asList(step.conditions).filter(
        (condition) => !fromIt(asObject(condition).source),
      ),
    }));
  const result = fromIt(document.result)
    ? { name: asText(asObject(document.result).name) ?? "" }
    : (document.result ?? null);

  return { ...withSteps(document, steps), result };
}

/** Returns the document with a prompt step renamed; a tool step is named by its tool. */
export function setStepName(document: JsonObject, id: string, name: string): JsonObject {
  return updateSpecification(document, id, (specification) =>
    isObject(specification.metadata)
      ? { ...specification, metadata: { ...specification.metadata, name } }
      : specification,
  );
}

/** Returns the document with a prompt step's description changed. */
export function setStepDescription(
  document: JsonObject,
  id: string,
  description: string,
): JsonObject {
  return updateSpecification(document, id, (specification) =>
    isObject(specification.metadata)
      ? { ...specification, metadata: { ...specification.metadata, description } }
      : specification,
  );
}

/**
 * Returns the document with what a step says as it starts changed, or
 * removed when it is blank; a step that says nothing shows no values either.
 */
export function setMessage(document: JsonObject, id: string, message: string): JsonObject {
  return updateStep(document, id, (step) =>
    message.trim() === "" ? without(without(step, "message"), "emit_values") : { ...step, message },
  );
}

/** Returns the document with a step's prompt changed, and its variables bound again. */
export function setPromptText(document: JsonObject, id: string, prompt: string): JsonObject {
  return updateStep(document, id, (step) => {
    const specification = asObject(step.specification);

    if (isObject(specification.template)) {
      return bound({
        ...step,
        specification: { ...specification, template: { ...specification.template, text: prompt } },
      });
    }
    if (isObject(specification.prompt)) {
      return {
        ...step,
        specification: { ...specification, prompt: { ...specification.prompt, text: prompt } },
      };
    }
    return step;
  });
}

/** Returns the document with whether a prompt step answers in text or in JSON changed. */
export function setOutputFormat(
  document: JsonObject,
  id: string,
  format: "text" | "json",
): JsonObject {
  return updateSpecification(document, id, (specification) =>
    !isObject(specification.metadata)
      ? specification
      : format === "text"
        ? without(specification, "output_format")
        : { ...specification, output_format: "json" },
  );
}

/** Returns the document with some of what a prompt step's model needs changed. */
export function setRequirements(document: JsonObject, id: string, change: JsonObject): JsonObject {
  return updateSpecification(document, id, (specification) => {
    const selection = asObject(specification.model_selection);

    return isObject(selection.requirements)
      ? {
          ...specification,
          model_selection: {
            ...selection,
            requirements: { ...selection.requirements, ...change },
          },
        }
      : specification;
  });
}

/** Returns the document with the tool a tool step runs changed. */
export function setTool(
  document: JsonObject,
  id: string,
  requirement: {
    readonly name: string;
    readonly version: string | null;
    readonly runtime: string | null;
  },
): JsonObject {
  return updateSpecification(document, id, (specification) =>
    isObject(specification.requirement) ? { ...specification, requirement } : specification,
  );
}

/** Returns the document with a step running after another, once. */
export function addDependency(document: JsonObject, id: string, on: string): JsonObject {
  return updateStep(document, id, (step) => {
    const dependencies = asList(step.depends_on);

    return dependencies.includes(on) ? step : { ...step, depends_on: [...dependencies, on] };
  });
}

/** Returns the document with a step no longer running after another. */
export function removeDependency(document: JsonObject, id: string, on: string): JsonObject {
  return updateStep(document, id, (step) => ({
    ...step,
    depends_on: asList(step.depends_on).filter((each) => each !== on),
  }));
}

/** Returns the document with a step's retries changed. */
export function setRetry(document: JsonObject, id: string, change: JsonObject): JsonObject {
  return updateStep(document, id, (step) => ({
    ...step,
    retry_policy: { ...asObject(step.retry_policy), ...change },
  }));
}

/** Returns the document with what a step does when it fails for the last time changed. */
export function setFailurePolicy(
  document: JsonObject,
  id: string,
  policy: FailurePolicy,
): JsonObject {
  return updateStep(document, id, (step) => ({ ...step, failure_policy: policy }));
}

// Inputs.

/**
 * Returns the document with an input added to a step, under the name asked
 * for or, when the step has an input of that name, one like it. A prompt
 * variable of its name binds it.
 */
export function addInput(
  document: JsonObject,
  id: string,
  name: string,
  source: Source,
): JsonObject {
  return updateStep(document, id, (step) =>
    bound({
      ...step,
      inputs: [
        ...asList(step.inputs),
        { name: uniqueName(name, namesOf(step.inputs)), source: sourceDocument(source) },
      ],
    }),
  );
}

/** Returns the document with where one of a step's inputs comes from changed. */
export function setInputSource(
  document: JsonObject,
  id: string,
  name: string,
  source: Source,
): JsonObject {
  return updateStep(document, id, (step) => ({
    ...step,
    inputs: asList(step.inputs).map((input) =>
      asText(asObject(input).name) === name
        ? { ...asObject(input), source: sourceDocument(source) }
        : input,
    ),
  }));
}

/** Returns the document with a step's input renamed, and its prompt's bindings with it. */
export function renameInput(
  document: JsonObject,
  id: string,
  name: string,
  to: string,
): JsonObject {
  return updateStep(document, id, (step) => {
    const specification = asObject(step.specification);
    const template = asObject(specification.template);
    const renamed: JsonObject = {
      ...step,
      inputs: asList(step.inputs).map((input) =>
        asText(asObject(input).name) === name ? { ...asObject(input), name: to } : input,
      ),
    };

    return isObject(specification.template)
      ? bound({
          ...renamed,
          specification: {
            ...specification,
            template: {
              ...template,
              bindings: asList(template.bindings).map((binding) =>
                asText(asObject(binding).input_name) === name
                  ? { ...asObject(binding), input_name: to }
                  : binding,
              ),
            },
          },
        })
      : renamed;
  });
}

/** Returns the document without one of a step's inputs, or the prompt bindings to it. */
export function removeInput(document: JsonObject, id: string, name: string): JsonObject {
  return updateStep(document, id, (step) =>
    bound({
      ...step,
      inputs: asList(step.inputs).filter((input) => asText(asObject(input).name) !== name),
    }),
  );
}

// Outputs.

/** Returns the document with an output added to a step, under a name it does not yet use. */
export function addOutput(
  document: JsonObject,
  id: string,
  name: string,
  path: readonly (string | number)[] = [],
): JsonObject {
  return updateStep(document, id, (step) => ({
    ...step,
    outputs: [...asList(step.outputs), { name: uniqueName(name, namesOf(step.outputs)), path }],
  }));
}

/** Returns the document with where in a step's reply one of its outputs is found changed. */
export function setOutputPath(
  document: JsonObject,
  id: string,
  name: string,
  path: readonly (string | number)[],
): JsonObject {
  return updateStep(document, id, (step) => ({
    ...step,
    outputs: asList(step.outputs).map((output) =>
      asText(asObject(output).name) === name ? { ...asObject(output), path } : output,
    ),
  }));
}

/**
 * Returns the document with a step's output renamed, and everything that
 * reads it from that step by name with it: inputs, conditions, the result,
 * and the step's confidence. What reads the name from the context is left
 * as it is.
 */
export function renameOutput(
  document: JsonObject,
  id: string,
  name: string,
  to: string,
): JsonObject {
  const renamed = (value: JsonValue): JsonValue => {
    const source = asObject(value);

    return asText(source.producer_step_id) === id && asText(source.name) === name
      ? { ...source, name: to }
      : value;
  };
  const resourced = (value: JsonValue): JsonValue => {
    const fields = asObject(value);

    return fields.source === undefined ? value : { ...fields, source: renamed(fields.source) };
  };
  const steps = stepsOf(document).map((step) => {
    const own = idOf(step) === id;
    const outputs = own
      ? asList(step.outputs).map((output) =>
          asText(asObject(output).name) === name ? { ...asObject(output), name: to } : output,
        )
      : asList(step.outputs);
    const changed: JsonObject = {
      ...step,
      outputs,
      inputs: asList(step.inputs).map(resourced),
      conditions: asList(step.conditions).map(resourced),
    };

    return own && asText(step.confidence) === name ? { ...changed, confidence: to } : changed;
  });

  return document.result === undefined
    ? withSteps(document, steps)
    : { ...withSteps(document, steps), result: renamed(document.result) };
}

/** Returns the document without one of a step's outputs; a confidence it was goes too. */
export function removeOutput(document: JsonObject, id: string, name: string): JsonObject {
  return updateStep(document, id, (step) => {
    const outputs = asList(step.outputs).filter((output) => asText(asObject(output).name) !== name);
    const kept: JsonObject = { ...step, outputs };

    return asText(step.confidence) === name ? without(kept, "confidence") : kept;
  });
}

// Conditions.

/** Returns the document with a condition added to a step: it runs only when it holds. */
export function addCondition(
  document: JsonObject,
  id: string,
  source: { readonly step: string; readonly name: string },
  operator: Operator = "equal",
  expected: JsonValue = true,
): JsonObject {
  return updateStep(document, id, (step) => ({
    ...step,
    conditions: [
      ...asList(step.conditions),
      { source: { producer_step_id: source.step, name: source.name }, operator, expected },
    ],
  }));
}

/** Returns the document with one of a step's conditions changed. */
export function setCondition(
  document: JsonObject,
  id: string,
  index: number,
  change: {
    readonly source?: { readonly step: string; readonly name: string };
    readonly operator?: Operator;
    readonly expected?: JsonValue;
  },
): JsonObject {
  return updateStep(document, id, (step) => ({
    ...step,
    conditions: asList(step.conditions).map((condition, at) => {
      if (at !== index) {
        return condition;
      }

      const fields = asObject(condition);

      return {
        ...fields,
        ...(change.source === undefined
          ? {}
          : { source: { producer_step_id: change.source.step, name: change.source.name } }),
        ...(change.operator === undefined ? {} : { operator: change.operator }),
        ...(change.expected === undefined ? {} : { expected: change.expected }),
      };
    }),
  }));
}

/** Returns the document without one of a step's conditions. */
export function removeCondition(document: JsonObject, id: string, index: number): JsonObject {
  return updateStep(document, id, (step) => ({
    ...step,
    conditions: asList(step.conditions).filter((_, at) => at !== index),
  }));
}

// Connections.

/**
 * Returns the document with one step running after another and, when an
 * output is named, reading it into an input of the output's name or the
 * one asked for.
 */
export function connect(
  document: JsonObject,
  from: string,
  to: string,
  value?: { readonly output: string; readonly input?: string },
): JsonObject {
  const ordered = addDependency(document, to, from);

  return value === undefined
    ? ordered
    : addInput(ordered, to, value.input ?? value.output, {
        kind: "step",
        step: from,
        name: value.output,
      });
}

/** Returns the steps a step depends on, directly or through others. */
export function upstreamOf(document: JsonObject, id: string): Set<string> {
  const steps = new Map(stepsOf(document).map((step) => [idOf(step), step]));
  const found = new Set<string>();
  const waiting = [id];

  for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
    for (const dependency of asList(steps.get(next)?.depends_on)) {
      const name = asText(dependency);

      if (name !== null && !found.has(name)) {
        found.add(name);
        waiting.push(name);
      }
    }
  }
  return found;
}

/**
 * Returns whether one step can run after another: both are steps of the
 * document, they are not one step, the second does not run after it
 * already, and the first does not run after the second, which would make a
 * circle.
 */
export function canConnect(document: JsonObject, from: string, to: string): boolean {
  const ids = stepsOf(document).map(idOf);

  return (
    from !== to &&
    ids.includes(from) &&
    ids.includes(to) &&
    !asList(stepsOf(document).find((step) => idOf(step) === to)?.depends_on).includes(from) &&
    !upstreamOf(document, from).has(to)
  );
}

/**
 * Returns the document with one step no longer running after another, and
 * no longer reading from it by step: those inputs, and the prompt bindings
 * to them, and those conditions go. What it reads by name stays, for
 * `problems` to point out.
 */
export function disconnect(document: JsonObject, from: string, to: string): JsonObject {
  const fromIt = (value: JsonValue | undefined): boolean =>
    asText(asObject(value).producer_step_id) === from;

  return updateStep(removeDependency(document, to, from), to, (step) =>
    bound({
      ...step,
      inputs: asList(step.inputs).filter((input) => !fromIt(asObject(input).source)),
      conditions: asList(step.conditions).filter(
        (condition) => !fromIt(asObject(condition).source),
      ),
    }),
  );
}

/** Returns the document with a step no longer reading the workflow's input. */
export function disconnectInput(document: JsonObject, id: string): JsonObject {
  return updateStep(document, id, (step) =>
    bound({
      ...step,
      inputs: asList(step.inputs).filter(
        (input) => sourceOf(asObject(input).source)?.kind !== "input",
      ),
    }),
  );
}
