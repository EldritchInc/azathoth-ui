import { RUNS_LISTED } from "../api/client";
import type { RunSummary } from "../api/types";
import { DISPOSITION_NAMES } from "../feedback";
import { useWorkflowRuns } from "../queries";
import { duration } from "../running";
import { InstanceLink } from "./InstanceLink";
import { RelativeTime } from "./RelativeTime";
import styles from "./RunHistory.module.css";
import { SensitivityLabel } from "./SensitivityLabel";

function outcome(run: RunSummary): string {
  return run.succeeded ? "Succeeded" : "Failed";
}

/**
 * A workflow's kept runs, newest first: how each ended, when, how long it
 * took, whether it ran for production, its input's label (ADR 0011), and
 * how it was last judged (ADR 0012). Each opens the run (ADR 0007).
 */
export function RunHistory({ workflowId }: { readonly workflowId: string }) {
  const runs = useWorkflowRuns(workflowId);

  return (
    <section className={styles.section} aria-labelledby="runs-heading">
      <header className={styles.header}>
        <h2 id="runs-heading" className={styles.title}>
          Runs
        </h2>
        {runs.data !== undefined && runs.data.length >= RUNS_LISTED && (
          <p className={styles.note}>The {RUNS_LISTED} newest</p>
        )}
      </header>
      {runs.isPending && (
        <p className={styles.quiet} role="status">
          Loading its runs…
        </p>
      )}
      {runs.isError && <p className={styles.quiet}>Couldn’t load its runs: {runs.error.message}</p>}
      {runs.data?.length === 0 && (
        <p className={styles.quiet}>
          No runs yet. Run it, and each run is kept here with what every step did.
        </p>
      )}
      {runs.data !== undefined && runs.data.length > 0 && (
        <ol className={styles.list}>
          {runs.data.map((run) => (
            <li key={run.run_id}>
              <InstanceLink className={styles.run} to={`/runs/${run.run_id}`}>
                <span className={styles.state} data-state={outcome(run).toLowerCase()}>
                  {outcome(run)}
                </span>
                <span className={styles.when}>
                  <RelativeTime iso={run.started_at} />
                </span>
                <span className={styles.facts}>
                  {duration(run.started_at, run.completed_at)}
                  {run.workflow_revision !== null && ` · revision ${String(run.workflow_revision)}`}
                </span>
                {run.invocation_id !== null && <span className={styles.badge}>Production</span>}
                <SensitivityLabel sensitivity={run.sensitivity} />
                {run.feedback !== null && (
                  <span className={styles.judged} data-feedback={run.feedback}>
                    Judged {DISPOSITION_NAMES[run.feedback].toLowerCase()}
                  </span>
                )}
                {run.error !== null && <span className={styles.error}>{run.error.message}</span>}
              </InstanceLink>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
