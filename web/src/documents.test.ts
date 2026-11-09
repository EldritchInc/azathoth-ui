import { describe, expect, it } from "vitest";

import { describeBenchmark, describeTool, describeWorkflow, layers, preview } from "./documents";
import {
  BENCHMARK_DOCUMENT,
  LAYERED_DOCUMENT,
  REVIEW_DOCUMENT,
  TOOL_DOCUMENT,
} from "./test/documents";

describe("describeWorkflow", () => {
  const view = describeWorkflow(REVIEW_DOCUMENT);

  it("lists every step in the document's order, with what it is", () => {
    expect(view.steps.map((step) => [step.title, step.kind])).toEqual([
      ["Review security", "prompt"],
      ["merge_reviews", "tool"],
      ["Summarize review", "prompt"],
    ]);
    expect(view.result).toBe("summary");
  });

  it("describes a prompt step: its prompt, its answer, and what its model needs", () => {
    const [review] = view.steps;

    expect(review?.description).toBe("Review a change for security problems.");
    expect(review?.message).toBe("Reviewing security");
    expect(review?.prompt).toBe("You review code changes for security.\n{change}");
    expect(review?.answers).toBe("JSON");
    expect(review?.needs).toEqual([
      "json_mode",
      "Reads text and image",
      "At least 128,000 tokens of context",
      "Input at most $3 per million tokens",
      "Known pricing",
    ]);
    expect(review?.tool).toBeNull();
  });

  it("says nothing of a model's needs that a plain text model meets", () => {
    expect(view.steps[2]?.needs).toEqual([]);
    expect(view.steps[2]?.prompt).toBe("Write the review comment.");
    expect(view.steps[2]?.answers).toBeNull();
  });

  it("describes a tool step by the tool it runs", () => {
    const merge = view.steps[1];

    expect(merge?.tool).toBe("merge_reviews 1.0.0");
    expect(merge?.runtime).toBe("python");
    expect(merge?.prompt).toBeNull();
    expect(merge?.needs).toEqual([]);
  });

  it("says where each input comes from", () => {
    expect(view.steps[0]?.inputs).toEqual([{ name: "change", from: "the workflow's input" }]);
    expect(view.steps[1]?.inputs).toEqual([
      { name: "security", from: "Review security: security" },
      { name: "limit", from: "the constant 10" },
      { name: "notes", from: "the context's notes" },
    ]);
  });

  it("names the steps a step runs after, and keeps an unknown one by its id", () => {
    expect(view.steps[2]?.dependsOn).toEqual(["step-merge", "step-gone"]);
    expect(view.steps[0]?.after).toEqual([]);
    expect(view.steps[2]?.after).toEqual(["merge_reviews", "step-gone"]);
  });

  it("says when a step runs only on a condition", () => {
    expect(view.steps[2]?.conditions).toEqual(["merge_reviews: has_findings is true"]);
    expect(view.steps[0]?.conditions).toEqual([]);
  });

  it("names outputs, and how a step retries and fails", () => {
    expect(view.steps[1]?.outputs).toEqual(["review", "has_findings"]);
    expect(view.steps[0]?.attempts).toBe(2);
    expect(view.steps[0]?.onFailure).toBe("fails the workflow");
    expect(view.steps[1]?.onFailure).toBe("continue workflow");
  });

  it("makes the best of a document it does not understand", () => {
    expect(describeWorkflow({})).toEqual({ steps: [], result: null });

    const odd = describeWorkflow({ steps: [42, { id: 7, specification: "x" }] });

    expect(odd.steps.map((step) => [step.title, step.kind])).toEqual([
      ["Unnamed step", "unknown"],
      ["Unnamed step", "unknown"],
    ]);
  });
});

describe("layers", () => {
  function ids(document: Record<string, unknown>): string[][] | null {
    return layers(describeWorkflow(document))?.map((layer) => layer.map((step) => step.id)) ?? null;
  }

  it("puts the steps that can run at once side by side, in the document's order", () => {
    expect(ids(LAYERED_DOCUMENT)).toEqual([
      ["security", "correctness", "readability"],
      ["merge"],
      ["summary"],
    ]);
  });

  it("puts a step one layer after the deepest step it depends on", () => {
    const steps = [
      { id: "a", depends_on: [] },
      { id: "b", depends_on: ["a"] },
      { id: "c", depends_on: ["a", "b"] },
      { id: "d", depends_on: ["a"] },
    ];

    expect(ids({ steps })).toEqual([["a"], ["b", "d"], ["c"]]);
  });

  it("has no layers for a workflow with no steps", () => {
    expect(ids({ steps: [] })).toEqual([]);
  });

  it("gives up on a step that depends on one that is not there", () => {
    expect(ids(REVIEW_DOCUMENT)).toBeNull();
  });

  it("gives up on steps that depend on each other", () => {
    const steps = [
      { id: "a", depends_on: ["b"] },
      { id: "b", depends_on: ["a"] },
    ];

    expect(ids({ steps })).toBeNull();
    expect(ids({ steps: [{ id: "a", depends_on: ["a"] }] })).toBeNull();
  });

  it("gives up on steps it cannot tell apart", () => {
    expect(ids({ steps: [{ id: "a" }, { id: "a" }] })).toBeNull();
    expect(ids({ steps: [{ depends_on: [] }] })).toBeNull();
  });
});

describe("describeTool", () => {
  const view = describeTool(TOOL_DOCUMENT);

  it("lists the tool's inputs from its schema, saying which are required", () => {
    expect(view.inputs).toEqual([
      { name: "text", type: "string", required: true, description: "The text to count." },
      { name: "separators", type: "array of string", required: false, description: null },
      { name: "mode", type: "one of words, lines", required: false, description: null },
      { name: "strict", type: "boolean or null", required: false, description: null },
    ]);
  });

  it("says when a schema names no fields", () => {
    expect(view.outputs).toEqual([]);
    expect(describeTool({}).inputs).toEqual([]);
  });

  it("lists implementations with their source, and tests with what they expect", () => {
    expect(view.implementations).toEqual([
      {
        id: "implementation",
        version: "1.0.0",
        runtime: "python",
        entrypoint: "run",
        source: 'def run(text):\n    return {"count": len(text.split())}\n',
      },
    ]);
    expect(view.tests).toEqual([
      {
        id: "test",
        name: "counts two words",
        description: "Verify a two-word input.",
        inputs: '{"text":"hello world"}',
        expected: '{"count":2}',
      },
    ]);
  });
});

describe("describeBenchmark", () => {
  it("lists each case's input, expectation and comparison", () => {
    expect(describeBenchmark(BENCHMARK_DOCUMENT).cases).toEqual([
      {
        id: "case-1",
        input: "that is not dead which can eternal lie",
        expected: "8",
        comparison: "exact",
        description: "Eight words.",
      },
      {
        id: "case-2",
        input: '{"text":"strange aeons"}',
        expected: '{"count":2}',
        comparison: "semantic",
        description: null,
      },
    ]);
    expect(describeBenchmark({ cases: "none" }).cases).toEqual([]);
  });
});

describe("preview", () => {
  it("shows text as it is and anything else as compact JSON, cut short when long", () => {
    expect(preview("hello")).toBe("hello");
    expect(preview({ a: [1, 2] })).toBe('{"a":[1,2]}');
    expect(preview(null)).toBe("null");
    expect(preview(undefined)).toBe("nothing");
    expect(preview("x".repeat(300))).toBe(`${"x".repeat(199)}…`);
  });
});
