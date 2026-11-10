import { describe, expect, it } from "vitest";

import {
  addCondition,
  addDependency,
  asObject,
  addInput,
  addOutput,
  addStep,
  asList,
  bumped,
  canConnect,
  connect,
  DEFAULT_REQUIREMENTS,
  DEFAULT_RETRY,
  disconnect,
  disconnectInput,
  isObject,
  isUuid,
  newWorkflow,
  removeCondition,
  removeDependency,
  removeInput,
  removeOutput,
  removeStep,
  renameInput,
  replaceStep,
  renameOutput,
  setCondition,
  setFailurePolicy,
  setInputSource,
  setMessage,
  setMetadata,
  setOutputFormat,
  setOutputPath,
  setPromptText,
  setRequirements,
  setResult,
  setRetry,
  setStepDescription,
  setStepName,
  setTool,
  sourceDocument,
  sourceOf,
  stepsOf,
  uniqueName,
  upstreamOf,
  variablesOf,
  WORKFLOW_INPUT,
  type JsonObject,
  withIds,
} from "./editing";
import { uuid, VALID_DOCUMENT } from "./test/documents";

const DOCUMENT = VALID_DOCUMENT;
const PICK = uuid(11);
const SUMMARIZE = uuid(12);

function step(document: JsonObject, id: string): JsonObject {
  const found = stepsOf(document).find((each) => each.id === id);

  if (found === undefined) {
    throw new Error(`no step ${id}`);
  }
  return found;
}

function template(document: JsonObject, id: string): unknown {
  return (step(document, id).specification as { template?: unknown }).template;
}

describe("variablesOf", () => {
  it("finds each variable once, in the order they first appear", () => {
    expect(variablesOf("{a} and {b}, then {a} again")).toEqual(["a", "b"]);
  });

  it("reads a doubled brace as a brace", () => {
    expect(variablesOf('Reply {{"verdict": "pass"}} about {change}')).toEqual(["change"]);
  });

  it("takes a variable's name before its conversion or format", () => {
    expect(variablesOf("{score:.2f} {name!r}")).toEqual(["score", "name"]);
  });

  it("ignores an empty or unclosed field", () => {
    expect(variablesOf("{} {  } {open")).toEqual([]);
  });
});

describe("uniqueName", () => {
  it("keeps a free name, and numbers one that is taken", () => {
    expect(uniqueName("notes", [])).toBe("notes");
    expect(uniqueName("notes", ["notes"])).toBe("notes_2");
    expect(uniqueName("notes", ["notes", "notes_2"])).toBe("notes_3");
  });
});

describe("sources", () => {
  it("writes each kind of source as a document does, and reads it back", () => {
    const sources = [
      WORKFLOW_INPUT,
      { kind: "step", step: PICK, name: "text" },
      { kind: "context", name: "notes" },
      { kind: "constant", value: { limit: 3 } },
    ] as const;

    expect(sources.map(sourceDocument)).toEqual([
      { event_type: "workflow.input.received", field_name: "input" },
      { producer_step_id: PICK, name: "text" },
      { name: "notes" },
      { value: { limit: 3 } },
    ]);
    expect(sources.map((source) => sourceOf(sourceDocument(source)))).toEqual(sources);
  });

  it("reads a constant of null, and knows a source that names nothing", () => {
    expect(sourceOf({ value: null })).toEqual({ kind: "constant", value: null });
    expect(sourceOf({})).toBeNull();
    expect(sourceOf("text")).toBeNull();
  });
});

