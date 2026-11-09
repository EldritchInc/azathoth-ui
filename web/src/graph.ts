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
 * condition between them. An edge that spans columns passes each column it
 * crosses through a lane of its own, between that column's nodes, so it never
 * runs behind a step. Within each column the nodes and lanes are ordered so
 * edges cross as little as a few barycentre sweeps can make them.
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

/** A point in the graph's coordinates. */
export interface GraphPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * One edge, with the names of the values it carries, the conditions it
 * decides, and the centre of each lane it passes through on its way.
 */
export interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: EdgeKind;
  readonly names: readonly string[];
  readonly conditions: readonly string[];
  readonly label: string;
  readonly points: readonly GraphPoint[];
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
export const COLUMN_GAP = 360;

/** The height of a node's row. */
export const ROW_GAP = 120;

/** The height of a lane an edge passes a column through. */
export const LANE_GAP = 40;

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

type Segment = readonly [string, string];

function turn(a: Point, b: Point, c: Point): number {
  return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

function countCrossings(lines: readonly (readonly [Point, Point])[]): number {
  let count = 0;

  lines.forEach(([a, b], index) => {
    for (const [c, d] of lines.slice(index + 1)) {
      if (turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0) {
        count += 1;
      }
    }
  });
  return count;
}

function linesOf(at: ReadonlyMap<string, Point>, segments: readonly Segment[]): [Point, Point][] {
  return segments.flatMap(([source, target]): [Point, Point][] => {
    const from = at.get(source);
    const to = at.get(target);

    return from === undefined || to === undefined ? [] : [[from, to]];
  });
}

/**
 * Returns how many pairs of a graph's edges cross, each drawn straight from
 * its source's centre through its lanes to its target's centre.
 */
export function crossings(graph: WorkflowGraph): number {
  const at = new Map(graph.nodes.map((node) => [node.id, [node.x, node.y] as const]));

  return countCrossings(
    graph.edges.flatMap((edge): [Point, Point][] => {
      const from = at.get(edge.source);
      const to = at.get(edge.target);

      if (from === undefined || to === undefined) {
        return [];
      }

      const path = [from, ...edge.points.map(({ x, y }) => [x, y] as const), to];

      return path.slice(1).map((point, index): [Point, Point] => [path[index] ?? point, point]);
    }),
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
 * Returns the columns with each one's nodes and lanes reordered: each at the
 * mean row of its neighbours, those before it on the sweep from left to
 * right and those after it on the sweep back, keeping the order with fewest
 * crossings. Every segment runs from one column to the next.
 */
function arrange(
  columns: readonly (readonly string[])[],
  segments: readonly Segment[],
): string[][] {
  let current = columns.map((ids) => [...ids]);
  let best = current;
  let fewest = countCrossings(linesOf(pointsOf(current), segments));

  const reorder = (column: number, before: boolean): void => {
    const at = pointsOf(current);
    const ids = current[column] ?? [];
    const neighbours = (id: string): number[] =>
      segments.flatMap(([source, target]) => {
        const [self, other] = before ? [target, source] : [source, target];
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

    const count = countCrossings(linesOf(pointsOf(current), segments));

    if (count < fewest) {
      fewest = count;
      best = current;
    }
  }
  return best;
}

/** Returns where each node and lane is: its column's x, and a y that centres the column. */
function place(
  columns: readonly (readonly string[])[],
  lanes: ReadonlySet<string>,
): Map<string, Point> {
  return new Map(
    columns.flatMap((ids, column) => {
      const heights = ids.map((id) => (lanes.has(id) ? LANE_GAP : ROW_GAP));
      let top = -heights.reduce((sum, height) => sum + height, 0) / 2;

      return ids.map((id, index): [string, Point] => {
        const height = heights[index] ?? ROW_GAP;
        const point: Point = [column * COLUMN_GAP, top + height / 2];

        top += height;
        return [id, point];
      });
    }),
  );
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
  const columnOf = new Map(columns.flatMap((ids, column) => ids.map((id) => [id, column])));
  const lanes = new Set<string>();
  const routes = new Map<string, string[]>();
  const segments: Segment[] = [];

  for (const [id, { source, target }] of links) {
    const from = columnOf.get(source) ?? 0;
    const to = columnOf.get(target) ?? from;
    const route = Array.from({ length: Math.max(0, to - from - 1) }, (_, index) => {
      const lane = `${id}@${String(from + index + 1)}`;

      lanes.add(lane);
      columns[from + index + 1]?.push(lane);
      return lane;
    });
    const path = [source, ...route, target];

    routes.set(id, route);
    segments.push(...path.slice(1).map((point, index): Segment => [path[index] ?? point, point]));
  }

  const ordered = arranged ? arrange(columns, segments) : columns;
  const at = place(ordered, lanes);
  const steps = new Map(view.steps.map((step) => [stepNode(step.id), step]));
  const pointOf = (id: string): Point => at.get(id) ?? [0, 0];

  const nodes = ordered.flatMap((ids, column) =>
    ids
      .filter((id) => !lanes.has(id))
      .map((id, row): GraphNode => {
        const step = steps.get(id) ?? null;
        const [x, y] = pointOf(id);

        return {
          id,
          kind: step !== null ? "step" : id === INPUT_NODE ? "input" : "result",
          label: step?.title ?? (id === INPUT_NODE ? "Input" : (result ?? "")),
          step,
          column,
          row,
          x,
          y,
          alsoProducedBy: step === null ? [] : (also.get(step.id) ?? []),
        };
      }),
  );
  const edges = [...links.entries()].map(([id, { source, target, names, conditions }]) => {
    const kind: EdgeKind =
      conditions.length > 0 ? "condition" : names.length > 0 ? "data" : "order";
    const label = kind === "condition" ? conditions.join("; ") : names.join(", ");
    const points = (routes.get(id) ?? []).map((lane) => {
      const [x, y] = pointOf(lane);

      return { x, y };
    });

    return { id, source, target, kind, names, conditions, label, points };
  });

  return { nodes, edges, columns: ordered.length };
}
