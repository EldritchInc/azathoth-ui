/**
 * A workflow as a graph to draw: the workflow's input, each step and the
 * workflow's result as nodes, in columns from left to right, one column per
 * layer, and an edge wherever a value or a turn passes from one to the next.
 *
 * Edges follow what a step reads:
 *
 * - The workflow's input comes from the input node.
 * - An output of a named step comes from that step.
 * - A name read from the context comes from every step in an earlier layer
 *   that produces it, or from the input node when none does. Steps that
 *   produce it alongside the reader or after it are not its precursors; the
 *   reader's node keeps them, so the editor can say so.
 * - A constant comes from nowhere: the step shows it.
 * - A dependency that passes no value is an order edge, and a step that waits
 *   for nothing starts from the input node.
 *
 * Each pair of nodes has one edge at most, which carries every value and
 * condition between them. Within each column the rows are ordered so edges
 * cross as little as a few barycentre sweeps can make them.
 */

import { layers, type SourceView, type StepView, type WorkflowView } from "./documents";

/** What a node shows: the workflow's input, a step, or the workflow's result. */
export type NodeKind = "input" | "step" | "result";

/** The producers of a name a step reads that run alongside it or after it. */
export interface AlsoProduced {
  readonly name: string;
  readonly steps: readonly string[];
}

/** One node, with its column and row, and its centre in the graph's coordinates. */
export interface GraphNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly step: StepView | null;
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly alsoProducedBy: readonly AlsoProduced[];
}

/**
 * What an edge is: one that carries values, one that a condition reads (and
 * perhaps values besides), or one that only orders two steps.
 */
export type EdgeKind = "data" | "order" | "condition";

/** One edge, with the names of the values it carries and the conditions it decides. */
export interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: EdgeKind;
  readonly names: readonly string[];
  readonly conditions: readonly string[];
  readonly label: string;
}

/** A workflow's graph: its nodes, its edges, and how many columns they take. */
export interface WorkflowGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly columns: number;
}

/** The id of the node of the workflow's input. */
export const INPUT_NODE = "workflow:input";

/** The id of the node of the workflow's result. */
export const RESULT_NODE = "workflow:result";

/** The distance between two columns' centres. */
export const COLUMN_GAP = 300;

/** The distance between two rows' centres. */
export const ROW_GAP = 120;

const SWEEPS = 8;

/** Returns the id of a step's node. */
export function stepNode(id: string): string {
  return `step:${id}`;
}

interface Link {
  readonly source: string;
  readonly target: string;
  readonly names: string[];
  readonly conditions: string[];
}

function addOnce(items: string[], item: string): void {
  if (!items.includes(item)) {
    items.push(item);
  }
}

function nameOf(source: SourceView): string {
  switch (source.kind) {
    case "input":
      return source.field;
    case "step":
      return source.name ?? "its output";
    case "context":
      return source.name;
    case "constant":
    case "unknown":
      return "";
  }
}

type Point = readonly [number, number];