describe("newWorkflow", () => {
  const document = newWorkflow({ workflow: uuid(1), step: uuid(2), specification: uuid(3) });

  it("answers the workflow's input with one prompt step whose answer is the result", () => {
    expect(document).toEqual({
      metadata: { id: uuid(1), name: "New workflow", description: "", version: "1.0.0" },
      steps: [
        {
          id: uuid(2),
          specification: {
            metadata: { id: uuid(3), name: "Answer", description: "", version: "1.0.0" },
            template: {
              text: "{input}",
              bindings: [{ variable_name: "input", input_name: "input" }],
            },
            model_selection: { requirements: DEFAULT_REQUIREMENTS },
          },
          depends_on: [],
          inputs: [
            {
              name: "input",
              source: { event_type: "workflow.input.received", field_name: "input" },
            },
          ],
          outputs: [{ name: "answer", path: [] }],
          conditions: [],
          retry_policy: DEFAULT_RETRY,
          failure_policy: "fail_workflow",
        },
      ],
      result: { name: "answer" },
    });
  });

  it("takes the name it is given", () => {
    expect(
      newWorkflow({ workflow: uuid(1), step: uuid(2), specification: uuid(3) }, "triage").metadata,
    ).toMatchObject({ name: "triage" });
  });
});

describe("the workflow's metadata and result", () => {
  it("changes a name, a description or a version, and keeps the rest", () => {
    expect(setMetadata(DOCUMENT, { version: "1.1.0" }).metadata).toEqual({
      ...asObject(DOCUMENT.metadata),
      version: "1.1.0",
    });
  });

  it("reads the result from a step, by name alone, or from nowhere", () => {
    expect(setResult(DOCUMENT, { step: PICK, name: "text" }).result).toEqual({
      producer_step_id: PICK,
      name: "text",
    });
    expect(setResult(DOCUMENT, { step: null, name: "summary" }).result).toEqual({
      name: "summary",
    });
    expect(setResult(DOCUMENT, null).result).toBeNull();
  });

  it("bumps a version one release on", () => {
    expect(bumped("1.2.3", "patch")).toBe("1.2.4");
    expect(bumped("1.2.3", "minor")).toBe("1.3.0");
    expect(bumped("1.2.3", "major")).toBe("2.0.0");
    expect(bumped(" 0.9.9 ", "minor")).toBe("0.10.0");
    expect(bumped("1.2", "patch")).toBeNull();
    expect(bumped("v1.2.3", "patch")).toBeNull();
  });

  it("leaves the document it was given as it was", () => {
    const before = JSON.stringify(DOCUMENT);

    setMetadata(DOCUMENT, { name: "other" });
    removeStep(DOCUMENT, PICK);
    setPromptText(DOCUMENT, SUMMARIZE, "{other}");

    expect(JSON.stringify(DOCUMENT)).toBe(before);
  });
});

