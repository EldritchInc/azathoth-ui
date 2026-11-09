import type { ReactNode } from "react";

import type { StepView } from "../documents";
import { stepNode, type GraphNode, type WorkflowGraph } from "../graph";
import { connections, type Connection } from "../paths";
import styles from "./StepInspector.module.css";

const KIND_NAMES: Record<StepView["kind"], string> = {
  prompt: "Prompt",
  tool: "Tool",
  unknown: "Step",
};

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      {children}
    </section>
  );
}

function NodeName({
  node,
  onSelect,
}: {
  readonly node: GraphNode;
  readonly onSelect: (id: string) => void;
}) {
  if (node.step === null) {
    return (
      <span className={styles.end}>
        {node.kind === "input" ? "The workflow's input" : "The result"}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={styles.jump}
      onClick={() => {
        onSelect(node.id);
      }}
    >
      {node.label}
    </button>
  );
}

function Passes({
  connection,
  leading,
}: {
  readonly connection: Connection;
  readonly leading: boolean;
}) {
  const { edge } = connection;

  return (
    <span className={styles.passes}>
      {edge.names.map((name) => (
        <code key={`name-${name}`} className={styles.value}>
          {name}
        </code>
      ))}
      {edge.conditions.map((condition) => (
        <span key={`condition-${condition}`} className={styles.condition}>
          only when {condition}
        </span>
      ))}
      {edge.kind === "order" && (
        <span className={styles.order}>
          {leading ? "waits for this step" : "this step waits for it"}
        </span>
      )}
    </span>
  );
}

function Joined({
  title,
  joined,
  leading,
  onSelect,
}: {
  readonly title: string;
  readonly joined: readonly Connection[];
  readonly leading: boolean;
  readonly onSelect: (id: string) => void;
}) {
  if (joined.length === 0) {
    return null;
  }
  return (
    <Section title={title}>
      <ul className={styles.joined}>
        {joined.map((connection) => (
          <li key={connection.edge.id}>
            <NodeName node={connection.node} onSelect={onSelect} />
            <Passes connection={connection} leading={leading} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * The step chosen on a workflow's graph: what it is, what it reads and from
 * where, what it leads to, and how it runs. Each step it names is a button
 * that moves there.
 */
export function StepInspector({
  graph,
  id,
  onSelect,
  onClose,
}: {
  readonly graph: WorkflowGraph;
  readonly id: string;
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
}) {
  const node = graph.nodes.find((each) => each.id === id);
  const step = node?.step ?? null;

  if (node === undefined || step === null) {
    return null;
  }

  const { from, to } = connections(graph, id);
  const titles = new Map(graph.nodes.map((each) => [each.id, each]));
  const constants = step.inputs.flatMap((input) =>
    input.source.kind === "constant" ? [{ name: input.name, value: input.source.value }] : [],
  );
  const failure = [
    step.attempts !== null && step.attempts > 1
      ? `tries up to ${String(step.attempts)} times`
      : null,
    step.onFailure,
  ].filter(Boolean);

  return (
    <aside className={styles.inspector} aria-label={`Step: ${step.title}`}>
      <header className={styles.header}>
        <div className={styles.titles}>
          <span className={styles.kind} data-kind={step.kind}>
            {KIND_NAMES[step.kind]}
            {step.tool !== null && ` · ${step.tool}`}
            {step.runtime !== null && ` · ${step.runtime}`}
          </span>
          <h3 className={styles.title}>{step.title}</h3>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label="Close the step"
          title="Close (Esc)"
          onClick={onClose}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      {step.description !== null && <p className={styles.description}>{step.description}</p>}
      {step.message !== null && <p className={styles.message}>Says “{step.message}” as it runs</p>}
      <Joined title="Comes from" joined={from} leading={false} onSelect={onSelect} />
      {constants.length > 0 && (
        <Section title="Constants">
          <ul className={styles.chips}>
            {constants.map((constant) => (
              <li key={constant.name} className={styles.constant}>
                {constant.name} = {constant.value}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {node.alsoProducedBy.length > 0 && (
        <Section title="Not read from">
          <ul className={styles.later}>
            {node.alsoProducedBy.map(({ name, steps }) => (
              <li key={name}>
                <code className={styles.value}>{name}</code> is also written by{" "}
                {steps.map((stepId, index) => {
                  const producer = titles.get(stepNode(stepId));

                  return (
                    <span key={stepId}>
                      {index > 0 && ", "}
                      {producer === undefined ? (
                        stepId
                      ) : (
                        <NodeName node={producer} onSelect={onSelect} />
                      )}
                    </span>
                  );
                })}
                , which it does not depend on, so it never reads it from there.
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Joined title="Leads to" joined={to} leading onSelect={onSelect} />
      {step.needs.length > 0 && (
        <Section title="Its model needs">
          <ul className={styles.chips}>
            {step.needs.map((need) => (
              <li key={need} className={styles.need}>
                {need}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {step.answers !== null && (
        <Section title="Answers in">
          <p>{step.answers}</p>
        </Section>
      )}
      {failure.length > 0 && (
        <Section title="If it fails">
          <p>{failure.join(", then ")}</p>
        </Section>
      )}
      {step.prompt !== null && (
        <details className={styles.prompt}>
          <summary>Prompt</summary>
          <pre>{step.prompt}</pre>
        </details>
      )}
    </aside>
  );
}
