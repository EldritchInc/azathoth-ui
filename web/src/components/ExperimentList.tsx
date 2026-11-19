import { EXPERIMENTS_LISTED } from "../api/client";
import { scoreOf } from "../benchmarking";
import { useWorkflowExperiments } from "../queries";
import styles from "./Benchmarks.module.css";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";
import { SensitivityLabel } from "./SensitivityLabel";
import structure from "./Structure.module.css";

function counted(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/**
 * A workflow's Experiments tab (ADR 0013): each experiment its optimization
 * recorded, newest first, with the benchmark and the revision it ran, its
 * candidates and cases, its winner's score and its label. Each opens its
 * page.
 */
export function ExperimentList({ workflowId }: { readonly workflowId: string }) {
  const experiments = useWorkflowExperiments(workflowId);
  let body;

  if (experiments.isPending) {
    body = (
      <p className={structure.quiet} role="status">
        Loading its experiments…
      </p>
    );
  } else if (experiments.isError) {
    body = <Notice title="Couldn't load its experiments">{experiments.error.message}</Notice>;
  } else if (experiments.data.length === 0) {
    body = (
      <p className={structure.quiet}>
        No experiments yet. Optimize the workflow, and each generation is kept here.
      </p>
    );
  } else {
    body = (
      <table className={structure.table}>
        <thead>
          <tr>
            <th scope="col">Experiment</th>
            <th scope="col">Recorded</th>
            <th scope="col">Benchmark</th>
            <th scope="col">Ran</th>
            <th scope="col">Winner</th>
            <th scope="col">Label</th>
          </tr>
        </thead>
        <tbody>
          {experiments.data.map((experiment) => (
            <tr key={experiment.experiment_id}>
              <td>
                <InstanceLink
                  className={styles.link}
                  to={`/experiments/${encodeURIComponent(experiment.experiment_id)}`}
                >
                  <code>{experiment.experiment_id.slice(0, 8)}</code>
                </InstanceLink>
              </td>
              <td>
                <RelativeTime iso={experiment.recorded_at} />
              </td>
              <td>
                {experiment.benchmark_id === null ? (
                  "None"
                ) : (
                  <InstanceLink
                    className={styles.link}
                    to={`/benchmarks/${encodeURIComponent(experiment.benchmark_id)}${
                      experiment.benchmark_revision === null
                        ? ""
                        : `?revision=${String(experiment.benchmark_revision)}`
                    }`}
                  >
                    {experiment.benchmark_revision === null
                      ? "Its benchmark"
                      : `revision ${String(experiment.benchmark_revision)}`}
                  </InstanceLink>
                )}
              </td>
              <td>
                {counted(experiment.candidate_count, "candidate", "candidates")},{" "}
                {counted(experiment.case_count, "case", "cases")}
              </td>
              <td>{scoreOf(experiment.winner_score)}</td>
              <td>
                <SensitivityLabel sensitivity={experiment.sensitivity} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section className={structure.section} aria-label="Experiments">
      <div className={structure.titleRow}>
        <h2 className={structure.title}>Experiments</h2>
        {experiments.data !== undefined && experiments.data.length >= EXPERIMENTS_LISTED && (
          <p className={structure.quiet}>The {EXPERIMENTS_LISTED} newest</p>
        )}
      </div>
      {body}
    </section>
  );
}
