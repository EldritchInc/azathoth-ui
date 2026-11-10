import type { WorkflowReadiness } from "../api/types";
import { idOf, stepsOf, type JsonObject } from "../editing";
import { titleOf } from "../problems";
import styles from "./Readiness.module.css";

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
}: {
  readonly readiness: WorkflowReadiness;
  readonly document: JsonObject;
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
        </li>
      ))}
    </ul>
  );
}
