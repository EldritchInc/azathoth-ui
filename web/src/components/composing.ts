/**
 * What a graph needs to change the workflow it draws: what is wrong with
 * each step, a way to make an edit, and a way to make an id.
 */

import { createContext } from "react";

import {
  addInput,
  canConnect,
  connect,
  disconnect,
  disconnectInput,
  WORKFLOW_INPUT,
  type JsonObject,
} from "../editing";
import { INPUT_NODE, RESULT_NODE, type GraphEdge } from "../graph";
import { stepOfNode } from "../paths";

/** The graph's way to change the workflow it draws. */
export interface Composing {
  /** What is wrong with each step, by its id. */
  readonly problems: ReadonlyMap<string, readonly string[]>;
  /** Makes one edit to the document as it stands. */
  readonly change: (edit: (document: JsonObject) => JsonObject) => void;
  /** Returns a new UUID. */
  readonly newId: () => string;
  /** Returns the document as it stands. */
  readonly document: JsonObject;
}

/** The composing of the graph being drawn, or `null` when it is only shown. */
export const ComposingContext = createContext<Composing | null>(null);

/** Returns each step's problems, by its id, from a list of a document's problems. */
export function problemsByStep(
  found: readonly { readonly step: string | null; readonly message: string }[],
): Map<string, string[]> {
  const byStep = new Map<string, string[]>();

  for (const { step, message } of found) {
    if (step !== null) {
      byStep.set(step, [...(byStep.get(step) ?? []), message]);
    }
  }
  return byStep;
}

/**
 * Returns whether the composer can remove an edge: not one to the result,
 * which a step's details change, nor one that only starts a step.
 */
export function removable(edge: GraphEdge): boolean {
  return edge.target !== RESULT_NODE && !(edge.source === INPUT_NODE && edge.names.length === 0);
}

/** One edit to a document. */
export type Edit = (document: JsonObject) => JsonObject;

/**
 * What the graph offers to do after two nodes are joined: pass one of the
 * first step's outputs to the second, or make one of them the result. Each
 * names its nodes by their ids in the graph.
 */
export type Offer =
  | { readonly kind: "pass"; readonly from: string; readonly to: string }
  | { readonly kind: "result"; readonly from: string };

/**
 * Returns what joining two nodes of the graph does: the input to a step
 * makes it read the workflow's input; a step to the result offers to make
 * one of its outputs the result; a step to a step runs the second after the
 * first, when it can, and offers to pass a value. Returns `null` when the
 * two cannot be joined.
 */
export function joining(
  document: JsonObject,
  source: string,
  target: string,
): { readonly edit: Edit | null; readonly offer: Offer | null } | null {
  const from = stepOfNode(source);
  const to = stepOfNode(target);

  if (source === INPUT_NODE && to !== null) {
    return { edit: (current) => addInput(current, to, "input", WORKFLOW_INPUT), offer: null };
  }
  if (from !== null && target === RESULT_NODE) {
    return { edit: null, offer: { kind: "result", from: source } };
  }
  if (from !== null && to !== null && canConnect(document, from, to)) {
    return {
      edit: (current) => connect(current, from, to),
      offer: { kind: "pass", from: source, to: target },
    };
  }
  return null;
}

/** Returns the edit that removes an edge of the graph, or `null` when it cannot be removed. */
export function unjoining(edge: GraphEdge): Edit | null {
  const from = stepOfNode(edge.source);
  const to = stepOfNode(edge.target);

  if (!removable(edge) || to === null) {
    return null;
  }
  return from === null
    ? (current) => disconnectInput(current, to)
    : (current) => disconnect(current, from, to);
}
