import { describe, expect, it } from "vitest";

import { describeWorkflow } from "./documents";
import {
  canvasHeight,
  detailAt,
  edgePath,
  END_SIZE,
  flowEdges,
  flowNodes,
  openingNodes,
  READABLE_ZOOM,
  STEP_SIZE,
  STEP_ZOOM,
  viewportOn,
} from "./flow";
import {
  buildGraph,
  COLUMN_GAP,
  foldNode,
  INPUT_NODE,
  RESULT_NODE,
  ROW_GAP,
  stepNode,
  type WorkflowGraph,
} from "./graph";
import { LAYERED_DOCUMENT, TRIAGE_DOCUMENT } from "./test/documents";

function graphOf(
  document: Record<string, unknown>,
  folded: ReadonlySet<number> = new Set(),
): WorkflowGraph {
  const graph = buildGraph(describeWorkflow(document), { folded });

  if (graph === null) {
    throw new Error("The workflow has no graph.");
  }
  return graph;
}

describe("flowNodes", () => {
  const graph = graphOf(TRIAGE_DOCUMENT);
  const nodes = flowNodes(graph);

  it("draws each node at its centre, at its size, where no one can drag it", () => {
    const classify = graph.nodes.find((node) => node.id === stepNode("classify"));
    const drawn = nodes.find((node) => node.id === stepNode("classify"));

    expect(drawn?.type).toBe("step");
    expect(drawn?.position).toEqual({
      x: (classify?.x ?? 0) - STEP_SIZE.width / 2,
      y: (classify?.y ?? 0) - STEP_SIZE.height / 2,
    });
    expect([drawn?.width, drawn?.height]).toEqual([STEP_SIZE.width, STEP_SIZE.height]);
    expect([drawn?.draggable, drawn?.connectable]).toEqual([false, false]);
    expect(drawn?.ariaLabel).toBe("Classify ticket");
  });

  it("draws the input and the result as ends, each named", () => {
    const input = nodes.find((node) => node.id === INPUT_NODE);
    const result = nodes.find((node) => node.id === RESULT_NODE);

    expect(input?.type).toBe("start");
    expect(input?.position).toEqual({ x: -END_SIZE.width / 2, y: -END_SIZE.height / 2 });
    expect(input?.ariaLabel).toBe("The workflow's input");
    expect(result?.type).toBe("result");
    expect(result?.data).toEqual({ label: "answer" });
    expect(result?.ariaLabel).toBe("Result: answer");
  });

  it("gives each step the constants it reads and the workflow's result", () => {
    const merge = nodes.find((node) => node.id === stepNode("merge"));

    expect(merge?.data).toMatchObject({
      constants: [{ name: "limit", value: "3" }],
      result: "answer",
    });
    expect(nodes.find((node) => node.id === stepNode("classify"))?.data).toMatchObject({
      constants: [],
    });
  });

  it("gives steps no result when the workflow has none", () => {
    const steps = flowNodes(graphOf({ steps: [{ id: "a" }] }));

    expect(steps.map((node) => node.type)).toEqual(["start", "step"]);
    expect(steps[1]?.data).toMatchObject({ result: null });
  });
});

describe("flowEdges", () => {
  const edges = flowEdges(graphOf(TRIAGE_DOCUMENT));

  it("draws every edge of the graph as a workflow edge, with what it carries", () => {
    const branch = edges.find(
      (edge) => edge.id === `${stepNode("classify")}->${stepNode("draft-bug")}`,
    );

    expect(edges).toHaveLength(17);
    expect(branch?.type).toBe("workflow");
    expect(branch?.source).toBe(stepNode("classify"));
    expect(branch?.target).toBe(stepNode("draft-bug"));
    expect(branch?.data).toEqual({
      kind: "condition",
      label: "category is bug",
      names: ["notes"],
      conditions: ["category is bug"],
      points: [],
    });
    expect(
      edges.find((edge) => edge.id === `${stepNode("merge")}->${RESULT_NODE}`)?.data?.points,
    ).toEqual([{ x: 4 * COLUMN_GAP, y: 60 }]);
  });

  it("names each edge for a screen reader by what passes along it", () => {
    const named = Object.fromEntries(edges.map((edge) => [edge.id, edge.ariaLabel]));

    expect(named[`${INPUT_NODE}->${stepNode("classify")}`]).toBe(
      "the workflow's input passes ticket to Classify ticket",
    );
    expect(named[`${stepNode("classify")}->${stepNode("draft-bug")}`]).toBe(
      "Draft bug reply runs only when category is bug, from Classify ticket",
    );
    expect(named[`${stepNode("classify")}->${stepNode("log")}`]).toBe(
      "Record triage runs after Classify ticket",
    );
    expect(named[`${stepNode("polish")}->${RESULT_NODE}`]).toBe(
      "Polish answer passes answer to the result",
    );
  });
});

