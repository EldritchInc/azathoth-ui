import type { StepKind } from "../editing";
import { INPUT_NODE, RESULT_NODE, type GraphEdge, type WorkflowGraph } from "../graph";
import styles from "./ComposerBar.module.css";
import { removable, type Offer } from "./composing";

function nameOf(graph: WorkflowGraph, id: string): string {
  if (id === INPUT_NODE) {
    return "The workflow's input";
  }
  if (id === RESULT_NODE) {
    return "the result";
  }
  return graph.nodes.find((node) => node.id === id)?.label ?? "a step";
}

function outputsOf(graph: WorkflowGraph, id: string): readonly string[] {
  return graph.nodes.find((node) => node.id === id)?.step?.outputs ?? [];
}

/**
 * The bar that composes a workflow on its graph: it adds a step, after the
 * chosen one or at the start, removes the chosen step or link, and, once
 * two nodes are joined, offers what can pass between them.
 */
export function ComposerBar({
  graph,
  chosen,
  edge,
  offer,
  onAdd,
  onRemoveStep,
  onRemoveEdge,
  onPass,
  onResult,
  onDismiss,
}: {
  readonly graph: WorkflowGraph;
  readonly chosen: string | null;
  readonly edge: GraphEdge | null;
  readonly offer: Offer | null;
  readonly onAdd: (kind: StepKind) => void;
  readonly onRemoveStep: () => void;
  readonly onRemoveEdge: () => void;
  readonly onPass: (output: string) => void;
  readonly onResult: (output: string) => void;
  readonly onDismiss: () => void;
}) {
  if (offer !== null) {
    const outputs = outputsOf(graph, offer.from);
    const from = nameOf(graph, offer.from);

    return (
      <div className={styles.bar} role="group" aria-label="Pass a value">
        <span className={styles.text}>
          {offer.kind === "pass"
            ? `${nameOf(graph, offer.to)} now runs after ${from}.`
            : `Which of ${from}'s outputs is the result?`}
        </span>
        {outputs.length === 0 ? (
          <span className={styles.quiet}>
            {offer.kind === "pass" ? "It writes nothing to pass." : "It writes nothing yet."}
          </span>
        ) : (
          <>
            {offer.kind === "pass" && <span className={styles.quiet}>Pass</span>}
            {outputs.map((output) => (
              <button
                key={output}
                type="button"
                className={styles.value}
                onClick={() => {
                  if (offer.kind === "pass") {
                    onPass(output);
                  } else {
                    onResult(output);
                  }
                }}
              >
                {output}
              </button>
            ))}
          </>
        )}
        <button type="button" className={styles.action} onClick={onDismiss}>
          {offer.kind === "pass" && outputs.length > 0 ? "Not now" : "Done"}
        </button>
      </div>
    );
  }

  if (edge !== null) {
    return (
      <div className={styles.bar} role="group" aria-label="The chosen link">
        <span className={styles.text}>
          {nameOf(graph, edge.source)} → {nameOf(graph, edge.target)}
        </span>
        {removable(edge) ? (
          <button type="button" className={styles.danger} onClick={onRemoveEdge}>
            Remove link
          </button>
        ) : (
          <span className={styles.quiet}>Change the result in its step&apos;s details.</span>
        )}
      </div>
    );
  }

  const step = chosen === null ? null : nameOf(graph, chosen);

  return (
    <div className={styles.bar} role="group" aria-label="Compose">
      <span className={styles.text}>{step === null ? "Add a step" : `After ${step}:`}</span>
      <button
        type="button"
        className={styles.action}
        onClick={() => {
          onAdd("prompt");
        }}
      >
        + Prompt step
      </button>
      <button
        type="button"
        className={styles.action}
        onClick={() => {
          onAdd("tool");
        }}
      >
        + Tool step
      </button>
      {step !== null && (
        <button type="button" className={styles.danger} onClick={onRemoveStep}>
          Remove step
        </button>
      )}
    </div>
  );
}