function turn(a: Point, b: Point, c: Point): number {
  return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

function countCrossings(
  at: ReadonlyMap<string, Point>,
  edges: readonly { readonly source: string; readonly target: string }[],
): number {
  const segments = edges.flatMap((edge): [Point, Point][] => {
    const from = at.get(edge.source);
    const to = at.get(edge.target);

    return from === undefined || to === undefined ? [] : [[from, to]];
  });
  let count = 0;

  segments.forEach(([a, b], index) => {
    for (const [c, d] of segments.slice(index + 1)) {
      if (turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0) {
        count += 1;
      }
    }
  });
  return count;
}

/** Returns how many pairs of a graph's edges cross, drawn straight between node centres. */
export function crossings(graph: WorkflowGraph): number {
  return countCrossings(
    new Map(graph.nodes.map((node) => [node.id, [node.x, node.y] as const])),
    graph.edges,
  );
}

function centred(index: number, size: number): number {
  return index - (size - 1) / 2;
}

function pointsOf(columns: readonly (readonly string[])[]): Map<string, Point> {
  return new Map(
    columns.flatMap((ids, column) =>
      ids.map((id, index) => [id, [column, centred(index, ids.length)] as const]),
    ),
  );
}

/**
 * Returns the columns with each one's rows reordered: each node at the mean
 * row of its neighbours, those before it on the sweep from left to right and
 * those after it on the sweep back, keeping the order with fewest crossings.
 * Every edge runs from a column to a later one.
 */
function arrange(columns: readonly (readonly string[])[], links: readonly Link[]): string[][] {
  let current = columns.map((ids) => [...ids]);
  let best = current;
  let fewest = countCrossings(pointsOf(current), links);

  const reorder = (column: number, before: boolean): void => {
    const at = pointsOf(current);
    const ids = current[column] ?? [];
    const neighbours = (id: string): number[] =>
      links.flatMap((link) => {
        const [self, other] = before ? [link.target, link.source] : [link.source, link.target];
        const point = at.get(other);

        return self === id && point !== undefined ? [point[1]] : [];
      });
    const weighed = ids.map((id, index) => {
      const ys = neighbours(id);
      const weight =
        ys.length === 0
          ? centred(index, ids.length)
          : ys.reduce((sum, y) => sum + y, 0) / ys.length;

      return { id, index, weight };
    });

    weighed.sort((a, b) => a.weight - b.weight || a.index - b.index);
    current[column] = weighed.map(({ id }) => id);
  };

  for (let sweep = 0; sweep < SWEEPS && fewest > 0; sweep += 1) {
    current = current.map((ids) => [...ids]);
    for (let column = 1; column < current.length; column += 1) {
      reorder(column, true);
    }
    for (let column = current.length - 2; column >= 0; column -= 1) {
      reorder(column, false);
    }

    const count = countCrossings(pointsOf(current), links);

    if (count < fewest) {
      fewest = count;
      best = current;
    }
  }
  return best;
}

/**
 * Returns a workflow's graph, with each column's rows ordered to keep edges
 * from crossing, or in the document's order when `arrange` is false.
 *
 * Returns `null` when the workflow's steps cannot be layered.
 */
export function buildGraph(
  view: WorkflowView,
  { arrange: arranged = true }: { readonly arrange?: boolean } = {},
): WorkflowGraph | null {
  const grouped = layers(view);

  if (grouped === null) {
    return null;
  }

  const depths = new Map(grouped.flatMap((layer, depth) => layer.map((step) => [step.id, depth])));
  const producers = new Map<string, string[]>();

  for (const step of view.steps) {
    for (const name of step.outputs) {
      const ids = producers.get(name) ?? [];

      addOnce(ids, step.id);
      producers.set(name, ids);
    }
  }

  const links = new Map<string, Link>();
  const link = (source: string, target: string): Link => {
    const id = `${source}->${target}`;
    const known = links.get(id) ?? { source, target, names: [], conditions: [] };

    links.set(id, known);
    return known;
  };
  const also = new Map<string, AlsoProduced[]>();

  for (const step of view.steps) {
    const depth = depths.get(step.id) ?? 0;
    const later: AlsoProduced[] = [];
    const origins = (source: SourceView): string[] => {
      switch (source.kind) {
        case "input":
          return [INPUT_NODE];
        case "step":
          return [stepNode(source.step)];
        case "context": {
          const others = (producers.get(source.name) ?? []).filter((id) => id !== step.id);
          const earlier = others.filter((id) => (depths.get(id) ?? 0) < depth);
          const rest = others.filter((id) => !earlier.includes(id));

          if (rest.length > 0 && !later.some((each) => each.name === source.name)) {
            later.push({ name: source.name, steps: rest });
          }
          return earlier.length > 0 ? earlier.map(stepNode) : [INPUT_NODE];
        }
        case "constant":
        case "unknown":
          return [];
      }
    };
    const target = stepNode(step.id);

    for (const input of step.inputs) {
      for (const origin of origins(input.source)) {
        addOnce(
          link(origin, target).names,
          input.source.kind === "input" ? input.name : nameOf(input.source),
        );
      }
    }
    for (const condition of step.when) {
      for (const origin of origins(condition.source)) {
        addOnce(link(origin, target).conditions, `${nameOf(condition.source)} ${condition.test}`);
      }
    }
    for (const id of step.dependsOn) {
      link(stepNode(id), target);
    }
    also.set(step.id, later);
  }

  const reached = new Set([...links.values()].map(({ target }) => target));

  for (const step of view.steps) {
    if (!reached.has(stepNode(step.id))) {
      link(INPUT_NODE, stepNode(step.id));
    }
  }

  const result = view.result;

  if (result !== null) {
    const ids = producers.get(result) ?? [];

    for (const origin of ids.length > 0 ? ids.map(stepNode) : [INPUT_NODE]) {
      addOnce(link(origin, RESULT_NODE).names, result);
    }
  }

  const columns: string[][] = [
    [INPUT_NODE],
    ...grouped.map((layer) => layer.map((step) => stepNode(step.id))),
    ...(result === null ? [] : [[RESULT_NODE]]),
  ];
  const ordered = arranged ? arrange(columns, [...links.values()]) : columns;
  const steps = new Map(view.steps.map((step) => [stepNode(step.id), step]));

  const nodes = ordered.flatMap((ids, column) =>
    ids.map((id, row): GraphNode => {
      const step = steps.get(id) ?? null;

      return {
        id,
        kind: step !== null ? "step" : id === INPUT_NODE ? "input" : "result",
        label: step?.title ?? (id === INPUT_NODE ? "Input" : (result ?? "")),
        step,
        column,
        row,
        x: column * COLUMN_GAP,
        y: centred(row, ids.length) * ROW_GAP,
        alsoProducedBy: step === null ? [] : (also.get(step.id) ?? []),
      };
    }),
  );
  const edges = [...links.entries()].map(([id, { source, target, names, conditions }]) => {
    const kind: EdgeKind =
      conditions.length > 0 ? "condition" : names.length > 0 ? "data" : "order";
    const label = kind === "condition" ? conditions.join("; ") : names.join(", ");

    return { id, source, target, kind, names, conditions, label };
  });

  return { nodes, edges, columns: ordered.length };
}
