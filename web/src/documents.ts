/**
 * Readable views of the documents Azathoth keeps: a workflow's steps, a
 * tool's fields, implementations and tests, and a benchmark's cases.
 *
 * Documents arrive as JSON the editor did not write, from whatever version
 * of Azathoth made them, so every read here is defensive: anything missing
 * or unexpected is left out, never trusted, and the raw document is always
 * shown beside the view.
 */

type Record_ = Readonly<Record<string, unknown>>;

function record(value: unknown): Record_ | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record_)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function texts(value: unknown): string[] {
  return list(value).filter((item): item is string => typeof item === "string");
}

function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const PREVIEW_LENGTH = 200;

/** Returns a value as a short line: text as it is, anything else as compact JSON. */
export function preview(value: unknown): string {
  const shown =
    typeof value === "string" ? value : value === undefined ? "nothing" : JSON.stringify(value);

  return shown.length > PREVIEW_LENGTH ? `${shown.slice(0, PREVIEW_LENGTH - 1)}…` : shown;
}

/**
 * Where a value a step reads comes from: the workflow's input, an output of
 * a named step, whatever the context holds under a name, or a constant.
 */
export type SourceView =
  | { readonly kind: "input"; readonly field: string }
  | { readonly kind: "step"; readonly step: string; readonly name: string | null }
  | { readonly kind: "context"; readonly name: string }
  | { readonly kind: "constant"; readonly value: string }
  | { readonly kind: "unknown" };

/** One input of a step, and where its value comes from, in words and as a source. */
export interface InputView {
  readonly name: string;
  readonly from: string;
  readonly source: SourceView;
}

/** One condition a step runs on: the value it tests, and the test, such as "is true". */
export interface ConditionView {
  readonly source: SourceView;
  readonly test: string;
}

/** One step of a workflow, as a person reads it. */
export interface StepView {
  readonly id: string;
  readonly title: string;
  readonly kind: "prompt" | "tool" | "unknown";
  readonly description: string | null;
  readonly message: string | null;
  readonly tool: string | null;
  readonly runtime: string | null;
  readonly prompt: string | null;
  readonly answers: string | null;
  readonly needs: readonly string[];
  readonly dependsOn: readonly string[];
  readonly after: readonly string[];
  readonly inputs: readonly InputView[];
  readonly outputs: readonly string[];
  readonly conditions: readonly string[];
  readonly when: readonly ConditionView[];
  readonly attempts: number | null;
  readonly onFailure: string | null;
}

/** A workflow, as a person reads it: its steps, and the output that is its result. */
export interface WorkflowView {
  readonly steps: readonly StepView[];
  readonly result: string | null;
}

function joined(words: readonly string[]): string {
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;
}

function modelNeeds(specification: Record_): string[] {
  const requirements = record(record(specification.model_selection)?.requirements);

  if (requirements === null) {
    return [];
  }

  const needs = texts(requirements.required_capabilities);
  const reads = texts(requirements.required_input_modalities);
  const writes = texts(requirements.required_output_modalities);
  const context = wholeNumber(requirements.minimum_context_window_tokens);
  const output = wholeNumber(requirements.minimum_output_tokens);
  const inputPrice = wholeNumber(requirements.maximum_input_usd_per_million_tokens);
  const outputPrice = wholeNumber(requirements.maximum_output_usd_per_million_tokens);

  if (reads.length > 0 && reads.join() !== "text") {
    needs.push(`Reads ${joined(reads)}`);
  }
  if (writes.length > 0 && writes.join() !== "text") {
    needs.push(`Writes ${joined(writes)}`);
  }
  if (context !== null) {
    needs.push(`At least ${context.toLocaleString("en")} tokens of context`);
  }
  if (output !== null) {
    needs.push(`At least ${output.toLocaleString("en")} output tokens`);
  }
  if (inputPrice !== null) {
    needs.push(`Input at most $${String(inputPrice)} per million tokens`);
  }
  if (outputPrice !== null) {
    needs.push(`Output at most $${String(outputPrice)} per million tokens`);
  }
  if (requirements.require_known_pricing === true) {
    needs.push("Known pricing");
  }

  return needs;
}

const OPERATORS: Readonly<Record<string, string>> = {
  equal: "is",
  not_equal: "is not",
};

function stepTitle(step: Record_): string {
  const specification = record(step.specification);

  return (
    text(record(specification?.metadata)?.name) ??
    text(record(specification?.requirement)?.name) ??
    "Unnamed step"
  );
}

