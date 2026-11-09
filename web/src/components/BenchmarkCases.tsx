import { useMemo } from "react";

import { describeBenchmark } from "../documents";
import styles from "./Structure.module.css";

/** A benchmark's cases: each input, what is expected of it, and how that is compared. */
export function BenchmarkCases({
  document,
}: {
  readonly document: Readonly<Record<string, unknown>>;
}) {
  const view = useMemo(() => describeBenchmark(document), [document]);
  const count = view.cases.length;

  return (
    <section className={styles.section} aria-label="Cases">
      <div className={styles.titleRow}>
        <h2 className={styles.title}>Cases</h2>
        <p className={styles.quiet}>{count === 1 ? "1 case" : `${String(count)} cases`}</p>
      </div>
      {count === 0 ? (
        <p className={styles.quiet}>This benchmark has no cases the editor can read.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Input</th>
              <th scope="col">Expected</th>
              <th scope="col">Compared</th>
            </tr>
          </thead>
          <tbody>
            {view.cases.map((benchmarkCase, index) => (
              <tr key={`${String(index)}-${benchmarkCase.id}`}>
                <td>
                  <code className={styles.value}>{benchmarkCase.input}</code>
                </td>
                <td>
                  <code className={styles.value}>{benchmarkCase.expected}</code>
                  {benchmarkCase.description !== null && (
                    <span className={styles.quiet}>{benchmarkCase.description}</span>
                  )}
                </td>
                <td>
                  {benchmarkCase.comparison !== null && (
                    <span className={styles.comparison}>{benchmarkCase.comparison}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
