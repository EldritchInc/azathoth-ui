import { describe, expect, it } from "vitest";

import { addStep, stepsOf } from "../editing";
import { INPUT_NODE, RESULT_NODE, stepNode } from "../graph";
import { uuid, VALID_DOCUMENT } from "../test/documents";
import { joining, problemsByStep, removable, unjoining } from "./composing";

describe("problemsByStep", () => {
  it("groups the problems of each step, in order, leaving the workflow's out", () => {
    expect(
      Object.fromEntries(
        problemsByStep([
          { step: null, message: "The workflow needs a name." },
          { step: "a", message: "It needs a prompt." },
          { step: "b", message: "It needs a tool." },
          { step: "a", message: "It needs a description." },
        ]),
      ),
    ).toEqual({
      a: ["It needs a prompt.", "It needs a description."],
      b: ["It needs a tool."],
    });
  });
});

describe("removable", () => {
  const edge = (source: string, target: string, names: readonly string[]) => ({
    id: `${source}->${target}`,
    source,
    target,
    kind: "data" as const,
    names,
    conditions: [],
    label: "",
    points: [],
  });

  it("removes a link between steps, and a step's reading of the input", () => {
    expect(removable(edge("step:a", "step:b", []))).toBe(true);
    expect(removable(edge(INPUT_NODE, "step:b", ["input"]))).toBe(true);
  });

  it("leaves the result's link, and the start of a step that reads nothing, alone", () => {
    expect(removable(edge("step:a", RESULT_NODE, ["answer"]))).toBe(false);
    expect(removable(edge(INPUT_NODE, "step:b", []))).toBe(false);
  });
});

describe("joining", () => {
  const [pick, summarize] = [uuid(11), uuid(12)];

  it("makes a step read the workflow's input when the input is joined to it", () => {
    const joined = joining(VALID_DOCUMENT, INPUT_NODE, stepNode(summarize));

    expect(joined?.offer).toBeNull();
    expect(stepsOf(joined?.edit?.(VALID_DOCUMENT) ?? {})[1]?.inputs).toEqual([
      { name: "ticket", source: { producer_step_id: pick, name: "text" } },
      { name: "input", source: { event_type: "workflow.input.received", field_name: "input" } },
    ]);
  });

  it("offers to make one of a step's outputs the result when it is joined to the result", () => {
    expect(joining(VALID_DOCUMENT, stepNode(pick), RESULT_NODE)).toEqual({
      edit: null,
      offer: { kind: "result", from: stepNode(pick) },
    });
  });

  it("runs one step after another, and offers to pass a value", () => {
    const added = addStep(VALID_DOCUMENT, "tool", { step: uuid(13) });
    const joined = joining(added, stepNode(summarize), stepNode(uuid(13)));

    expect(joined?.offer).toEqual({
      kind: "pass",
      from: stepNode(summarize),
      to: stepNode(uuid(13)),
    });
    expect(stepsOf(joined?.edit?.(added) ?? {})[2]?.depends_on).toEqual([summarize]);
  });

  it("joins nothing that would make a circle, or that is joined already, or the wrong way", () => {
    expect(joining(VALID_DOCUMENT, stepNode(summarize), stepNode(pick))).toBeNull();
    expect(joining(VALID_DOCUMENT, stepNode(pick), stepNode(summarize))).toBeNull();
    expect(joining(VALID_DOCUMENT, RESULT_NODE, stepNode(pick))).toBeNull();
    expect(joining(VALID_DOCUMENT, stepNode(pick), INPUT_NODE)).toBeNull();
  });
});

describe("unjoining", () => {
  const [pick, summarize] = [uuid(11), uuid(12)];
  const edge = (source: string, target: string, names: readonly string[]) => ({
    id: `${source}->${target}`,
    source,
    target,
    kind: "data" as const,
    names,
    conditions: [],
    label: "",
    points: [],
  });

  it("parts two steps, or a step from the workflow's input", () => {
    const parted = unjoining(edge(stepNode(pick), stepNode(summarize), ["text"]))?.(VALID_DOCUMENT);
    const unread = unjoining(edge(INPUT_NODE, stepNode(pick), ["value"]))?.(VALID_DOCUMENT);

    expect(stepsOf(parted ?? {})[1]?.depends_on).toEqual([]);
    expect(stepsOf(unread ?? {})[0]?.inputs).toEqual([
      { name: "path", source: { value: ["text"] } },
    ]);
  });

  it("removes nothing it cannot", () => {
    expect(unjoining(edge(stepNode(summarize), RESULT_NODE, ["summary"]))).toBeNull();
    expect(unjoining(edge(INPUT_NODE, stepNode(pick), []))).toBeNull();
  });
});
