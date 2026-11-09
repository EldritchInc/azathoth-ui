import { describe, expect, it } from "vitest";

import {
  addCondition,
  addDependency,
  addInput,
  addOutput,
  addStep,
  removeStep,
  setCondition,
  setMetadata,
  setResult,
  setRetry,
  setTool,
  stepsOf,
  type JsonObject,
} from "./editing";
import { problems, titleOf, type Problem } from "./problems";
import { uuid, VALID_DOCUMENT } from "./test/documents";

const DOCUMENT = VALID_DOCUMENT;
const PICK = uuid(11);
const SUMMARIZE = uuid(12);

function messages(document: JsonObject): string[] {
  return problems(document).map((problem) => problem.message);
}

/** Returns the document with one step's fields changed as they are given. */
function withStep(id: string, change: JsonObject, document = DOCUMENT): JsonObject {
  return {
    ...document,
    steps: stepsOf(document).map((step) => (step.id === id ? { ...step, ...change } : step)),
  };
}

function withSpecification(id: string, change: JsonObject): JsonObject {
  const step = stepsOf(DOCUMENT).find((each) => each.id === id);

  return withStep(id, { specification: { ...(step?.specification as JsonObject), ...change } });
}

describe("problems", () => {
  it("finds nothing wrong with a workflow Azathoth accepts", () => {
    expect(problems(DOCUMENT)).toEqual([]);
  });

  it("says which step each problem is about, the workflow's own first", () => {
    const broken = withStep(SUMMARIZE, { depends_on: [] }, setMetadata(DOCUMENT, { name: " " }));

    expect(problems(broken)).toEqual<Problem[]>([
      { step: null, message: "The workflow needs a name." },
      {
        step: SUMMARIZE,
        message: "Its input ticket reads from json_select, which it does not depend on.",
      },
    ]);
  });

  it("asks for the workflow's id, name, description, version and steps", () => {
    expect(messages({ metadata: { id: "triage" }, steps: [], result: { name: "x" } })).toEqual([
      "The workflow's id must be a UUID.",
      "The workflow needs a name.",
      "The workflow needs a description.",
      "The workflow needs a version.",
      "The workflow needs at least one step.",
      "No step writes x, the workflow's result.",
    ]);
  });

  it("asks for a result some step writes", () => {
    expect(messages(setResult(DOCUMENT, null))).toEqual([
      "The workflow needs a result: the output that is its answer.",
    ]);
    expect(messages({ ...DOCUMENT, result: { name: "" } })).toEqual([
      "The workflow needs a result: the output that is its answer.",
    ]);
    expect(messages(setResult(DOCUMENT, { step: uuid(99), name: "summary" }))).toEqual([
      "The result reads from a step that is not in the workflow.",
    ]);
    expect(messages(setResult(DOCUMENT, { step: PICK, name: "summary" }))).toEqual([
      "The result reads summary, which json_select does not write.",
    ]);
    expect(messages(setResult(DOCUMENT, { step: null, name: "text" }))).toEqual([]);
  });

  it("finds steps that wait for one another in a circle", () => {
    expect(messages(addDependency(DOCUMENT, PICK, SUMMARIZE))).toEqual([
      "Its steps wait for one another in a circle.",
    ]);
  });

  it("finds two steps with one id, and ids that are not UUIDs", () => {
    const twice = { ...DOCUMENT, steps: [...stepsOf(DOCUMENT), stepsOf(DOCUMENT)[0] ?? {}] };

    expect(problems(twice)).toContainEqual({ step: PICK, message: "Another step has its id." });
    expect(messages(withStep(PICK, { id: "pick" }))).toContain("Its id must be a UUID.");
  });

  it("asks a prompt step for a name, a description, a UUID and a prompt", () => {
    expect(
      messages(
        withSpecification(SUMMARIZE, {
          metadata: { id: "summarize", name: "", description: " ", version: "1.0.0" },
          template: { text: "", bindings: [] },
        }),
      ),
    ).toEqual([
      "It needs a name.",
      "It needs a description.",
      "Its prompt's id must be a UUID.",
      "It needs a prompt.",
    ]);
  });

  it("finds a prompt's variables bound to nothing, and bindings to inputs it lacks", () => {
    expect(
      messages(
        withSpecification(SUMMARIZE, {
          template: {
            text: "{ticket} {tone}",
            bindings: [
              { variable_name: "ticket", input_name: "body" },
              { variable_name: "who", event_type: "customer.message.received", field_name: "name" },
            ],
          },
        }),
      ),
    ).toEqual([
      "Its prompt's {tone} is bound to nothing: give it an input named tone.",
      "Its prompt binds {ticket} to body, which it does not take.",
    ]);
  });

  it("reads a prompt written out in full, and asks it for text", () => {
    const fixed = (text: string) => {
      const step = stepsOf(DOCUMENT).find((each) => each.id === SUMMARIZE);
      const specification = Object.fromEntries(
        Object.entries(step?.specification as JsonObject).filter(([key]) => key !== "template"),
      );

      return withStep(SUMMARIZE, { specification: { ...specification, prompt: { text } } });
    };

    expect(messages(fixed("{not a variable}"))).toEqual([]);
    expect(messages(fixed(""))).toEqual(["It needs a prompt."]);
  });

  it("asks a tool step for a tool", () => {
    expect(messages(setTool(DOCUMENT, PICK, { name: " ", version: null, runtime: null }))).toEqual([
      "It needs a tool.",
    ]);
  });

  it("finds dependencies twice over, on itself, and on steps that are not there", () => {
    expect(
      messages(withStep(SUMMARIZE, { depends_on: [PICK, PICK, SUMMARIZE, uuid(99)] })),
    ).toEqual([
      "It depends on json_select twice.",
      "It depends on itself.",
      "It depends on a step that is not in the workflow.",
    ]);
  });

  it("finds outputs and inputs without names or with one name twice", () => {
    expect(
      messages(
        withStep(PICK, {
          outputs: [{ name: "" }, { name: "text" }, { name: "text" }, { name: "length" }],
          inputs: [
            { name: "", source: { value: 1 } },
            { name: "path", source: { value: 1 } },
            { name: "path", source: { value: 2 } },
          ],
        }),
      ),
    ).toEqual([
      "One of its outputs has no name.",
      "It writes text twice.",
      "One of its inputs has no name.",
      "It takes path twice.",
    ]);
  });

  it("finds an input from nowhere, and one read by a name no dependency writes", () => {
    expect(
      messages(
        withStep(SUMMARIZE, {
          inputs: [
            { name: "ticket", source: { name: "text" } },
            { name: "notes", source: { name: "notes" } },
            { name: "odd", source: {} },
          ],
        }),
      ),
    ).toEqual([
      "Its input notes reads notes by name, but no step it depends on writes it.",
      "Its input odd comes from nowhere.",
    ]);
  });

  it("finds an input read from a step that is missing, that does not write it, or is not upstream", () => {
    const later = addOutput(addStep(DOCUMENT, "tool", { step: uuid(13) }), uuid(13), "extra");
    const named = setTool(later, uuid(13), { name: "extra_tool", version: null, runtime: null });

    expect(
      messages(
        withStep(
          SUMMARIZE,
          {
            inputs: [
              { name: "ticket", source: { producer_step_id: uuid(99), name: "text" } },
              { name: "size", source: { producer_step_id: PICK, name: "size" } },
              { name: "extra", source: { producer_step_id: uuid(13), name: "extra" } },
            ],
          },
          named,
        ),
      ),
    ).toEqual([
      "Its input ticket reads from a step that is not in the workflow.",
      "Its input size reads size, which json_select does not write.",
      "Its input extra reads from extra_tool, which it does not depend on.",
    ]);
  });

  it("reads an input from a step upstream of a dependency", () => {
    const third = addInput(
      addStep(DOCUMENT, "tool", { step: uuid(13) }, [SUMMARIZE]),
      uuid(13),
      "text",
      { kind: "step", step: PICK, name: "text" },
    );
    const named = setTool(third, uuid(13), { name: "t", version: null, runtime: null });

    expect(messages(named)).toEqual([]);
  });

  it("finds conditions on steps that are missing, on values they do not write, and odd comparisons", () => {
    const missing = addCondition(DOCUMENT, SUMMARIZE, { step: uuid(99), name: "x" });
    const unwritten = addCondition(DOCUMENT, SUMMARIZE, { step: PICK, name: "size" });
    const odd = setCondition(DOCUMENT, SUMMARIZE, 0, { expected: "long" });

    expect(messages(missing)).toEqual([
      "One of its conditions reads from a step that is not in the workflow.",
    ]);
    expect(messages(unwritten)).toEqual([
      "One of its conditions reads size, which json_select does not write.",
    ]);
    expect(messages(odd)).toEqual([
      "One of its conditions compares length with something that is not a number.",
    ]);
    expect(messages(setCondition(odd, SUMMARIZE, 0, { operator: "equal" }))).toEqual([]);
  });

  it("finds retries that cannot be", () => {
    expect(
      messages(
        setRetry(DOCUMENT, PICK, {
          max_attempts: 0,
          initial_delay_seconds: -1,
          backoff_multiplier: 0.5,
          maximum_delay_seconds: -2,
        }),
      ),
    ).toEqual([
      "It must try at least once.",
      "Its first retry cannot wait less than no time.",
      "Its retries cannot wait less each time.",
      "Its longest wait between retries cannot be shorter than its first.",
    ]);
    expect(messages(setRetry(DOCUMENT, PICK, { max_attempts: 1.5 }))).toEqual([
      "It must try at least once.",
    ]);
    expect(messages(withStep(PICK, { retry_policy: {} }))).toEqual([]);
  });

  it("finds a confidence that is not an output, and values shown without a message or outputs", () => {
    expect(messages(withStep(PICK, { confidence: "sure" }))).toEqual([
      "Its confidence, sure, is not one of its outputs.",
    ]);
    expect(messages(withStep(PICK, { emit_values: true }))).toEqual([
      "It shows its values as it runs, so it needs a message to show them with.",
    ]);
    expect(messages(withStep(SUMMARIZE, { emit_values: true, outputs: [] }))).toEqual([
      "The result reads summary, which Summarize does not write.",
      "It shows its values as it runs, so it needs outputs to show.",
    ]);
    expect(messages(withStep(SUMMARIZE, { emit_values: true }))).toEqual([]);
  });

  it("reads what a step that was removed leaves behind as problems to fix", () => {
    expect(messages(removeStep(DOCUMENT, PICK))).toEqual([
      "Its input ticket reads text by name, but no step it depends on writes it.",
    ]);
  });
});

describe("titleOf", () => {
  it("names a step by its prompt or its tool", () => {
    const [pick, summarize] = stepsOf(DOCUMENT);

    expect(titleOf(pick ?? {})).toBe("json_select");
    expect(titleOf(summarize ?? {})).toBe("Summarize");
    expect(titleOf({})).toBe("an unnamed step");
    expect(titleOf({ specification: { metadata: { name: " " } } })).toBe("an unnamed step");
  });
});
