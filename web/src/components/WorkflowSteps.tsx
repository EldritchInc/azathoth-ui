import { useId, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { describeWorkflow, layers, type StepView } from "../documents";
import { buildGraph } from "../graph";
import { isNarrow, readStepsView, saveStepsView, type StepsView } from "../stepsView";
import { browserStorage } from "../theme";
import { StepsGraph } from "./StepsGraph";
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

function Step({
  step,
  result,
  card = false,
  current = false,
}: {
  readonly step: StepView;
  readonly result: string | null;
  readonly card?: boolean;
  readonly current?: boolean;
}) {
  return (
    <li
      className={card ? styles.card : styles.step}
      data-kind={step.kind}
      aria-current={current ? "step" : undefined}
    >
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

const VIEW_NAMES: Record<StepsView, string> = {
  graph: "Graph",
  outline: "Outline",
};

const VIEW_ICONS: Record<StepsView, ReactNode> = {
  graph: (
    <>
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="19" cy="6" r="2.2" />
      <circle cx="19" cy="18" r="2.2" />
      <path d="M7.1 11 16.8 6.9M7.1 13l9.7 4.1" />
    </>
  ),
  outline: <path d="M4 6h16M4 12h16M4 18h10" />,
};

function ViewSwitch({
  view,
  onChoose,
}: {
  readonly view: StepsView;
  readonly onChoose: (view: StepsView) => void;
}) {
  const name = useId();

  return (
    <div className={styles.switch} role="radiogroup" aria-label="Show the steps as">
      {(["graph", "outline"] as const).map((option) => (
        <label key={option} className={styles.option}>
          <input
            className={styles.input}
            type="radio"
            name={name}
            value={option}
            checked={view === option}
            onChange={() => {
              onChoose(option);
            }}
          />
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {VIEW_ICONS[option]}
          </svg>
          {VIEW_NAMES[option]}
        </label>
      ))}
    </div>
  );
}

/**
 * A workflow's steps, each with what it takes, gives and needs: as a graph
 * of columns and arrows, or as an outline of layers, as the person chooses.
 * Steps that cannot be layered are listed in the document's order.
 *
 * The step chosen on the graph is named in the address as `?step=`, so a
 * link opens on it; the outline marks it.
 */
export function WorkflowSteps({
  document,
}: {
  readonly document: Readonly<Record<string, unknown>>;
}) {
  const view = useMemo(() => describeWorkflow(document), [document]);
  const grouped = useMemo(() => layers(view), [view]);
  const graph = useMemo(() => buildGraph(view), [view]);
  const [search, setSearch] = useSearchParams();
  const selected = search.get("step");
  const [chosen, setChosen] = useState<StepsView>(() =>
    readStepsView(browserStorage(), isNarrow(window)),
  );
  const count = view.steps.length;
  const shown = graph === null || count === 0 ? "outline" : chosen;

  const choose = (next: StepsView): void => {
    setChosen(next);
    saveStepsView(browserStorage(), next);
  };

  const select = (step: string | null): void => {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);

        if (step === null) {
          next.delete("step");
        } else {
          next.set("step", step);
        }
        return next;
      },
      { replace: true },
    );
  };

  return (
    <section className={styles.section} aria-labelledby="steps-heading">
      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 id="steps-heading" className={styles.sectionTitle}>
            Steps
          </h2>
          <p className={styles.summary}>
            {count === 1 ? "1 step" : `${String(count)} steps`}
            {grouped !== null && grouped.length > 1 && ` in ${String(grouped.length)} layers`}
            {view.result !== null && (
              <>
                , with <code>{view.result}</code> as the result
              </>
            )}
          </p>
        </div>
        {graph !== null && count > 0 && <ViewSwitch view={shown} onChoose={choose} />}
      </header>
      {count === 0 ? (
        <p className={styles.summary}>This workflow has no steps the editor can read.</p>
      ) : shown === "graph" && graph !== null ? (
        <StepsGraph graph={graph} selected={selected} onSelect={select} />
      ) : grouped !== null ? (
        <ol className={styles.layers}>
          {grouped.map((layer, index) => (
            <li
              key={layer.map((step) => step.id).join(" ")}
              className={styles.layer}
              aria-label={
                layer.length > 1
                  ? `Layer ${String(index + 1)}: ${String(layer.length)} steps that can run at once`
                  : `Layer ${String(index + 1)}`
              }
            >
              <ol className={styles.row}>
                {layer.map((step) => (
                  <Step
                    key={step.id}
                    step={step}
                    result={view.result}
                    card
                    current={step.id === selected}
                  />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <p className={styles.note}>
            Its steps can’t be drawn as a graph or set out in layers, so they’re listed as the
            document orders them.
          </p>
          <ol className={styles.steps}>
            {view.steps.map((step, index) => (
              <Step
                key={step.id === "" ? index : step.id}
                step={step}
                result={view.result}
                current={step.id !== "" && step.id === selected}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
