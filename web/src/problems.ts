/**
 * What is wrong with a workflow document: what Azathoth would refuse when
 * it is imported, said so a person knows what to change, and attached to the
 * step it is about when there is one.
 */

import {
  asList,
  asObject,
  asText,
  idOf,
  isObject,
  sourceOf,
  stepsOf,
  variablesOf,
  type JsonObject,
  type JsonValue,
} from "./editing";

/** One thing wrong with a document, and the step it is about, if any. */
export interface Problem {
  readonly step: string | null;
  readonly message: string;
}

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

const ORDERING = new Set([
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
]);

function blank(value: JsonValue | undefined): boolean {
  return (asText(value) ?? "").trim() === "";
}

function isUuid(value: JsonValue | undefined): boolean {
  return UUID.test(asText(value) ?? "");
}

function names(values: JsonValue | undefined): string[] {
  return asList(values).map((value) => asText(asObject(value).name) ?? "");
}

function repeated(items: readonly string[]): string[] {
  return [...new Set(items.filter((item, index) => items.indexOf(item) !== index))];
}

/** Returns what a person calls a step: its prompt's name, its tool's, or neither. */
export function titleOf(step: JsonObject): string {
  const specification = asObject(step.specification);
  const name =
    asText(asObject(specification.metadata).name) ??
    asText(asObject(specification.requirement).name);

  return name === null || name.trim() === "" ? "an unnamed step" : name;
}

