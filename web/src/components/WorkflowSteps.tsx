import { useMemo, type ReactNode } from "react";

import { describeWorkflow, type StepView } from "../documents";
import styles from "./WorkflowSteps.module.css";

const KIND_LABELS: Record<StepView["kind"], string> = {
  prompt: "Prompt",
  tool: "Tool",
  unknown: "Step",
};

function Fact({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Step({ step, result }: { readonly step: StepView; readonly result: string | null }) {
  return (
    <li className={styles.step} data-kind={step.kind}>
      <span className={styles.marker} aria-hidden="true" />
      <div className={styles.heading}>
        <h3 className={styles.title}>{step.title}</h3>
        <span className={styles.kind}>
          {KIND_LABELS[step.kind]}
          {step.tool !== null && (
            <>
              {" "}
              <code>{step.tool}</code>
            </>
          )}
          {step.runtime !== null && ` (${step.runtime})`}
        </span>
      </div>
      {step.description !== null && <p className={styles.description}>{step.description}</p>}
      {step.message !== null && <p className={styles.message}>Says “{step.message}” as it runs</p>}
      <dl className={styles.facts}>
        {step.after.length > 0 && (
          <Fact term="Runs after">
            <ul className={styles.chips}>
              {step.after.map((name, index) => (
                <li key={`${String(index)}-${name}`} className={styles.chip}>
                  {name}
                </li>
              ))}
            </ul>
          </Fact>
        )}
        {step.conditions.length > 0 && (
          <Fact term="Runs only when">
            {step.conditions.map((condition, index) => (
              <p key={`${String(index)}-${condition}`}>{condition}</p>
            ))}
          </Fact>
        )}
        {step.inputs.length > 0 && (
          <Fact term="Inputs">
            <ul className={styles.pairs}>
              {step.inputs.map((input, index) => (
                <li key={`${String(index)}-${input.name}`}>
                  <code>{input.name}</code>
                  <span className={styles.from}>from {input.from}</span>
                </li>
              ))}
            </ul>
          </Fact>
        )}
        {step.outputs.length > 0 && (
          <Fact term="Outputs">
            <ul className={styles.chips}>
              {step.outputs.map((name, index) => (
                <li
                  key={`${String(index)}-${name}`}
                  className={styles.chip}
                  data-result={name === result ? "true" : undefined}
                >
                  <code>{name}</code>
                  {name === result && <span className={styles.resultMark}>result</span>}
                </li>
              ))}
            </ul>
          </Fact>
        )}
        {step.needs.length > 0 && (
          <Fact term="Its model needs">
            <ul className={styles.chips}>
              {step.needs.map((need) => (
                <li key={need} className={styles.need}>
                  {need}
                </li>
              ))}
            </ul>
          </Fact>
        )}
        {step.answers !== null && <Fact term="Answers in">{step.answers}</Fact>}
        {(step.attempts !== null || step.onFailure !== null) && (
          <Fact term="If it fails">
            {[
              step.attempts !== null && step.attempts > 1
                ? `tries up to ${String(step.attempts)} times`
                : null,
              step.onFailure,
            ]
              .filter(Boolean)
              .join(", then ")}
          </Fact>
        )}
      </dl>
      {step.prompt !== null && (
        <details className={styles.prompt}>
          <summary>Prompt</summary>
          <pre>{step.prompt}</pre>
        </details>
      )}
    </li>
  );
}

/** A workflow's steps, in its document's order, each with what it takes, gives and needs. */
export function WorkflowSteps({
  document,
}: {
  readonly document: Readonly<Record<string, unknown>>;
}) {
  const view = useMemo(() => describeWorkflow(document), [document]);
  const count = view.steps.length;

  return (
    <section className={styles.section} aria-labelledby="steps-heading">
      <header className={styles.header}>
        <h2 id="steps-heading" className={styles.sectionTitle}>
          Steps
        </h2>
        <p className={styles.summary}>
          {count === 1 ? "1 step" : `${String(count)} steps`}
          {view.result !== null && (
            <>
              , with <code>{view.result}</code> as the result
            </>
          )}
        </p>
      </header>
      {count === 0 ? (
        <p className={styles.summary}>This workflow has no steps the editor can read.</p>
      ) : (
        <ol className={styles.steps}>
          {view.steps.map((step, index) => (
            <Step key={step.id === "" ? index : step.id} step={step} result={view.result} />
          ))}
        </ol>
      )}
    </section>
  );
}
