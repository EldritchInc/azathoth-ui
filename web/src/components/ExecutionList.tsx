import { EXECUTIONS_LISTED } from "../api/client";
import { EXECUTION_KIND_NAMES, passedOf, scoreOf } from "../benchmarking";
import { useBenchmarkExecutions } from "../queries";
import styles from "./Benchmarks.module.css";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";
import { SensitivityLabel } from "./SensitivityLabel";
import structure from "./Structure.module.css";

/**
 * A benchmark's Executions tab (ADR 0012): each saved run and comparison,
 * newest first, with the revision it ran and how many cases each workflow
 * passed, best first in a comparison. Each opens its execution.
 */
export function ExecutionList({ benchmarkId }: { readonly benchmarkId: string }) {
  const executions = useBenchmarkExecutions(benchmarkId);
  let body;

  if (executions.isPending) {
    body = (
      <p className={structure.quiet} role="status">
        Loading its executions…
      </p>
    );
  } else if (executions.isError) {
    body = <Notice title="Couldn't load its executions">{executions.error.message}</Notice>;
  } else if (executions.data.length === 0) {
    body = (
      <p className={structure.quiet}>
        No executions yet. Run or compare workflows against it, and each is kept here.
      </p>
    );
  } else {
    body = (
      <table className={structure.table}>
        <thead>
          <tr>
            <th scope="col">Execution</th>
            <th scope="col">Recorded</th>
            <th scope="col">Revision</th>
            <th scope="col">Workflows</th>
            <th scope="col">Label</th>
          </tr>
        </thead>
        <tbody>
          {executions.data.map((execution) => (
            <tr key={execution.execution_id}>
              <td>
                <InstanceLink
                  className={styles.link}
                  to={`/benchmark-executions/${encodeURIComponent(execution.execution_id)}`}
                >
                  {EXECUTION_KIND_NAMES[execution.kind]}
                </InstanceLink>
              </td>
              <td>
                <RelativeTime iso={execution.recorded_at} />
              </td>
              <td>{execution.benchmark_revision ?? "—"}</td>
              <td>
                <ol className={styles.candidates}>
                  {execution.candidates.map((candidate) => (
                    <li key={candidate.candidate_id}>
                      {candidate.workflow_name}: {passedOf(candidate)}
                      {candidate.overall_score !== null &&
                        `, scoring ${scoreOf(candidate.overall_score)}`}
                    </li>
                  ))}
                </ol>
              </td>
              <td>
                <SensitivityLabel sensitivity={execution.sensitivity} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section className={structure.section} aria-label="Executions">
      <div className={structure.titleRow}>
        <h2 className={structure.title}>Executions</h2>
        {executions.data !== undefined && executions.data.length >= EXECUTIONS_LISTED && (
          <p className={structure.quiet}>The {EXECUTIONS_LISTED} newest</p>
        )}
      </div>
      {body}
    </section>
  );
}
