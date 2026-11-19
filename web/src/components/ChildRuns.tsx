import { useId } from "react";

import type { ChildStatus, RunChildSummary } from "../api/types";
import { useList, useRunChildren } from "../queries";
import { InstanceLink } from "./InstanceLink";
import { RelativeTime } from "./RelativeTime";
import styles from "./RunEvidence.module.css";

const STATUS_NAMES: Readonly<Record<ChildStatus, string>> = {
  succeeded: "Succeeded",
  failed: "Failed",
  unfinished: "Unfinished",
};

function ChildItem({
  child,
  workflow,
  step,
}: {
  readonly child: RunChildSummary;
  readonly workflow: string;
  readonly step: string;
}) {
  return (
    <li className={styles.item}>
      <p className={styles.line}>
        <span className={styles.status} data-status={child.status}>
          {STATUS_NAMES[child.status]}
        </span>
        {child.command === null ? (
          <span className={styles.name}>{workflow}</span>
        ) : (
          <InstanceLink className={styles.name} to={`/runs/${child.child_run_id}`}>
            {workflow}
          </InstanceLink>
        )}
        {child.depth > 1 && <span className={styles.depth}>{String(child.depth)} levels down</span>}
        <span className={styles.muted}>
          <RelativeTime iso={child.started_at} />
        </span>
      </p>
      <p className={styles.muted}>
        Started by {step}, attempt {String(child.parent_attempt)}
        {child.child_invocation_id !== null && (
          <>
            {" · "}
            <InstanceLink to={`/invocations/${child.child_invocation_id}`}>
              Its invocation
            </InstanceLink>
          </>
        )}
      </p>
    </li>
  );
}

/**
 * The runs a run's steps started, oldest first: which step and attempt
 * started each, how it ended, and a link to it once it finished, or to
 * the invocation it executed (ADR 0012).
 */
export function ChildRuns({
  runId,
  titles,
}: {
  readonly runId: string;
  /** Each step of the revision the run ran, by id, as it is titled. */
  readonly titles: ReadonlyMap<string, string>;
}) {
  const children = useRunChildren(runId);
  const workflows = useList("workflows");
  const heading = useId();
  const names = new Map((workflows.data ?? []).map((workflow) => [workflow.id, workflow.name]));

  return (
    <section className={styles.section} aria-labelledby={heading}>
      <h2 id={heading} className={styles.title}>
        Child runs
      </h2>
      {children.isPending && (
        <p className={styles.muted} role="status">
          Loading its child runs…
        </p>
      )}
      {children.isError && (
        <p className={styles.muted}>Couldn’t load its child runs: {children.error.message}</p>
      )}
      {children.data?.length === 0 && (
        <p className={styles.muted}>None of its steps started another run.</p>
      )}
      {children.data !== undefined && children.data.length > 0 && (
        <ol className={styles.list} aria-label="Child runs">
          {children.data.map((child) => (
            <ChildItem
              key={child.child_run_id}
              child={child}
              workflow={names.get(child.child_workflow_id) ?? `Workflow ${child.child_workflow_id}`}
              step={titles.get(child.parent_step_id) ?? "a step"}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
