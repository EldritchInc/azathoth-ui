import { describe, expect, it } from "vitest";

import { describeWorkflow } from "./documents";
import {
  buildGraph,
  COLUMN_GAP,
  crossings,
  FOLD_AT,
  foldNode,
  INPUT_NODE,
  layerOfFold,
  RESULT_NODE,
  LANE_GAP,
  ROW_GAP,
  stepNode,
  wideLayers,
  type WorkflowGraph,
} from "./graph";
import { LAYERED_DOCUMENT, REVIEW_DOCUMENT, TRIAGE_DOCUMENT } from "./test/documents";

function graphOf(
  document: Record<string, unknown>,
  options?: { readonly arrange?: boolean; readonly folded?: ReadonlySet<number> },
): WorkflowGraph {
  const graph = buildGraph(describeWorkflow(document), options);

  if (graph === null) {
    throw new Error("The workflow has no graph.");
  }
  return graph;
}

function short(id: string): string {
  return id.replace(/^step:/, "");
}

function edgesOf(graph: WorkflowGraph): string[] {
  return graph.edges.map(
    (edge) => `${short(edge.source)} > ${short(edge.target)} ${edge.kind}: ${edge.label}`,
  );
}

function columnsOf(graph: WorkflowGraph): string[][] {
  const columns: string[][] = Array.from({ length: graph.columns }, () => []);

  for (const node of [...graph.nodes].sort((a, b) => a.row - b.row)) {
    columns[node.column]?.push(short(node.id));
  }
  return columns;
}