describe("adding and removing steps", () => {
  it("adds a prompt step at the end, after the steps it names", () => {
    const added = addStep(DOCUMENT, "prompt", { step: uuid(13), specification: uuid(23) }, [
      SUMMARIZE,
      SUMMARIZE,
    ]);

    expect(stepsOf(added).map((each) => each.id)).toEqual([PICK, SUMMARIZE, uuid(13)]);
    expect(step(added, uuid(13))).toEqual({
      id: uuid(13),
      specification: {
        metadata: { id: uuid(23), name: "New step", description: "", version: "1.0.0" },
        template: { text: "", bindings: [] },
        model_selection: { requirements: DEFAULT_REQUIREMENTS },
      },
      depends_on: [SUMMARIZE],
      inputs: [],
      outputs: [],
      conditions: [],
      retry_policy: DEFAULT_RETRY,
      failure_policy: "fail_workflow",
    });
  });

  it("adds a tool step, and gives a prompt without its own id its step's", () => {
    expect(step(addStep(DOCUMENT, "tool", { step: uuid(13) }), uuid(13)).specification).toEqual({
      requirement: { name: "", version: null, runtime: null },
    });
    expect(
      step(addStep(DOCUMENT, "prompt", { step: uuid(14) }), uuid(14)).specification,
    ).toMatchObject({ metadata: { id: uuid(14) } });
  });

  it("removes a step, and keeps what read from it as near to working as it can", () => {
    const removed = removeStep(DOCUMENT, PICK);
    const summarize = step(removed, SUMMARIZE);

    expect(stepsOf(removed).map((each) => each.id)).toEqual([SUMMARIZE]);
    expect(summarize.depends_on).toEqual([]);
    expect(summarize.inputs).toEqual([{ name: "ticket", source: { name: "text" } }]);
    expect(summarize.conditions).toEqual([]);
    expect(template(removed, SUMMARIZE)).toEqual(template(DOCUMENT, SUMMARIZE));
  });

  it("replaces a step as written, keeping its id and its place", () => {
    const replaced = replaceStep(DOCUMENT, PICK, { id: uuid(99), confidence: "length" });

    expect(stepsOf(replaced).map((each) => each.id)).toEqual([PICK, SUMMARIZE]);
    expect(step(replaced, PICK)).toEqual({ id: PICK, confidence: "length" });
    expect(step(replaced, SUMMARIZE)).toBe(step(DOCUMENT, SUMMARIZE));
  });

  it("keeps the id the editor made for a prompt, whatever the step's JSON says", () => {
    const summarize = step(DOCUMENT, SUMMARIZE);
    const specification = asObject(summarize.specification);
    const replaced = replaceStep(DOCUMENT, SUMMARIZE, {
      ...summarize,
      specification: {
        ...specification,
        metadata: { ...asObject(specification.metadata), id: "typed", name: "Shorten" },
      },
    });

    expect(asObject(step(replaced, SUMMARIZE).specification).metadata).toMatchObject({
      id: uuid(22),
      name: "Shorten",
    });
  });

  it("reads the result by name once the step it came from is gone", () => {
    expect(removeStep(DOCUMENT, SUMMARIZE).result).toEqual({ name: "summary" });
    expect(removeStep(setResult(DOCUMENT, { step: null, name: "summary" }), PICK).result).toEqual({
      name: "summary",
    });
  });
});

describe("what a step is", () => {
  it("renames and describes a prompt step, and leaves a tool step to its tool", () => {
    const named = setStepDescription(
      setStepName(DOCUMENT, SUMMARIZE, "Sum up"),
      SUMMARIZE,
      "Briefly.",
    );

    expect(step(named, SUMMARIZE).specification).toMatchObject({
      metadata: { name: "Sum up", description: "Briefly." },
    });
    expect(setStepName(DOCUMENT, PICK, "Pick")).toEqual(DOCUMENT);
    expect(setStepDescription(DOCUMENT, PICK, "Pick")).toEqual(DOCUMENT);
  });

  it("changes what a step says as it starts, and removes it, and showing values with it", () => {
    expect(step(setMessage(DOCUMENT, PICK, "Picking"), PICK).message).toBe("Picking");

    const showing = {
      ...DOCUMENT,
      steps: [step(DOCUMENT, PICK), { ...step(DOCUMENT, SUMMARIZE), emit_values: true }],
    };
    const silent = step(setMessage(showing, SUMMARIZE, "  "), SUMMARIZE);

    expect("message" in silent).toBe(false);
    expect("emit_values" in silent).toBe(false);
  });

  it("answers in JSON, or in text as a document leaves unsaid", () => {
    const json = setOutputFormat(DOCUMENT, SUMMARIZE, "json");

    expect(step(json, SUMMARIZE).specification).toMatchObject({ output_format: "json" });
    expect(
      "output_format" in
        (step(setOutputFormat(json, SUMMARIZE, "text"), SUMMARIZE).specification as object),
    ).toBe(false);
    expect(setOutputFormat(DOCUMENT, PICK, "json")).toEqual(DOCUMENT);
  });

  it("changes some of what a prompt's model needs, and keeps the rest", () => {
    const needs = setRequirements(DOCUMENT, SUMMARIZE, { minimum_context_window_tokens: 128000 });

    expect(step(needs, SUMMARIZE).specification).toMatchObject({
      model_selection: {
        requirements: { required_capabilities: [], minimum_context_window_tokens: 128000 },
      },
    });
    expect(setRequirements(DOCUMENT, PICK, { require_known_pricing: true })).toEqual(DOCUMENT);
  });

  it("leaves a model chosen by name to its name", () => {
    const fixed = {
      ...DOCUMENT,
      steps: [
        {
          ...step(DOCUMENT, SUMMARIZE),
          specification: {
            ...(step(DOCUMENT, SUMMARIZE).specification as JsonObject),
            model_selection: { provider: "openrouter", model: "x" },
          },
        },
      ],
    };

    expect(setRequirements(fixed, SUMMARIZE, { require_known_pricing: true })).toEqual(fixed);
  });

  it("changes the tool a tool step runs, and no prompt's", () => {
    const tool = { name: "count_words", version: "1.0.0", runtime: null };

    expect(step(setTool(DOCUMENT, PICK, tool), PICK).specification).toEqual({ requirement: tool });
    expect(setTool(DOCUMENT, SUMMARIZE, tool)).toEqual(DOCUMENT);
  });

  it("changes how a step retries, and what it does when it fails", () => {
    const changed = setFailurePolicy(
      setRetry(DOCUMENT, PICK, { max_attempts: 3 }),
      PICK,
      "continue",
    );

    expect(step(changed, PICK).retry_policy).toEqual({ ...DEFAULT_RETRY, max_attempts: 3 });
    expect(step(changed, PICK).failure_policy).toBe("continue");
  });

  it("depends on a step once, and no longer", () => {
    const after = addDependency(addDependency(DOCUMENT, SUMMARIZE, uuid(13)), SUMMARIZE, uuid(13));

    expect(step(after, SUMMARIZE).depends_on).toEqual([PICK, uuid(13)]);
    expect(step(removeDependency(after, SUMMARIZE, PICK), SUMMARIZE).depends_on).toEqual([
      uuid(13),
    ]);
  });
});

