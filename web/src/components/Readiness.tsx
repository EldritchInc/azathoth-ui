import { Fragment } from "react";

import type { WorkflowReadiness } from "../api/types";
import { idOf, stepsOf, type JsonObject } from "../editing";
import { modelPath } from "../models";
import { titleOf } from "../problems";
import { InstanceLink } from "./InstanceLink";
import styles from "./Readiness.module.css";

/**
 * The models a step that can't run on restricted input could otherwise run
 * on, each linked to its page, where its policy can be declared (ADR 0011).
 */
function Declare({ models }: { readonly models: readonly string[] }) {
  return (
    <span className={styles.declare}>
      Declare that{" "}
      {models.map((model, index) => (
        <Fragment key={model}>
          {index > 0 && (index === models.length - 1 ? " or " : ", ")}
          <InstanceLink to={modelPath(model)}>{model}</InstanceLink>
        </Fragment>
      ))}{" "}
      neither retains nor trains on data, and it could run on restricted input.
    </span>
  );
}

/** Says what one ready step would run on: its first model and how many more, or its tool. */
function runsOn(models: readonly string[], kind: string): string {
  const [first, ...rest] = models;

  if (first === undefined) {
    return kind === "tool" ? "Runs its tool here." : "Ready.";
  }
  return rest.length === 0
    ? `Runs on ${first}.`
    : `Runs on ${first}, or ${String(rest.length)} more if it fails.`;
}

/**
 * Whether each step of a workflow could run here now, as Azathoth resolves
 * it (ADR 0007): the model a prompt step would run on first, or why a step
 * could not run.
 */
export function ReadinessList({
  readiness,
  document,
  couldUse,
}: {
  readonly readiness: WorkflowReadiness;
  readonly document: JsonObject;
  /** For restricted input: the models each step could run on, were its input not restricted. */
  readonly couldUse?: ReadonlyMap<string, readonly string[]>;
}) {
  const titles = new Map(stepsOf(document).map((step) => [idOf(step), titleOf(step)]));

  return (
    <ul className={styles.list} aria-label="Each step">
      {readiness.steps.map((step) => (
        <li key={step.step_id} className={styles.step} data-ready={step.ready}>
          <span className={styles.mark} aria-hidden="true">
            {step.ready ? "✓" : "!"}
          </span>
          <span className={styles.title}>{titles.get(step.step_id) ?? "A step"}</span>
          <span className={styles.detail}>
            {step.ready ? runsOn(step.models, step.kind) : (step.problem ?? "It can't run here.")}
          </span>
          {!step.ready && (couldUse?.get(step.step_id)?.length ?? 0) > 0 && (
            <Declare models={couldUse?.get(step.step_id) ?? []} />
          )}
        </li>
      ))}
    </ul>
  );
}