describe("buildGraph", () => {
  const triage = graphOf(TRIAGE_DOCUMENT);

  it("puts the input first, each layer in its own column, and the result last", () => {
    expect(triage.columns).toBe(6);
    expect(columnsOf(triage)).toEqual([
      [INPUT_NODE],
      ["classify"],
      ["draft-question", "log", "draft-bug", "draft-feature"],
      ["merge"],
      ["polish"],
      [RESULT_NODE],
    ]);
  });

  it("names each node and keeps each step's view", () => {
    const labels = Object.fromEntries(triage.nodes.map((node) => [short(node.id), node.label]));

    expect(labels).toMatchObject({
      [INPUT_NODE]: "Input",
      classify: "Classify ticket",
      merge: "merge_replies",
      [RESULT_NODE]: "answer",
    });
    expect(triage.nodes.find((node) => node.id === stepNode("merge"))?.step?.tool).toBe(
      "merge_replies 1.0.0",
    );
    expect(triage.nodes.find((node) => node.id === INPUT_NODE)?.kind).toBe("input");
    expect(triage.nodes.find((node) => node.id === INPUT_NODE)?.step).toBeNull();
    expect(triage.nodes.find((node) => node.id === RESULT_NODE)?.kind).toBe("result");
  });

  it("draws every way a value or a turn passes from one node to the next, once", () => {
    expect(edgesOf(triage)).toEqual([
      `${INPUT_NODE} > classify data: ticket`,
      "classify > log order: ",
      `${INPUT_NODE} > draft-bug data: ticket`,
      "classify > draft-bug condition: category is bug",
      `${INPUT_NODE} > draft-feature data: ticket`,
      "classify > draft-feature condition: category is feature",
      `${INPUT_NODE} > draft-question data: ticket`,
      "classify > draft-question condition: category is question",
      "draft-bug > merge data: reply",
      "draft-feature > merge data: reply",
      "draft-question > merge data: reply",
      "log > merge order: ",
      "merge > polish data: answer",
      "classify > polish data: notes",
      "draft-question > polish data: notes",
      `merge > ${RESULT_NODE} data: answer`,
      `polish > ${RESULT_NODE} data: answer`,
    ]);
  });

  it("keeps the values an edge on a condition carries beside its condition", () => {
    const edge = triage.edges.find(
      (each) => each.target === stepNode("draft-bug") && each.kind === "condition",
    );

    expect(edge?.names).toEqual(["notes"]);
    expect(edge?.conditions).toEqual(["category is bug"]);
    expect(edge?.id).toBe(`${stepNode("classify")}->${stepNode("draft-bug")}`);
  });

  it("notes the producers of a name a step reads that run alongside it or after it", () => {
    const also = Object.fromEntries(
      triage.nodes.map((node) => [short(node.id), node.alsoProducedBy]),
    );

    expect(also["draft-bug"]).toEqual([{ name: "notes", steps: ["draft-question"] }]);
    expect(also["draft-feature"]).toEqual([{ name: "notes", steps: ["draft-question"] }]);
    expect(also["draft-question"]).toEqual([]);
    expect(also.polish).toEqual([]);
    expect(also.classify).toEqual([]);
  });

  it("takes a name no earlier step produces from the input", () => {
    const graph = graphOf({
      steps: [
        {
          id: "a",
          inputs: [
            { name: "topic", source: { name: "topic" } },
            { name: "again", source: { name: "topic" } },
          ],
        },
        {
          id: "b",
          inputs: [{ name: "topic", source: { name: "topic" } }],
          outputs: [{ name: "topic" }, { name: "topic" }],
        },
      ],
      result: { name: "nothing" },
    });

    expect(edgesOf(graph)).toEqual([
      `${INPUT_NODE} > a data: topic`,
      `${INPUT_NODE} > b data: topic`,
      `${INPUT_NODE} > ${RESULT_NODE} data: nothing`,
    ]);
    expect(graph.nodes.find((node) => node.id === stepNode("a"))?.alsoProducedBy).toEqual([
      { name: "topic", steps: ["b"] },
    ]);
    expect(graph.nodes.find((node) => node.id === stepNode("b"))?.alsoProducedBy).toEqual([]);
  });

  it("draws no edge for a constant or a source it cannot follow", () => {
    const graph = graphOf({
      steps: [
        {
          id: "a",
          inputs: [
            { name: "limit", source: { value: 3 } },
            { name: "odd", source: {} },
          ],
          conditions: [{ source: { value: 1 }, operator: "equal", expected: 1 }],
        },
      ],
    });

    expect(edgesOf(graph)).toEqual([`${INPUT_NODE} > a order: `]);
  });

  it("starts each step that waits for nothing from the input", () => {
    const graph = graphOf(LAYERED_DOCUMENT);

    expect(edgesOf(graph).slice(0, 3)).toEqual([
      "security > merge order: ",
      "correctness > merge order: ",
      "readability > merge order: ",
    ]);
    expect(edgesOf(graph).filter((edge) => edge.startsWith(INPUT_NODE))).toEqual([
      `${INPUT_NODE} > security order: `,
      `${INPUT_NODE} > correctness order: `,
      `${INPUT_NODE} > readability order: `,
    ]);
  });

  it("has no result node for a workflow without a result", () => {
    const graph = graphOf({ steps: [{ id: "a" }] });

    expect(graph.nodes.map((node) => node.id)).toEqual([INPUT_NODE, stepNode("a")]);
    expect(graph.columns).toBe(2);
  });

  it("names an edge's values once each, in the order it reads them", () => {
    const graph = graphOf({
      steps: [
        { id: "a", outputs: [{ name: "x" }, { name: "y" }] },
        {
          id: "b",
          depends_on: ["a"],
          inputs: [
            { name: "y", source: { producer_step_id: "a", name: "y" } },
            { name: "x", source: { name: "x" } },
            { name: "again", source: { producer_step_id: "a", name: "y" } },
          ],
        },
      ],
    });

    expect(edgesOf(graph)).toEqual(["a > b data: y, x", `${INPUT_NODE} > a order: `]);
  });

  it("has no graph for a workflow it cannot layer", () => {
    expect(buildGraph(describeWorkflow(REVIEW_DOCUMENT))).toBeNull();
  });

  it("places each node by its column, each column's rows and lanes centred", () => {
    const at = Object.fromEntries(triage.nodes.map((node) => [short(node.id), [node.x, node.y]]));

    expect(at[INPUT_NODE]).toEqual([0, 0]);
    expect(at.classify).toEqual([COLUMN_GAP, -LANE_GAP / 2]);
    expect(at["draft-question"]).toEqual([2 * COLUMN_GAP, -ROW_GAP - LANE_GAP]);
    expect(at.log).toEqual([2 * COLUMN_GAP, -LANE_GAP]);
    expect(at["draft-feature"]).toEqual([2 * COLUMN_GAP, 2 * ROW_GAP - LANE_GAP]);
    expect(at[RESULT_NODE]).toEqual([5 * COLUMN_GAP, 0]);
  });

  it("passes an edge that spans columns through a lane in each, clear of the steps", () => {
    const route = (source: string, target: string) =>
      triage.edges.find((edge) => edge.source === source && edge.target === target)?.points;

    expect(route(stepNode("classify"), stepNode("polish"))?.map((point) => point.x)).toEqual([
      2 * COLUMN_GAP,
      3 * COLUMN_GAP,
    ]);
    expect(route(INPUT_NODE, stepNode("classify"))).toEqual([]);
    expect(route(stepNode("merge"), RESULT_NODE)).toEqual([{ x: 4 * COLUMN_GAP, y: 60 }]);

    for (const point of triage.edges.flatMap((edge) => edge.points)) {
      const near = triage.nodes.filter(
        (node) => node.x === point.x && Math.abs(node.y - point.y) < (ROW_GAP + LANE_GAP) / 2,
      );

      expect(near.map((node) => node.id)).toEqual([]);
    }
  });
});

