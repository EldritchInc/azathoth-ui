/**
 * Moving about a workflow's graph: the paths that lead to a node and away
 * from it, and the node an arrow key moves to.
 */

import { stepNode, type GraphEdge, type GraphNode, type WorkflowGraph } from "./graph";

const STEP_PREFIX = stepNode("");

/** The nodes and edges on the paths through one node, which the graph keeps lit. */
export interface Highlight {
  readonly nodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
}

/** A direction an arrow key moves in. */
export type Direction = "left" | "right" | "up" | "down";

function reach(graph: WorkflowGraph, from: string, forward: boolean): Set<string> {
  const next = new Map<string, string[]>();

  for (const edge of graph.edges) {
    const [here, there] = forward ? [edge.source, edge.target] : [edge.target, edge.source];

    next.set(here, [...(next.get(here) ?? []), there]);
  }

  const reached = new Set<string>();
  const waiting = [from];

  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    for (const other of next.get(id) ?? []) {
      if (!reached.has(other)) {
        reached.add(other);
        waiting.push(other);
      }
    }
  }
  return reached;
}

/**
 * Returns what lies on the paths through a node: every node it comes from
 * and every node that comes from it, and the edges between them along the
 * way. An edge that skips past the node, from one of its sources straight to
 * one of its followers, is not on a path through it.
 */
export function highlight(graph: WorkflowGraph, id: string): Highlight {
  const before = reach(graph, id, false);
  const after = reach(graph, id, true);
  const edges = graph.edges.filter(
    ({ source, target }) =>
      (before.has(source) && (target === id || before.has(target))) ||
      (after.has(target) && (source === id || after.has(source))),
  );

  return {
    nodes: new Set([...before, id, ...after]),
    edges: new Set(edges.map((edge) => edge.id)),
  };
}

function nearest(candidates: readonly GraphNode[], here: GraphNode): GraphNode | null {
  const distance = (node: GraphNode): readonly [number, number] => [
    Math.abs(node.column - here.column),
    Math.abs(node.y - here.y),
  ];

  return candidates.reduce<GraphNode | null>((best, node) => {
    if (best === null) {
      return node;
    }

    const [columns, rows] = distance(node);
    const [bestColumns, bestRows] = distance(best);

    return columns < bestColumns || (columns === bestColumns && rows < bestRows) ? node : best;
  }, null);
}

/**
 * Returns the node an arrow key moves to from a node: left to the closest
 * node it comes from, right to the closest it leads to (the nearest column
 * first, then the nearest row), or, without one, the closest node in the
 * column beside it; up and down to its neighbour in its own column. Returns
 * `null` when there is nowhere to go.
 */
export function neighbour(graph: WorkflowGraph, id: string, direction: Direction): string | null {
  const here = graph.nodes.find((node) => node.id === id);

  if (here === undefined) {
    return null;
  }
  if (direction === "up" || direction === "down") {
    const row = here.row + (direction === "up" ? -1 : 1);

    return graph.nodes.find((node) => node.column === here.column && node.row === row)?.id ?? null;
  }

  const forward = direction === "right";
  const linked = new Set(
    graph.edges.flatMap((edge) =>
      forward ? (edge.source === id ? [edge.target] : []) : edge.target === id ? [edge.source] : [],
    ),
  );
  const column = here.column + (forward ? 1 : -1);
  const choices = graph.nodes.filter((node) => linked.has(node.id));
  const beside = graph.nodes.filter((node) => node.column === column);

  return nearest(choices.length > 0 ? choices : beside, here)?.id ?? null;
}

/** Returns the node of a step named in an address, or `null` when the graph has no such step. */
export function nodeOfStep(graph: WorkflowGraph, step: string | null): string | null {
  if (step === null) {
    return null;
  }

  const id = stepNode(step);

  return graph.nodes.some((node) => node.id === id) ? id : null;
}

/** Returns the step a node shows, or `null` for the input and the result. */
export function stepOfNode(id: string): string | null {
  return id.startsWith(STEP_PREFIX) ? id.slice(STEP_PREFIX.length) : null;
}

/** One node a node is joined to, and what passes between them. */
export interface Connection {
  readonly node: GraphNode;
  readonly edge: GraphEdge;
}

/** The nodes a node comes from and those it leads to, each set out by column, then row. */
export interface Connections {
  readonly from: readonly Connection[];
  readonly to: readonly Connection[];
}

/** Returns what a node is joined to, on each side. */
export function connections(graph: WorkflowGraph, id: string): Connections {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const joined = (other: (edge: GraphEdge) => string | null): Connection[] =>
    graph.edges
      .flatMap((edge) => {
        const otherId = other(edge);
        const node = otherId === null ? undefined : nodes.get(otherId);

        return node === undefined ? [] : [{ node, edge }];
      })
      .sort((a, b) => a.node.column - b.node.column || a.node.row - b.node.row);

  return {
    from: joined((edge) => (edge.target === id ? edge.source : null)),
    to: joined((edge) => (edge.source === id ? edge.target : null)),
  };
}
