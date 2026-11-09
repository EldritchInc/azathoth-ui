import { describe, expect, it } from "vitest";

import { describeWorkflow } from "./documents";
import { buildGraph, INPUT_NODE, RESULT_NODE, stepNode, type WorkflowGraph } from "./graph";
import { connections, highlight, neighbour, nodeOfStep, stepOfNode } from "./paths";
import { TRIAGE_DOCUMENT } from "./test/documents";

function graphOf(document: Record<string, unknown>): WorkflowGraph {
  const graph = buildGraph(describeWorkflow(document));

  if (graph === null) {
    throw new Error("The workflow has no graph.");
  }
  return graph;
}

function short(id: string): string {
  return id.replace(/^step:/, "");
}

const triage = graphOf(TRIAGE_DOCUMENT);

describe("highlight", () => {
  it("lights every node a step comes from and every node that comes from it", () => {
    const lit = highlight(triage, stepNode("draft-bug"));

    expect([...lit.nodes].map(short).sort()).toEqual(
      [INPUT_NODE, RESULT_NODE, "classify", "draft-bug", "merge", "polish"].sort(),
    );
  });

  it("lights the edges along those paths, and not one that skips past the step", () => {
    const lit = highlight(triage, stepNode("draft-bug"));
    const edges = triage.edges
      .filter((edge) => lit.edges.has(edge.id))
      .map((edge) => `${short(edge.source)} > ${short(edge.target)}`);

    expect(edges).toEqual([
      `${INPUT_NODE} > classify`,
      `${INPUT_NODE} > draft-bug`,
      "classify > draft-bug",
      "draft-bug > merge",
      "merge > polish",
      `merge > ${RESULT_NODE}`,
      `polish > ${RESULT_NODE}`,
    ]);
  });

  it("lights only what leads to a step at the end, and from one at the start", () => {
    expect([...highlight(triage, stepNode("log")).nodes].map(short).sort()).toEqual(
      [INPUT_NODE, RESULT_NODE, "classify", "log", "merge", "polish"].sort(),
    );
    expect(highlight(triage, INPUT_NODE).nodes.size).toBe(triage.nodes.length);
  });
});

describe("neighbour", () => {
  it("moves left to the nearest node a step comes from", () => {
    expect(neighbour(triage, stepNode("draft-bug"), "left")).toBe(stepNode("classify"));
    expect(neighbour(triage, stepNode("polish"), "left")).toBe(stepNode("merge"));
    expect(neighbour(triage, INPUT_NODE, "left")).toBeNull();
  });

  it("moves right to the nearest node a step leads to", () => {
    expect(neighbour(triage, stepNode("classify"), "right")).toBe(stepNode("log"));
    expect(neighbour(triage, stepNode("merge"), "right")).toBe(stepNode("polish"));
    expect(neighbour(triage, RESULT_NODE, "right")).toBeNull();
  });

  it("moves up and down its own column", () => {
    expect(neighbour(triage, stepNode("draft-bug"), "up")).toBe(stepNode("log"));
    expect(neighbour(triage, stepNode("draft-bug"), "down")).toBe(stepNode("draft-feature"));
    expect(neighbour(triage, stepNode("draft-feature"), "down")).toBeNull();
    expect(neighbour(triage, stepNode("classify"), "up")).toBeNull();
  });

  it("moves to the column beside a step that leads nowhere", () => {
    const graph = graphOf({ steps: [{ id: "a" }, { id: "b" }, { id: "c", depends_on: ["b"] }] });

    expect(neighbour(graph, stepNode("a"), "right")).toBe(stepNode("c"));
    expect(neighbour(graph, stepNode("c"), "right")).toBeNull();
  });

  it("goes nowhere from a node the graph does not have", () => {
    expect(neighbour(triage, stepNode("gone"), "right")).toBeNull();
  });
});

describe("nodeOfStep and stepOfNode", () => {
  it("names a step's node in the graph, and only a step the graph has", () => {
    expect(nodeOfStep(triage, "merge")).toBe(stepNode("merge"));
    expect(nodeOfStep(triage, "gone")).toBeNull();
    expect(nodeOfStep(triage, null)).toBeNull();
  });

  it("names the step a node shows, and none for the input or the result", () => {
    expect(stepOfNode(stepNode("merge"))).toBe("merge");
    expect(stepOfNode(INPUT_NODE)).toBeNull();
    expect(stepOfNode(RESULT_NODE)).toBeNull();
  });
});

describe("connections", () => {
  it("sets out what a step comes from and leads to, by column, then row", () => {
    const { from, to } = connections(triage, stepNode("draft-question"));

    expect(from.map(({ node, edge }) => [short(node.id), edge.kind])).toEqual([
      [INPUT_NODE, "data"],
      ["classify", "condition"],
    ]);
    expect(to.map(({ node, edge }) => [short(node.id), edge.label])).toEqual([
      ["merge", "reply"],
      ["polish", "notes"],
    ]);
  });

  it("sets out a column's nodes by row, whatever order the document gives them", () => {
    expect(connections(triage, stepNode("merge")).from.map(({ node }) => short(node.id))).toEqual([
      "draft-question",
      "log",
      "draft-bug",
      "draft-feature",
    ]);
  });

  it("finds nothing on the far sides of the ends", () => {
    expect(connections(triage, INPUT_NODE).from).toEqual([]);
    expect(connections(triage, RESULT_NODE).to).toEqual([]);
  });
});