describe("arranging rows", () => {
  const CROSSED = {
    steps: [
      { id: "a" },
      { id: "b" },
      { id: "c", depends_on: ["b"] },
      { id: "d", depends_on: ["a"] },
    ],
  };

  it("keeps the document's order when asked to", () => {
    const graph = graphOf(CROSSED, { arrange: false });

    expect(columnsOf(graph)).toEqual([[INPUT_NODE], ["a", "b"], ["c", "d"]]);
    expect(crossings(graph)).toBe(1);
  });

  it("orders each column's rows so its edges cross as little as they can", () => {
    const graph = graphOf(CROSSED);

    expect(columnsOf(graph)).toEqual([[INPUT_NODE], ["a", "b"], ["d", "c"]]);
    expect(crossings(graph)).toBe(0);
  });

  it("moves a column's rows to suit the steps after them", () => {
    const graph = graphOf({
      steps: [
        { id: "a" },
        { id: "b" },
        { id: "c" },
        { id: "d", depends_on: ["a", "c"] },
        { id: "e", depends_on: ["b", "c"] },
      ],
    });

    expect(columnsOf(graph)).toEqual([[INPUT_NODE], ["a", "c", "b"], ["d", "e"]]);
    expect(crossings(graph)).toBe(0);
  });

  it("lays out five layers ten steps wide with fewer crossings than the document's order", () => {
    const id = (layer: number, index: number) => `s${String(layer)}-${String(index % 10)}`;
    const steps = Array.from({ length: 5 }, (_, layer) =>
      Array.from({ length: 10 }, (__, index) => ({
        id: id(layer, index),
        depends_on: layer === 0 ? [] : [id(layer - 1, index * 3), id(layer - 1, index * 7 + 1)],
      })),
    ).flat();
    const document = { steps };
    const arranged = graphOf(document);
    const plain = graphOf(document, { arrange: false });

    expect(arranged.nodes).toHaveLength(51);
    expect(arranged.columns).toBe(6);
    for (let column = 1; column < 6; column += 1) {
      const rows = arranged.nodes
        .filter((node) => node.column === column)
        .map((node) => node.row)
        .sort((a, b) => a - b);

      expect(rows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
    expect(crossings(arranged)).toBeLessThan(crossings(plain));
  });
});

describe("crossings", () => {
  const node = (id: string, x: number, y: number) => ({
    id,
    kind: "step" as const,
    label: id,
    step: null,
    column: x,
    row: y,
    x,
    y,
    alsoProducedBy: [],
    members: [],
  });
  const edge = (source: string, target: string) => ({
    id: `${source}->${target}`,
    source,
    target,
    kind: "order" as const,
    names: [],
    conditions: [],
    label: "",
    points: [] as { x: number; y: number }[],
  });

  it("counts edges that cross, and not edges that only share an end", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", 0, 0), node("b", 0, 1), node("c", 1, 0), node("d", 1, 1)],
      edges: [edge("a", "d"), edge("b", "c"), edge("a", "c")],
      columns: 2,
    };

    expect(crossings(graph)).toBe(1);
    expect(crossings({ ...graph, edges: [edge("a", "c"), edge("b", "d"), edge("a", "d")] })).toBe(
      0,
    );
  });

  it("counts no crossing where one edge's line, but not the edge, meets the other", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", 0, 0), node("b", 3, 0), node("c", 2, 5), node("d", 2, 6)],
      edges: [edge("a", "b"), edge("c", "d")],
      columns: 4,
    };

    expect(crossings(graph)).toBe(0);
    expect(crossings({ ...graph, edges: [edge("c", "d"), edge("a", "b")] })).toBe(0);
  });

  it("follows an edge through its lanes", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", 0, 0), node("b", 2, 0), node("c", 1, -1), node("d", 1, 1)],
      edges: [edge("a", "b"), edge("c", "d")],
      columns: 3,
    };

    expect(crossings(graph)).toBe(1);
    expect(
      crossings({
        ...graph,
        edges: [{ ...edge("a", "b"), points: [{ x: 1, y: 2 }] }, edge("c", "d")],
      }),
    ).toBe(0);
  });
});