describe("canvasHeight", () => {
  it("fits the whole graph, but no shorter or taller than the page can use", () => {
    const wide = graphOf({
      steps: Array.from({ length: 12 }, (_, index) => ({ id: `s${String(index)}` })),
    });

    expect(canvasHeight(graphOf(LAYERED_DOCUMENT))).toBe(2 * ROW_GAP + STEP_SIZE.height + 120);
    expect(canvasHeight(graphOf({ steps: [{ id: "a" }] }))).toBe(320);
    expect(canvasHeight(wide)).toBe(560);
  });

  it("makes room for the lanes edges pass through", () => {
    const graph = graphOf({
      steps: [
        { id: "a" },
        { id: "b" },
        { id: "c", depends_on: ["a"] },
        { id: "d", depends_on: ["a", "b", "c"] },
      ],
    });
    const ys = graph.nodes.map((node) => node.y);

    expect(canvasHeight(graph)).toBe(348);
    expect(Math.max(...ys) - Math.min(...ys) + STEP_SIZE.height + 120).toBeLessThan(348);
  });
});

describe("openingNodes", () => {
  const graph = graphOf(TRIAGE_DOCUMENT);

  function columns(width: number): number[] {
    const ids = new Set(openingNodes(graph, width).map((node) => node.id));

    return [...new Set(graph.nodes.filter((node) => ids.has(node.id)).map((node) => node.column))];
  }

  it("opens a wide graph at its start, with as many columns as read well", () => {
    const fits = (count: number) =>
      ((count - 1) * COLUMN_GAP + STEP_SIZE.width + 120) * READABLE_ZOOM;

    expect(columns(fits(4))).toEqual([0, 1, 2, 3]);
    expect(columns(fits(4) - 1)).toEqual([0, 1, 2]);
    expect(columns(fits(6))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(columns(10_000)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("always shows the input and the first layer", () => {
    expect(columns(0)).toEqual([0, 1]);
    expect(openingNodes(graph, 0)).toEqual([{ id: INPUT_NODE }, { id: stepNode("classify") }]);
  });
});

describe("edgePath", () => {
  it("curves from the source to the target, leaving and arriving level", () => {
    const { path, label } = edgePath({ x: 0, y: 0 }, [], { x: 100, y: 100 });

    expect(path).toBe("M0,0 C50,0 50,100 100,100");
    expect(label).toEqual({ x: 50, y: 50 });
  });

  it("passes through each lane, level at each", () => {
    const { path, label } = edgePath({ x: 0, y: 0 }, [{ x: 100, y: 50 }], { x: 200, y: 0 });

    expect(path).toBe("M0,0 C50,0 50,50 100,50 C150,50 150,0 200,0");
    expect(label).toEqual({ x: 150, y: 25 });
  });

  it("rounds what it draws", () => {
    expect(edgePath({ x: 0.123, y: 0 }, [], { x: 1, y: 0 }).path).toBe(
      "M0.12,0 C0.56,0 0.56,0 1,0",
    );
  });
});

describe("viewportOn", () => {
  it("centres a point in what the canvas shows, at a readable zoom", () => {
    expect(viewportOn({ x: 100, y: -40 }, { width: 800, height: 500 }, 0)).toEqual({
      x: 400 - 100 * STEP_ZOOM,
      y: 250 + 40 * STEP_ZOOM,
      zoom: STEP_ZOOM,
    });
  });

  it("centres it beside the details covering the canvas's right edge", () => {
    expect(viewportOn({ x: 0, y: 0 }, { width: 1000, height: 400 }, 300).x).toBe(350);
  });
});

describe("a folded layer", () => {
  const document = {
    steps: [
      { id: "a" },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `b${String(index)}`,
        specification: { metadata: { name: `Branch ${String(index)}` } },
        depends_on: ["a"],
      })),
    ],
  };
  const graph = graphOf(document, new Set([1]));

  it("draws as one node the size of a step, naming the steps it stands for", () => {
    const fold = flowNodes(graph).find((node) => node.id === foldNode(1));

    expect(fold?.type).toBe("fold");
    expect(fold?.data).toEqual({
      layer: 2,
      titles: Array.from({ length: 6 }, (_, index) => `Branch ${String(index)}`),
    });
    expect([fold?.width, fold?.height]).toEqual([STEP_SIZE.width, STEP_SIZE.height]);
    expect(fold?.ariaLabel).toBe("Layer 2: 6 steps, folded");
  });

  it("names its edges for a screen reader by the layer", () => {
    expect(flowEdges(graph).map((edge) => edge.ariaLabel)).toContain(
      "the 6 steps of layer 2 runs after Unnamed step",
    );
  });
});

describe("detailAt", () => {
  it("shows everything close up, the name further out, and the shape furthest", () => {
    expect(detailAt(1)).toBe("full");
    expect(detailAt(0.6)).toBe("full");
    expect(detailAt(0.59)).toBe("name");
    expect(detailAt(0.3)).toBe("name");
    expect(detailAt(0.29)).toBe("shape");
  });
});