function sourceOf(value: unknown): SourceView {
  const source = record(value) ?? {};

  if (text(source.event_type) !== null) {
    return { kind: "input", field: text(source.field_name) ?? "input" };
  }
  if ("producer_step_id" in source) {
    const step = text(source.producer_step_id);

    return step === null ? { kind: "unknown" } : { kind: "step", step, name: text(source.name) };
  }
  if ("value" in source) {
    return { kind: "constant", value: preview(source.value) };
  }

  const name = text(source.name);

  return name === null ? { kind: "unknown" } : { kind: "context", name };
}

/**
 * Returns the ids of the steps a step must run after: those it depends on,
 * and those whose outputs it reads by name, in its inputs or its conditions.
 */
export function precursorsOf(step: StepView): string[] {
  const named = [...step.inputs, ...step.when].flatMap(({ source }) =>
    source.kind === "step" ? [source.step] : [],
  );

  return [...new Set([...step.dependsOn, ...named])];
}

/** Returns a workflow document as a person reads it. */
export function describeWorkflow(document: Record_): WorkflowView {
  const steps = list(document.steps).map((step) => record(step) ?? {});
  const titles = new Map<string, string>();

  for (const step of steps) {
    const id = text(step.id);

    if (id !== null) {
      titles.set(id, stepTitle(step));
    }
  }

  const titleOf = (id: unknown): string => {
    const known = text(id);

    return known === null ? "an unknown step" : (titles.get(known) ?? known);
  };

  const describeSource = (source: SourceView): string => {
    switch (source.kind) {
      case "input":
        return source.field === "input" ? "the workflow's input" : `the workflow's ${source.field}`;
      case "step":
        return `${titleOf(source.step)}: ${source.name ?? "its output"}`;
      case "constant":
        return `the constant ${source.value}`;
      case "context":
        return `the context's ${source.name}`;
      case "unknown":
        return "an unknown source";
    }
  };

  return {
    steps: steps.map((step): StepView => {
      const specification = record(step.specification) ?? {};
      const requirement = record(specification.requirement);
      const prompt =
        text(record(specification.template)?.text) ?? text(record(specification.prompt)?.text);
      const kind = requirement !== null ? "tool" : prompt !== null ? "prompt" : "unknown";
      const failure = text(step.failure_policy);
      const when = list(step.conditions).map((condition): ConditionView => {
        const fields = record(condition) ?? {};
        const operator = text(fields.operator) ?? "matches";
        const test = OPERATORS[operator] ?? operator.replaceAll("_", " ");

        return { source: sourceOf(fields.source), test: `${test} ${preview(fields.expected)}` };
      });

      return {
        id: text(step.id) ?? "",
        title: stepTitle(step),
        kind,
        description: text(record(specification.metadata)?.description),
        message: text(step.message),
        tool:
          requirement === null
            ? null
            : [text(requirement.name), text(requirement.version)].filter(Boolean).join(" "),
        runtime: text(requirement?.runtime),
        prompt,
        answers: kind === "prompt" && specification.output_format === "json" ? "JSON" : null,
        needs: kind === "prompt" ? modelNeeds(specification) : [],
        dependsOn: texts(step.depends_on),
        after: list(step.depends_on).map(titleOf),
        inputs: list(step.inputs).map((input) => {
          const fields = record(input) ?? {};
          const source = sourceOf(fields.source);

          return { name: text(fields.name) ?? "unnamed", from: describeSource(source), source };
        }),
        outputs: list(step.outputs)
          .map((output) => text(record(output)?.name))
          .filter((name): name is string => name !== null),
        conditions: when.map(
          (condition) => `${describeSource(condition.source)} ${condition.test}`,
        ),
        when,
        attempts: wholeNumber(record(step.retry_policy)?.max_attempts),
        onFailure:
          failure === null
            ? null
            : failure === "fail_workflow"
              ? "fails the workflow"
              : failure.replaceAll("_", " "),
      };
    }),
    result: text(record(document.result)?.name),
  };
}

/**
 * Returns a workflow's steps in layers: each step one layer after the
 * deepest of its precursors, so a layer's steps can run at once, each layer
 * in the document's order.
 *
 * Returns `null` when the steps cannot be layered: a step without an id, two
 * with the same id, a precursor that is not there, or a cycle.
 */