/** A workflow of layers of steps, each step after two of the layer before it. */
function grid(widths: readonly number[]): Record<string, unknown> {
  const id = (layer: number, index: number) =>
    `s${String(layer)}-${String(index % (widths[layer] ?? 1))}`;

  return {
    steps: widths.flatMap((width, layer) =>
      Array.from({ length: width }, (_, index) => ({
        id: id(layer, index),
        depends_on: layer === 0 ? [] : [id(layer - 1, index * 3), id(layer - 1, index * 7 + 1)],
        outputs: [{ name: `out-${String(layer)}` }],
      })),
    ),
    result: { name: `out-${String(widths.length - 1)}` },
  };
}

describe("sharing lanes", () => {
  it("passes the edges from one node through one lane in each column they cross", () => {
    const triage = graphOf(TRIAGE_DOCUMENT);
    const fromInput = triage.edges.filter(
      (edge) => edge.source === INPUT_NODE && edge.points.length > 0,
    );

    expect(fromInput.map((edge) => short(edge.target))).toEqual([
      "draft-bug",
      "draft-feature",
      "draft-question",
    ]);
    expect(new Set(fromInput.map((edge) => JSON.stringify(edge.points))).size).toBe(1);
  });
});

describe("folding", () => {
  const document = grid([2, 8, 3]);

  it("offers to fold only layers of at least six steps", () => {
    expect(FOLD_AT).toBe(6);
    expect(wideLayers(describeWorkflow(document))).toEqual([1]);
    expect(wideLayers(describeWorkflow(grid([6, 5, 7])))).toEqual([0, 2]);
    expect(wideLayers(describeWorkflow(REVIEW_DOCUMENT))).toEqual([]);
  });

  it("names a fold's node by its layer, and knows no other node as a fold", () => {
    expect(foldNode(3)).toBe("fold:3");
    expect(layerOfFold(foldNode(3))).toBe(3);
    expect(layerOfFold(stepNode("fold:3"))).toBeNull();
    expect(layerOfFold("fold:x")).toBeNull();
    expect(layerOfFold("fold:-1")).toBeNull();
  });

  it("stands one node for a folded layer's steps", () => {
    const graph = graphOf(document, { folded: new Set([1]) });
    const fold = graph.nodes.find((node) => node.id === foldNode(1));

    expect(graph.nodes.filter((node) => node.column === 2)).toHaveLength(1);
    expect(fold?.kind).toBe("fold");
    expect(fold?.label).toBe("8 steps");
    expect(fold?.step).toBeNull();
    expect(fold?.members.map((step) => step.id)).toEqual(
      Array.from({ length: 8 }, (_, index) => `s1-${String(index)}`),
    );
    expect(graph.nodes.find((node) => node.id === stepNode("s0-0"))?.members).toEqual([]);
  });

  it("joins every edge to or from a folded step to the fold, once", () => {
    const graph = graphOf(document, { folded: new Set([1]) });

    expect(edgesOf(graph).sort()).toEqual(
      [
        `${INPUT_NODE} > s0-0 order: `,
        `${INPUT_NODE} > s0-1 order: `,
        `s0-0 > ${foldNode(1)} order: `,
        `s0-1 > ${foldNode(1)} order: `,
        `${foldNode(1)} > s2-0 order: `,
        `${foldNode(1)} > s2-1 order: `,
        `${foldNode(1)} > s2-2 order: `,
        `s2-0 > ${RESULT_NODE} data: out-2`,
        `s2-1 > ${RESULT_NODE} data: out-2`,
        `s2-2 > ${RESULT_NODE} data: out-2`,
      ].sort(),
    );
  });

  it("starts a folded layer of steps that wait for nothing from the input", () => {
    const graph = graphOf(grid([7]), { folded: new Set([0]) });

    expect(edgesOf(graph)).toEqual([
      `${INPUT_NODE} > ${foldNode(0)} order: `,
      `${foldNode(0)} > ${RESULT_NODE} data: out-0`,
    ]);
  });

  it("folds nothing it is not asked to", () => {
    expect(graphOf(document).nodes.some((node) => node.kind === "fold")).toBe(false);
  });
});

describe("a graph at scale", () => {
  it("lays out fifty layers of twenty steps in good time, without losing a node", () => {
    const document = grid(Array.from({ length: 50 }, () => 20));
    const started = performance.now();
    const graph = graphOf(document);
    const took = performance.now() - started;

    expect(graph.nodes).toHaveLength(1002);
    expect(graph.columns).toBe(52);
    expect(took).toBeLessThan(5000);
  });
});
