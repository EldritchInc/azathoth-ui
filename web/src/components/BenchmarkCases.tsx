import { useMemo } from "react";

import type { Sensitivity } from "../api/types";
import { describeBenchmark } from "../documents";
import { useRevealing } from "../revealing";
import { RestrictedNotice, RestrictedScope } from "./Restricted";
import { SensitivityLabel } from "./SensitivityLabel";
import styles from "./Structure.module.css";

/**
 * A benchmark's cases: each input, what is expected of it, how that is
 * compared, and its label; and the benchmark's own label, its most
 * sensitive case's. A restricted case's input and expected output are
 * hidden until shown (ADR 0011).
 */
export function BenchmarkCases(props: {
  readonly document: Readonly<Record<string, unknown>>;
  readonly sensitivity: Sensitivity | null;
}) {
  return (
    <RestrictedScope>
      <Cases {...props} />
    </RestrictedScope>
  );
}

function Cases({
  document,
  sensitivity,
}: {
  readonly document: Readonly<Record<string, unknown>>;
  /** The benchmark's label, as Azathoth gives it. */
  readonly sensitivity: Sensitivity | null;
}) {
  const view = useMemo(() => describeBenchmark(document), [document]);
  const { revealed } = useRevealing();
  const count = view.cases.length;

  return (
    <section className={styles.section} aria-label="Cases">
      <div className={styles.titleRow}>
        <h2 className={styles.title}>Cases</h2>
        <p className={styles.quiet}>{count === 1 ? "1 case" : `${String(count)} cases`}</p>
      </div>
      {sensitivity !== null && (
        <p className={styles.quiet}>
          The benchmark is labelled <SensitivityLabel sensitivity={sensitivity} />, as its most
          sensitive case is.
        </p>
      )}
      {count === 0 ? (
        <p className={styles.quiet}>This benchmark has no cases the editor can read.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Input</th>
              <th scope="col">Expected</th>
              <th scope="col">Compared</th>
              <th scope="col">Label</th>
            </tr>
          </thead>
          <tbody>
            {view.cases.map((benchmarkCase, index) => (
              <tr key={`${String(index)}-${benchmarkCase.id}`}>
                {benchmarkCase.sensitivity === "restricted" && !revealed ? (
                  <td colSpan={2}>
                    <RestrictedNotice
                      what={`case ${benchmarkCase.id}`}
                      subject={benchmarkCase.id}
                      inline
                    />
                  </td>
                ) : (
                  <>
                    <td>
                      <code className={styles.value}>{benchmarkCase.input}</code>
                    </td>
                    <td>
                      <code className={styles.value}>{benchmarkCase.expected}</code>
                      {benchmarkCase.description !== null && (
                        <span className={styles.quiet}>{benchmarkCase.description}</span>
                      )}
                    </td>
                  </>
                )}
                <td>
                  {benchmarkCase.comparison !== null && (
                    <span className={styles.comparison}>{benchmarkCase.comparison}</span>
                  )}
                </td>
                <td>
                  <SensitivityLabel sensitivity={benchmarkCase.sensitivity} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
