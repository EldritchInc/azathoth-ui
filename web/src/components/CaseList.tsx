import type { ComponentDetail } from "../api/types";
import { SOURCE_NAMES } from "../benchmarking";
import { useBenchmarkCases } from "../queries";
import buttons from "./Buttons.module.css";
import styles from "./Benchmarks.module.css";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import { SensitivityLabel } from "./SensitivityLabel";
import structure from "./Structure.module.css";

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * A benchmark's Cases tab (ADR 0012): each case of the revision shown,
 * where it came from, how it is compared, whether it names citations, and
 * its label; and, at the latest revision, a way to add one.
 */
export function CaseList({ detail }: { readonly detail: ComponentDetail }) {
  const latest = detail.revision.number === detail.latest_number;
  const revision = latest ? null : detail.revision.number;
  const cases = useBenchmarkCases(detail.id, revision);
  const base = `/benchmarks/${encodeURIComponent(detail.id)}`;
  const at = revision === null ? "" : `?revision=${String(revision)}`;
  const count = cases.data?.length ?? 0;
  let body;

  if (cases.isPending) {
    body = (
      <p className={structure.quiet} role="status">
        Loading its cases…
      </p>
    );
  } else if (cases.isError) {
    body = <Notice title="Couldn't load its cases">{cases.error.message}</Notice>;
  } else if (count === 0) {
    body = (
      <p className={structure.quiet}>No cases yet. A benchmark can’t be run until it has one.</p>
    );
  } else {
    body = (
      <table className={structure.table}>
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">From</th>
            <th scope="col">Compared</th>
            <th scope="col">Cites</th>
            <th scope="col">Label</th>
          </tr>
        </thead>
        <tbody>
          {cases.data.map((each) => (
            <tr key={each.case_id}>
              <td>
                <InstanceLink
                  className={styles.link}
                  to={`${base}/cases/${encodeURIComponent(each.case_id)}${at}`}
                >
                  {each.description === "" ? each.case_id : each.description}
                </InstanceLink>
              </td>
              <td>
                {each.source_run_id === null ? (
                  SOURCE_NAMES[each.source]
                ) : (
                  <InstanceLink
                    className={styles.link}
                    to={`/runs/${encodeURIComponent(each.source_run_id)}`}
                  >
                    {SOURCE_NAMES[each.source]}
                  </InstanceLink>
                )}
              </td>
              <td>
                <span className={structure.comparison}>{each.comparison}</span>
              </td>
              <td>{each.cited ? "Yes" : "No"}</td>
              <td>
                <SensitivityLabel sensitivity={each.sensitivity} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section className={structure.section} aria-label="Cases">
      <div className={structure.titleRow}>
        <h2 className={structure.title}>Cases</h2>
        {cases.isSuccess && (
          <p className={structure.quiet}>{count === 1 ? "1 case" : `${String(count)} cases`}</p>
        )}
        {latest && (
          <InstanceLink className={buttons.primary} to={`${base}/cases/new`}>
            <PlusIcon />
            Add case
          </InstanceLink>
        )}
      </div>
      {!latest && (
        <Notice title={`These are revision ${String(detail.revision.number)}'s cases`} tone="note">
          <p>
            The latest is revision {detail.latest_number}.{" "}
            <InstanceLink className={styles.link} to={base}>
              Show the latest
            </InstanceLink>
          </p>
        </Notice>
      )}
      {body}
    </section>
  );
}