describe("a prompt and its variables", () => {
  it("binds a new variable to the input of its name, and drops a binding whose variable goes", () => {
    const withInput = addInput(DOCUMENT, SUMMARIZE, "tone", { kind: "constant", value: "brief" });
    const changed = setPromptText(
      withInput,
      SUMMARIZE,
      "Summarize {ticket} in a {tone} way. {style}",
    );

    expect(template(changed, SUMMARIZE)).toEqual({
      text: "Summarize {ticket} in a {tone} way. {style}",
      bindings: [
        { variable_name: "ticket", input_name: "ticket" },
        { variable_name: "tone", input_name: "tone" },
      ],
    });
    expect(template(setPromptText(changed, SUMMARIZE, "Just {tone}."), SUMMARIZE)).toEqual({
      text: "Just {tone}.",
      bindings: [{ variable_name: "tone", input_name: "tone" }],
    });
  });

  it("keeps a variable bound to an input of another name, or to an event", () => {
    const bindings: JsonObject[] = [
      { variable_name: "body", input_name: "ticket" },
      { variable_name: "who", event_type: "customer.message.received", field_name: "name" },
    ];
    const custom: JsonObject = {
      ...DOCUMENT,
      steps: [
        {
          ...step(DOCUMENT, SUMMARIZE),
          specification: {
            ...(step(DOCUMENT, SUMMARIZE).specification as JsonObject),
            template: { text: "{body}", bindings },
          },
        },
      ],
    };

    expect(template(setPromptText(custom, SUMMARIZE, "{who}: {body}"), SUMMARIZE)).toEqual({
      text: "{who}: {body}",
      bindings: [bindings[1], bindings[0]],
    });
  });

  it("binds a variable waiting for an input when the input arrives", () => {
    const waiting = setPromptText(DOCUMENT, SUMMARIZE, "{ticket} {tone}");

    expect(template(addInput(waiting, SUMMARIZE, "tone", WORKFLOW_INPUT), SUMMARIZE)).toMatchObject(
      {
        bindings: [
          { variable_name: "ticket", input_name: "ticket" },
          { variable_name: "tone", input_name: "tone" },
        ],
      },
    );
  });

  it("changes the text of a prompt written out in full", () => {
    const fixed = {
      ...DOCUMENT,
      steps: [
        {
          ...step(DOCUMENT, SUMMARIZE),
          specification: {
            metadata: { id: uuid(22), name: "Fixed", description: "Fixed.", version: "1.0.0" },
            prompt: { text: "Say hello." },
            model_selection: { requirements: DEFAULT_REQUIREMENTS },
          },
        },
      ],
    };

    expect(
      step(setPromptText(fixed, SUMMARIZE, "Say {bye}."), SUMMARIZE).specification,
    ).toMatchObject({
      prompt: { text: "Say {bye}." },
    });
    expect(setPromptText(DOCUMENT, PICK, "x")).toEqual(DOCUMENT);
  });
});