function upstreamOf(steps: ReadonlyMap<string, JsonObject>, id: string): Set<string> {
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

function hasCycle(steps: ReadonlyMap<string, JsonObject>): boolean {
  const done = new Set<string>();
  const open = new Set<string>();

  const visit = (id: string): boolean => {
    if (done.has(id)) {
      return false;
    }
    if (open.has(id)) {
      return true;
    }
    open.add(id);

    const looped = asList(steps.get(id)?.depends_on).some((dependency) => {
      const name = asText(dependency);

      return name !== null && name !== id && steps.has(name) && visit(name);
    });

    open.delete(id);
    done.add(id);
    return looped;
  };

  return [...steps.keys()].some(visit);
}

function workflowProblems(document: JsonObject, steps: ReadonlyMap<string, JsonObject>): string[] {
  const metadata = asObject(document.metadata);
  const found: string[] = [];

  if (!isUuid(metadata.id)) {
    found.push("The workflow's id must be a UUID.");
  }
  if (blank(metadata.name)) {
    found.push("The workflow needs a name.");
  }
  if (blank(metadata.description)) {
    found.push("The workflow needs a description.");
  }
  if (blank(metadata.version)) {
    found.push("The workflow needs a version.");
  }
  if (stepsOf(document).length === 0) {
    found.push("The workflow needs at least one step.");
  }

  const result = asObject(document.result);
  const name = asText(result.name) ?? "";

  if (!isObject(document.result) || name === "") {
    found.push("The workflow needs a result: the output that is its answer.");
  } else if ("producer_step_id" in result) {
    const producer = steps.get(asText(result.producer_step_id) ?? "");

    if (producer === undefined) {
      found.push("The result reads from a step that is not in the workflow.");
    } else if (!names(producer.outputs).includes(name)) {
      found.push(`The result reads ${name}, which ${titleOf(producer)} does not write.`);
    }
  } else if (![...steps.values()].some((step) => names(step.outputs).includes(name))) {
    found.push(`No step writes ${name}, the workflow's result.`);
  }

  if (hasCycle(steps)) {
    found.push("Its steps wait for one another in a circle.");
  }
  return found;
}

function promptProblems(step: JsonObject): string[] {
  const specification = asObject(step.specification);

  if (!isObject(specification.metadata)) {
    return blank(asObject(specification.requirement).name) ? ["It needs a tool."] : [];
  }

  const metadata = specification.metadata;
  const template = asObject(specification.template);
  const prompt = asText(template.text) ?? asText(asObject(specification.prompt).text) ?? "";
  const inputs = names(step.inputs);
  const bindings = asList(template.bindings).map(asObject);
  const found: string[] = [];

  if (blank(metadata.name)) {
    found.push("It needs a name.");
  }
  if (blank(metadata.description)) {
    found.push("It needs a description.");
  }
  if (!isUuid(metadata.id)) {
    found.push("Its prompt's id must be a UUID.");
  }
  if (prompt.trim() === "") {
    found.push("It needs a prompt.");
  }
  if (isObject(specification.template)) {
    for (const variable of variablesOf(prompt)) {
      if (!bindings.some((binding) => asText(binding.variable_name) === variable)) {
        found.push(
          `Its prompt's {${variable}} is bound to nothing: give it an input named ${variable}.`,
        );
      }
    }
    for (const binding of bindings) {
      const input = asText(binding.input_name);

      if (input !== null && !inputs.includes(input)) {
        found.push(
          `Its prompt binds {${asText(binding.variable_name) ?? ""}} to ${input}, which it does not take.`,
        );
      }
    }
  }
  return found;
}

function dependencyProblems(step: JsonObject, steps: ReadonlyMap<string, JsonObject>): string[] {
  const dependencies = asList(step.depends_on).map((value) => asText(value) ?? "");
  const found = repeated(dependencies).map(
    (id) => `It depends on ${titleOf(steps.get(id) ?? {})} twice.`,
  );

  if (dependencies.includes(idOf(step))) {
    found.push("It depends on itself.");
  }
  if (dependencies.some((id) => !steps.has(id))) {
    found.push("It depends on a step that is not in the workflow.");
  }
  return found;
}

function valueProblems(step: JsonObject, steps: ReadonlyMap<string, JsonObject>): string[] {
  const outputs = names(step.outputs);
  const inputs = names(step.inputs);
  const dependencies = asList(step.depends_on).map((value) => asText(value) ?? "");
  const upstream = upstreamOf(steps, idOf(step));
  const found: string[] = [];

  if (outputs.some((name) => name.trim() === "")) {
    found.push("One of its outputs has no name.");
  }
  found.push(...repeated(outputs).map((name) => `It writes ${name} twice.`));
  if (inputs.some((name) => name.trim() === "")) {
    found.push("One of its inputs has no name.");
  }
  found.push(...repeated(inputs).map((name) => `It takes ${name} twice.`));

  for (const input of asList(step.inputs).map(asObject)) {
    const name = asText(input.name) ?? "";
    const source = sourceOf(input.source);

    if (source === null) {
      found.push(`Its input ${name} comes from nowhere.`);
    } else if (source.kind === "context") {
      const declared = dependencies.some((id) =>
        names(steps.get(id)?.outputs).includes(source.name),
      );

      if (!declared) {
        found.push(
          `Its input ${name} reads ${source.name} by name, but no step it depends on writes it.`,
        );
      }
    } else if (source.kind === "step") {
      const producer = steps.get(source.step);

      if (producer === undefined) {
        found.push(`Its input ${name} reads from a step that is not in the workflow.`);
      } else if (!names(producer.outputs).includes(source.name)) {
        found.push(
          `Its input ${name} reads ${source.name}, which ${titleOf(producer)} does not write.`,
        );
      } else if (!upstream.has(source.step)) {
        found.push(
          `Its input ${name} reads from ${titleOf(producer)}, which it does not depend on.`,
        );
      }
    }
  }

  for (const condition of asList(step.conditions).map(asObject)) {
    const source = asObject(condition.source);
    const name = asText(source.name) ?? "";
    const producer = steps.get(asText(source.producer_step_id) ?? "");

    if (producer === undefined) {
      found.push("One of its conditions reads from a step that is not in the workflow.");
    } else if (!names(producer.outputs).includes(name)) {
      found.push(`One of its conditions reads ${name}, which ${titleOf(producer)} does not write.`);
    } else if (
      ORDERING.has(asText(condition.operator) ?? "") &&
      typeof condition.expected !== "number"
    ) {
      found.push(`One of its conditions compares ${name} with something that is not a number.`);
    }
  }
  return found;
}

function runningProblems(step: JsonObject): string[] {
  const retry = asObject(step.retry_policy);
  const attempts = retry.max_attempts ?? 1;
  const first = retry.initial_delay_seconds ?? 0;
  const backoff = retry.backoff_multiplier ?? 1;
  const longest = retry.maximum_delay_seconds ?? null;
  const confidence = asText(step.confidence);
  const found: string[] = [];

  if (typeof attempts !== "number" || !Number.isInteger(attempts) || attempts < 1) {
    found.push("It must try at least once.");
  }
  if (typeof first !== "number" || first < 0) {
    found.push("Its first retry cannot wait less than no time.");
  }
  if (typeof backoff !== "number" || backoff < 1) {
    found.push("Its retries cannot wait less each time.");
  }
  if (typeof longest === "number" && typeof first === "number" && longest < first) {
    found.push("Its longest wait between retries cannot be shorter than its first.");
  }
  if (confidence !== null && !names(step.outputs).includes(confidence)) {
    found.push(`Its confidence, ${confidence}, is not one of its outputs.`);
  }
  if (step.emit_values === true && blank(step.message)) {
    found.push("It shows its values as it runs, so it needs a message to show them with.");
  }
  if (step.emit_values === true && asList(step.outputs).length === 0) {
    found.push("It shows its values as it runs, so it needs outputs to show.");
  }
  return found;
}

/**
 * Returns everything wrong with a workflow document, the workflow's own
 * problems first, then each step's in step order.
 */
export function problems(document: JsonObject): Problem[] {
  const all = stepsOf(document);
  const steps = new Map(all.map((step) => [idOf(step), step]));
  const found: Problem[] = workflowProblems(document, steps).map((message) => ({
    step: null,
    message,
  }));

  for (const id of repeated(all.map(idOf))) {
    found.push({ step: id, message: "Another step has its id." });
  }

  for (const step of all) {
    const id = idOf(step);

    found.push(
      ...[
        ...(isUuid(step.id) ? [] : ["Its id must be a UUID."]),
        ...promptProblems(step),
        ...dependencyProblems(step, steps),
        ...valueProblems(step, steps),
        ...runningProblems(step),
      ].map((message) => ({ step: id, message })),
    );
  }
  return found;
}
