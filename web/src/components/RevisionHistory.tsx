import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "react-router";

import type { ApiFailure } from "../api/client";
import type { Summary } from "../api/types";
import { RelativeTime } from "./RelativeTime";
import styles from "./RevisionHistory.module.css";

/** A component's revisions, newest first, each opening its own page. */
export function RevisionHistory({
  history,
  current,
  latest,
}: {
  readonly history: UseQueryResult<Summary[], ApiFailure>;
  readonly current: number;
  readonly latest: number;
}) {
  return (
    <nav className={styles.history} aria-labelledby="history-heading">
      <h2 id="history-heading" className={styles.title}>
        Revisions
      </h2>
      {history.isPending && <p className={styles.quiet}>Loading revisions…</p>}
      {history.isError && <p className={styles.quiet}>{history.error.message}</p>}
      {history.isSuccess && (
        <ol className={styles.list}>
          {history.data.map((entry) => {
            const number = entry.revision.number;

            return (
              <li key={number}>
                <Link
                  className={styles.entry}
                  to={{ search: number === latest ? "" : `?revision=${String(number)}` }}
                  aria-current={number === current ? "page" : undefined}
                >
                  <span className={styles.number}>Revision {number}</span>
                  {number === latest && <span className={styles.latest}>latest</span>}
                  <span className={styles.when}>
                    <RelativeTime iso={entry.revision.imported_at} />
                    {entry.revision.identical_to !== null &&
                      `, same as ${String(entry.revision.identical_to)}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}