describe("inputs", () => {
  it("adds an input under a name the step does not yet use", () => {
    const added = addInput(DOCUMENT, SUMMARIZE, "ticket", { kind: "context", name: "notes" });

    expect(step(added, SUMMARIZE).inputs).toEqual([
      { name: "ticket", source: { producer_step_id: PICK, name: "text" } },
      { name: "ticket_2", source: { name: "notes" } },
    ]);
  });

  it("changes where an input comes from", () => {
    expect(
      step(setInputSource(DOCUMENT, PICK, "path", { kind: "constant", value: [] }), PICK).inputs,
    ).toEqual([
      { name: "value", source: { event_type: "workflow.input.received", field_name: "input" } },
      { name: "path", source: { value: [] } },
    ]);
  });

  it("renames an input and its prompt's binding with it", () => {
    const renamed = renameInput(DOCUMENT, SUMMARIZE, "ticket", "body");

    expect(step(renamed, SUMMARIZE).inputs).toEqual([
      { name: "body", source: { producer_step_id: PICK, name: "text" } },
    ]);
    expect(template(renamed, SUMMARIZE)).toMatchObject({
      bindings: [{ variable_name: "ticket", input_name: "body" }],
    });
    expect(step(renameInput(DOCUMENT, PICK, "path", "where"), PICK).inputs).toMatchObject([
      { name: "value" },
      { name: "where" },
    ]);
  });

  it("removes an input and the binding to it", () => {
    const removed = removeInput(DOCUMENT, SUMMARIZE, "ticket");

    expect(step(removed, SUMMARIZE).inputs).toEqual([]);
    expect(template(removed, SUMMARIZE)).toMatchObject({ bindings: [] });
  });
});

