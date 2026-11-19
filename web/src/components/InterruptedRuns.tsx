import { useId } from "react";
import { useNavigate } from "react-router";

import type { InterruptedRun, LiveRun } from "../api/types";
import { useInterruptedRuns, useResumeInvocation, useResumeRun } from "../queries";
import { usePage } from "../scope";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import styles from "./InterruptedRuns.module.css";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";

function resumed(times: number): string {
  if (times === 0) {
    return "never resumed";
  }
  return times === 1 ? "resumed once" : `resumed ${String(times)} times`;
}

function InterruptedItem({
  run,
  resuming,
  onResume,
}: {
  readonly run: InterruptedRun;
  readonly resuming: boolean;
  readonly onResume: () => void;
}) {
  return (
    <li className={styles.item}>
      <span className={styles.state} data-state="interrupted">
        Interrupted
      </span>
      <span className={styles.facts}>
        started <RelativeTime iso={run.started_at} /> · last recorded{" "}
        <RelativeTime iso={run.last_recorded_at} />
        {run.workflow_revision !== null && ` · revision ${String(run.workflow_revision)}`}
        {` · ${resumed(run.resumes)}`}
      </span>
      {run.invocation_id !== null && (
        <span className={styles.production}>
          <span className={styles.badge}>Production</span>
          <InstanceLink to={`/invocations/${run.invocation_id}`}>Its invocation</InstanceLink>
        </span>
      )}
      <ActionButton
        action={run.invocation_id === null ? "run_workflow" : "invoke"}
        subject={run.workflow_id}
        type="button"
        className={buttons.quiet}
        disabled={resuming}
        aria-busy={resuming}
        onClick={onResume}
      >
        {resuming ? "Resuming…" : "Resume"}{" "}
        <span className="visually-hidden">run {run.run_id}</span>
      </ActionButton>
    </li>
  );
}

/**
 * A workflow's runs that started and never finished, newest first, each
 * resumed from where its journal stopped as a live run: the `run_workflow`
 * action, or for a run that executes an invocation, resumed as that
 * invocation, the `invoke` action (ADRs 0010 and 0012). Nothing is shown
 * while none is interrupted.
 */
export function InterruptedRuns({ workflowId }: { readonly workflowId: string }) {
  const interrupted = useInterruptedRuns(workflowId);
  const resumeRun = useResumeRun();
  const resumeInvocation = useResumeInvocation();
  const navigate = useNavigate();
  const pageOf = usePage();
  const heading = useId();
  const resumingRun = resumeRun.isPending ? resumeRun.variables.runId : null;
  const resumingInvocation = resumeInvocation.isPending ? resumeInvocation.variables : null;
  const failed = resumeRun.error ?? resumeInvocation.error;

  const opened = {
    onSuccess: (live: LiveRun) => {
      void navigate(pageOf(`/live/${live.handle}`));
    },
  };

  if (interrupted.isError) {
    return (
      <p className={styles.quiet}>
        Couldn’t list its interrupted runs: {interrupted.error.message}
      </p>
    );
  }

  if (interrupted.data === undefined || interrupted.data.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-labelledby={heading}>
      <header className={styles.header}>
        <h2 id={heading} className={styles.title}>
          Interrupted runs
        </h2>
        <p className={styles.quiet}>
          They stopped before they finished. Resume one to finish it from where its journal stopped.
        </p>
      </header>
      <ol className={styles.list} aria-labelledby={heading}>
        {interrupted.data.map((run) => (
          <InterruptedItem
            key={run.run_id}
            run={run}
            resuming={
              run.invocation_id === null
                ? resumingRun === run.run_id
                : resumingInvocation === run.invocation_id
            }
            onResume={() => {
              if (run.invocation_id === null) {
                resumeInvocation.reset();
                resumeRun.mutate({ runId: run.run_id, workflowId }, opened);
              } else {
                resumeRun.reset();
                resumeInvocation.mutate(run.invocation_id, opened);
              }
            }}
          />
        ))}
      </ol>
      {failed !== null && <Notice title="Couldn't resume the run">{failed.message}</Notice>}
    </section>
  );
}