export function layers(view: WorkflowView): StepView[][] | null {
  const byId = new Map<string, StepView>();

  for (const step of view.steps) {
    if (step.id === "" || byId.has(step.id)) {
      return null;
    }
    byId.set(step.id, step);
  }

  const depths = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (step: StepView): number | null => {
    const known = depths.get(step.id);

    if (known !== undefined) {
      return known;
    }
    if (visiting.has(step.id)) {
      return null;
    }
    visiting.add(step.id);

    let depth = 0;

    for (const id of precursorsOf(step)) {
      const dependency = byId.get(id);
      const below = dependency === undefined ? null : depthOf(dependency);

      if (below === null) {
        return null;
      }
      depth = Math.max(depth, below + 1);
    }

    visiting.delete(step.id);
    depths.set(step.id, depth);

    return depth;
  };

  const grouped: StepView[][] = [];

  for (const step of view.steps) {
    const depth = depthOf(step);

    if (depth === null) {
      return null;
    }
    while (grouped.length <= depth) {
      grouped.push([]);
    }
    grouped[depth]?.push(step);
  }

  return grouped;
}

/** One field of a tool's input or output. */
export interface FieldView {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string | null;
}

/** One implementation of a tool version. */
export interface ImplementationView {
  readonly id: string;
  readonly version: string | null;
  readonly runtime: string | null;
  readonly entrypoint: string | null;
  readonly source: string | null;
}

/** One test of a tool version. */
export interface ToolTestView {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly inputs: string;
  readonly expected: string;
}

/** A tool version, as a person reads it. */
export interface ToolView {
  readonly inputs: readonly FieldView[];
  readonly outputs: readonly FieldView[];
  readonly implementations: readonly ImplementationView[];
  readonly tests: readonly ToolTestView[];
}

function typeName(schema: Record_): string {
  const choices = list(schema.enum);

  if (choices.length > 0) {
    return `one of ${choices.map(preview).join(", ")}`;
  }

  const types = Array.isArray(schema.type) ? texts(schema.type) : texts([schema.type]);

  if (types.length === 1 && types[0] === "array") {
    const items = record(schema.items);

    return items === null ? "array" : `array of ${typeName(items)}`;
  }

  return types.length === 0 ? "any" : types.join(" or ");
}

function fieldsOf(schemaHolder: unknown): FieldView[] {
  const schema = record(record(schemaHolder)?.json_schema) ?? {};
  const properties = record(schema.properties) ?? {};
  const required = new Set(texts(schema.required));

  return Object.entries(properties).map(([name, value]) => {
    const property = record(value) ?? {};

    return {
      name,
      type: typeName(property),
      required: required.has(name),
      description: text(property.description),
    };
  });
}

/** Returns a tool document as a person reads it. */
export function describeTool(document: Record_): ToolView {
  const definition = record(document.definition) ?? {};

  return {
    inputs: fieldsOf(definition.input_schema),
    outputs: fieldsOf(definition.output_schema),
    implementations: list(document.implementations).map((value) => {
      const implementation = record(value) ?? {};

      return {
        id: text(implementation.id) ?? "",
        version: text(implementation.version),
        runtime: text(implementation.runtime),
        entrypoint: text(implementation.entrypoint),
        source: text(implementation.source),
      };
    }),
    tests: list(document.test_cases).map((value) => {
      const test = record(value) ?? {};

      return {
        id: text(test.id) ?? "",
        name: text(test.name) ?? "Unnamed test",
        description: text(test.description),
        inputs: preview(test.inputs),
        expected: preview(test.expected_output),
      };
    }),
  };
}

/** One benchmark case. */
export interface CaseView {
  readonly id: string;
  readonly input: string;
  readonly expected: string;
  readonly comparison: string | null;
  readonly description: string | null;
}

/** A benchmark, as a person reads it. */
export interface BenchmarkView {
  readonly cases: readonly CaseView[];
}

/** Returns a benchmark document as a person reads it. */
export function describeBenchmark(document: Record_): BenchmarkView {
  return {
    cases: list(document.cases).map((value) => {
      const fields = record(value) ?? {};
      const expected = record(fields.expected) ?? {};

      return {
        id: text(fields.id) ?? "",
        input: preview(fields.input),
        expected: preview(expected.value),
        comparison: text(expected.comparison),
        description: text(expected.description),
      };
    }),
  };
}