describe("outputs", () => {
  it("adds an output under a name the step does not yet use, at a path", () => {
    expect(step(addOutput(DOCUMENT, PICK, "text", ["raw"]), PICK).outputs).toEqual([
      { name: "text", path: ["value"] },
      { name: "length", path: ["length"] },
      { name: "text_2", path: ["raw"] },
    ]);
  });

  it("changes where an output is found in a step's reply", () => {
    expect(step(setOutputPath(DOCUMENT, PICK, "length", ["size", 0]), PICK).outputs).toEqual([
      { name: "text", path: ["value"] },
      { name: "length", path: ["size", 0] },
    ]);
  });

  it("renames an output and everything that reads it from that step", () => {
    const withConfidence = {
      ...DOCUMENT,
      steps: [{ ...step(DOCUMENT, PICK), confidence: "length" }, step(DOCUMENT, SUMMARIZE)],
    };
    const renamed = renameOutput(withConfidence, PICK, "length", "size");

    expect(step(renamed, PICK).outputs).toEqual([
      { name: "text", path: ["value"] },
      { name: "size", path: ["length"] },
    ]);
    expect(step(renamed, PICK).confidence).toBe("size");
    expect(step(renamed, SUMMARIZE).conditions).toEqual([
      { source: { producer_step_id: PICK, name: "size" }, operator: "greater_than", expected: 0 },
    ]);
    expect(step(renamed, SUMMARIZE).inputs).toEqual(step(DOCUMENT, SUMMARIZE).inputs);
    expect(renameOutput(DOCUMENT, SUMMARIZE, "summary", "brief").result).toEqual({
      producer_step_id: SUMMARIZE,
      name: "brief",
    });
  });

  it("leaves what reads an output by name alone, and a document without a result without one", () => {
    const byName = setInputSource(DOCUMENT, SUMMARIZE, "ticket", { kind: "context", name: "text" });
    const noResult = Object.fromEntries(Object.entries(byName).filter(([key]) => key !== "result"));
    const renamed = renameOutput(noResult, PICK, "text", "body");

    expect(step(renamed, SUMMARIZE).inputs).toEqual([{ name: "ticket", source: { name: "text" } }]);
    expect("result" in renamed).toBe(false);
  });

  it("removes an output, and a confidence it was", () => {
    const withConfidence = {
      ...DOCUMENT,
      steps: [{ ...step(DOCUMENT, PICK), confidence: "length" }],
    };
    const removed = step(removeOutput(withConfidence, PICK, "length"), PICK);

    expect(removed.outputs).toEqual([{ name: "text", path: ["value"] }]);
    expect("confidence" in removed).toBe(false);
    expect(step(removeOutput(withConfidence, PICK, "text"), PICK).confidence).toBe("length");
  });
});

describe("conditions", () => {
  it("adds a condition, true by default, and changes and removes one", () => {
    const added = addCondition(DOCUMENT, SUMMARIZE, { step: PICK, name: "text" });

    expect(step(added, SUMMARIZE).conditions).toEqual([
      ...(step(DOCUMENT, SUMMARIZE).conditions as JsonObject[]),
      { source: { producer_step_id: PICK, name: "text" }, operator: "equal", expected: true },
    ]);

    const changed = setCondition(added, SUMMARIZE, 1, { operator: "not_equal", expected: "" });

    expect((step(changed, SUMMARIZE).conditions as JsonObject[])[1]).toEqual({
      source: { producer_step_id: PICK, name: "text" },
      operator: "not_equal",
      expected: "",
    });
    expect(
      (
        step(setCondition(added, SUMMARIZE, 0, { source: { step: PICK, name: "text" } }), SUMMARIZE)
          .conditions as JsonObject[]
      )[0],
    ).toEqual({
      source: { producer_step_id: PICK, name: "text" },
      operator: "greater_than",
      expected: 0,
    });
    expect(step(removeCondition(changed, SUMMARIZE, 0), SUMMARIZE).conditions).toEqual([
      { source: { producer_step_id: PICK, name: "text" }, operator: "not_equal", expected: "" },
    ]);
  });
});

describe("connect", () => {
  const added = addStep(DOCUMENT, "tool", { step: uuid(13) });

  it("runs one step after another", () => {
    const connected = connect(added, SUMMARIZE, uuid(13));

    expect(step(connected, uuid(13)).depends_on).toEqual([SUMMARIZE]);
    expect(step(connected, uuid(13)).inputs).toEqual([]);
  });

  it("reads an output into an input of its name, or the one asked for", () => {
    const connected = connect(added, SUMMARIZE, uuid(13), { output: "summary" });
    const twice = connect(connected, PICK, uuid(13), { output: "text", input: "summary" });

    expect(step(twice, uuid(13)).depends_on).toEqual([SUMMARIZE, PICK]);
    expect(step(twice, uuid(13)).inputs).toEqual([
      { name: "summary", source: { producer_step_id: SUMMARIZE, name: "summary" } },
      { name: "summary_2", source: { producer_step_id: PICK, name: "text" } },
    ]);
  });
});

