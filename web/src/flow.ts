/**
 * A workflow's graph as React Flow draws it: a node of a fixed size for the
 * input, each step and the result, each placed by its centre, and an edge of
 * one kind for each edge of the graph.
 */

import type { Edge, Node } from "@xyflow/react";

import type { StepView } from "./documents";
import {
  COLUMN_GAP,
  type EdgeKind,
  type GraphEdge,
  type GraphPoint,
  type NodeKind,
  type WorkflowGraph,
} from "./graph";

/*
 * React Flow needs node and edge data it can read as a record of strings to
 * values, which an interface is not, so these are readonly object types.
 */

/** A step's node: its view, and what it reads as constants. */
export type StepNodeData = Readonly<{
  step: StepView;
  constants: readonly { readonly name: string; readonly value: string }[];
  result: string | null;
}>;

/** The input's or the result's node: the name it shows. */
export type EndNodeData = Readonly<{
  label: string;
}>;

/** The node of one step. */
export type StepFlowNode = Node<StepNodeData, "step">;

/** The node of the workflow's input (its start) or its result. */
export type EndFlowNode = Node<EndNodeData, "start" | "result">;

/** Any node of a workflow's graph. */
export type FlowNode = StepFlowNode | EndFlowNode;

/** An edge: what it is, and what it carries. */
export type FlowEdgeData = Readonly<{
  kind: EdgeKind;
  label: string;
  names: readonly string[];
  conditions: readonly string[];
  points: readonly GraphPoint[];
}>;

/** An edge of a workflow's graph. */
export type FlowEdge = Edge<FlowEdgeData, "workflow">;

/** The size of a step's node. */
export const STEP_SIZE = { width: 216, height: 88 } as const;

/** The size of the input's and the result's nodes. */
export const END_SIZE = { width: 128, height: 44 } as const;

const END_NAMES: Readonly<Record<NodeKind, string>> = {
  input: "the workflow's input",
  result: "the result",
  step: "a step",
};

const MINIMUM_HEIGHT = 320;
const MAXIMUM_HEIGHT = 560;
const MARGIN = 120;

/** The smallest zoom at which a step's name still reads well. */
export const READABLE_ZOOM = 0.75;

function edgeName(edge: GraphEdge, names: ReadonlyMap<string, string>): string {
  const from = names.get(edge.source) ?? edge.source;
  const to = names.get(edge.target) ?? edge.target;

  switch (edge.kind) {
    case "data":
      return `${from} passes ${edge.label} to ${to}`;
    case "condition":
      return `${to} runs only when ${edge.label}, from ${from}`;
    case "order":
      return `${to} runs after ${from}`;
  }
}

/** Returns the nodes React Flow draws for a workflow's graph. */
export function flowNodes(graph: WorkflowGraph): FlowNode[] {
  const result = graph.nodes.find((node) => node.kind === "result")?.label ?? null;

  return graph.nodes.map((node): FlowNode => {
    if (node.step === null) {
      const label = node.kind === "result" ? `Result: ${node.label}` : "The workflow's input";

      return {
        id: node.id,
        type: node.kind === "result" ? "result" : "start",
        position: { x: node.x - END_SIZE.width / 2, y: node.y - END_SIZE.height / 2 },
        data: { label: node.label },
        width: END_SIZE.width,
        height: END_SIZE.height,
        ariaLabel: label,
        draggable: false,
        connectable: false,
      };
    }

    const constants = node.step.inputs.flatMap((input) =>
      input.source.kind === "constant" ? [{ name: input.name, value: input.source.value }] : [],
    );

    return {
      id: node.id,
      type: "step",
      position: { x: node.x - STEP_SIZE.width / 2, y: node.y - STEP_SIZE.height / 2 },
      data: { step: node.step, constants, result },
      width: STEP_SIZE.width,
      height: STEP_SIZE.height,
      ariaLabel: node.step.title,
      draggable: false,
      connectable: false,
    };
  });
}

/** Returns the edges React Flow draws for a workflow's graph, each named for a screen reader. */
export function flowEdges(graph: WorkflowGraph): FlowEdge[] {
  const names = new Map(
    graph.nodes.map((node) => [node.id, node.step === null ? END_NAMES[node.kind] : node.label]),
  );

  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "workflow",
    data: {
      kind: edge.kind,
      label: edge.label,
      names: edge.names,
      conditions: edge.conditions,
      points: edge.points,
    },
    ariaLabel: edgeName(edge, names),
  }));
}

/** How far along an edge's last hop its label sits: halfway, where columns are farthest apart. */
const LABEL_AT = 0.5;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function pair(x: number, y: number): string {
  return `${String(rounded(x))},${String(rounded(y))}`;
}

function cubic(t: number, a: number, b: number, c: number, d: number): number {
  const u = 1 - t;

  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/**
 * Returns an edge's SVG path from its source through the lanes it passes to
 * its target, each hop a curve that leaves and arrives level, and where its
 * label sits on the last hop.
 */
export function edgePath(
  source: GraphPoint,
  points: readonly GraphPoint[],
  target: GraphPoint,
): { readonly path: string; readonly label: GraphPoint } {
  const stops = [source, ...points, target];
  const hops = stops.slice(1).map((to, index) => {
    const from = stops[index] ?? source;
    const middle = (from.x + to.x) / 2;

    return {
      from,
      to,
      middle,
      text: `C${pair(middle, from.y)} ${pair(middle, to.y)} ${pair(to.x, to.y)}`,
    };
  });
  const last = hops.at(-1) ?? { from: source, to: target, middle: source.x, text: "" };

  return {
    path: `M${pair(source.x, source.y)} ${hops.map((hop) => hop.text).join(" ")}`,
    label: {
      x: rounded(cubic(LABEL_AT, last.from.x, last.middle, last.middle, last.to.x)),
      y: rounded(cubic(LABEL_AT, last.from.y, last.from.y, last.to.y, last.to.y)),
    },
  };
}

/**
 * Returns the nodes the canvas first shows on a canvas of a width: every
 * column that fits at a readable zoom, from the input on, and at least the
 * input and the first layer, so a wide graph opens at its start.
 */
export function openingNodes(graph: WorkflowGraph, width: number): { readonly id: string }[] {
  const shown = width / READABLE_ZOOM - STEP_SIZE.width - MARGIN;
  const columns = Math.max(1, Math.floor(shown / COLUMN_GAP));

  return graph.nodes.filter((node) => node.column <= columns).map((node) => ({ id: node.id }));
}

/** Returns how tall the canvas is for a graph: enough for all of it, within bounds. */
export function canvasHeight(graph: WorkflowGraph): number {
  const ys = [
    ...graph.nodes.map((node) => node.y),
    ...graph.edges.flatMap((edge) => edge.points.map((point) => point.y)),
  ];
  const span = ys.length === 0 ? 0 : Math.max(...ys) - Math.min(...ys);

  return Math.min(MAXIMUM_HEIGHT, Math.max(MINIMUM_HEIGHT, span + STEP_SIZE.height + MARGIN));
}