describe("connecting and disconnecting", () => {
  const third = addStep(DOCUMENT, "tool", { step: uuid(13) }, [SUMMARIZE]);

  it("finds every step a step runs after, directly or through others", () => {
    expect([...upstreamOf(third, uuid(13))].sort()).toEqual([PICK, SUMMARIZE].sort());
    expect(upstreamOf(third, PICK).size).toBe(0);
  });

  it("connects two steps only once, never a step to itself, and never in a circle", () => {
    expect(canConnect(third, PICK, uuid(13))).toBe(true);
    expect(canConnect(third, SUMMARIZE, uuid(13))).toBe(false);
    expect(canConnect(third, uuid(13), uuid(13))).toBe(false);
    expect(canConnect(third, uuid(13), PICK)).toBe(false);
    expect(canConnect(third, uuid(99), PICK)).toBe(false);
    expect(canConnect(third, PICK, uuid(99))).toBe(false);
  });

  it("disconnects a step from one it ran after, and what it read from it by step", () => {
    const parted = step(disconnect(DOCUMENT, PICK, SUMMARIZE), SUMMARIZE);

    expect(parted.depends_on).toEqual([]);
    expect(parted.inputs).toEqual([]);
    expect(parted.conditions).toEqual([]);
    expect(asObject(parted.specification).template).toEqual({
      text: "Summarize this ticket in one sentence:\n\n{ticket}",
      bindings: [],
    });
  });

  it("keeps what a disconnected step reads by name", () => {
    const byName = setInputSource(DOCUMENT, SUMMARIZE, "ticket", { kind: "context", name: "text" });

    expect(step(disconnect(byName, PICK, SUMMARIZE), SUMMARIZE).inputs).toEqual([
      { name: "ticket", source: { name: "text" } },
    ]);
  });

  it("stops a step reading the workflow's input, and nothing else", () => {
    expect(step(disconnectInput(DOCUMENT, PICK), PICK).inputs).toEqual([
      { name: "path", source: { value: ["text"] } },
    ]);
    expect(disconnectInput(DOCUMENT, SUMMARIZE)).toEqual(DOCUMENT);
  });
});

describe("withIds", () => {
  function counter(): () => string {
    let next = 200;

    return () => {
      next += 1;
      return uuid(next);
    };
  }

  it("keeps the workflow's own id, and every step's UUID", () => {
    const written = withIds(
      { ...DOCUMENT, metadata: { ...asObject(DOCUMENT.metadata), id: "typed" } },
      uuid(1),
      counter(),
    );

    expect(asObject(written.metadata).id).toBe(uuid(1));
    expect(stepsOf(written).map((each) => each.id)).toEqual([PICK, SUMMARIZE]);
    expect(asObject(asObject(step(written, SUMMARIZE).specification).metadata).id).toBe(uuid(22));
  });

  it("makes ids for steps whose ids are missing, not UUIDs, or another's", () => {
    const [pick, summarize] = stepsOf(DOCUMENT);
    const written = withIds(
      {
        ...DOCUMENT,
        steps: [
          pick ?? {},
          { ...summarize, id: PICK },
          { specification: { metadata: { name: "new" } } },
          { id: "three" },
          "not a step",
        ],
      },
      uuid(1),
      counter(),
    );

    expect(asList(written.steps).map((each) => (isObject(each) ? each.id : each))).toEqual([
      PICK,
      uuid(201),
      uuid(202),
      uuid(204),
      "not a step",
    ]);
    expect(asObject(asObject(stepsOf(written)[2]).specification).metadata).toEqual({
      name: "new",
      id: uuid(203),
    });
  });

  it("gives a document without steps the workflow's id alone", () => {
    expect(withIds({ steps: "nope" }, uuid(1), counter())).toEqual({
      steps: "nope",
      metadata: { id: uuid(1) },
    });
  });
});

describe("isUuid", () => {
  it("knows a UUID as the editor writes one", () => {
    expect(isUuid(uuid(1))).toBe(true);
    expect(isUuid("00000000000040008000000000000001")).toBe(false);
    expect(isUuid("nope")).toBe(false);
    expect(isUuid(7)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
