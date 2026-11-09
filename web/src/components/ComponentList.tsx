import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { isBenchmarkSummary, isToolSummary, type Revision, type Summary } from "../api/types";
import { DESCRIPTIONS, detailPath, matches, type Kind } from "../kinds";
import { useList } from "../queries";
import { Command } from "./Command";
import styles from "./ComponentList.module.css";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";

interface Column {
  readonly header: string;
  readonly cell: (summary: Summary) => ReactNode;
}

const COUNT_COLUMNS: Readonly<Record<Kind, readonly Column[]>> = {
  workflows: [],
  tools: [
    {
      header: "Implementations",
      cell: (tool) => (isToolSummary(tool) ? tool.implementation_count : null),
    },
    { header: "Tests", cell: (tool) => (isToolSummary(tool) ? tool.test_case_count : null) },
  ],
  benchmarks: [
    {
      header: "Cases",
      cell: (benchmark) => (isBenchmarkSummary(benchmark) ? benchmark.case_count : null),
    },
  ],
};

function RevisionCell({ revision }: { readonly revision: Revision }) {
  return (
    <span className={styles.revision}>
      <span className={styles.revisionNumber}>{revision.number}</span>
      {revision.identical_to !== null && (
        <span className={styles.identical}>same as {revision.identical_to}</span>
      )}
    </span>
  );
}

function Skeleton({ label }: { readonly label: string }) {
  return (
    <div className={styles.skeleton} role="status" aria-label={label}>
      {[0, 1, 2].map((row) => (
        <div key={row} className={styles.skeletonRow}>
          <span className={styles.bar} />
          <span className={styles.barShort} />
        </div>
      ))}
    </div>
  );
}

/** One kind's list: every component of the kind in the local instance, filtered as typed. */
export function ComponentList({ kind }: { readonly kind: Kind }) {
  const description = DESCRIPTIONS[kind];
  const list = useList(kind);
  const [filter, setFilter] = useState("");
  const filterId = useId();
  const plural = description.title.toLowerCase();
  const columns = COUNT_COLUMNS[kind];

  let body: ReactNode;

  if (list.isPending) {
    body = <Skeleton label={`Loading ${plural}`} />;
  } else if (list.isError) {
    body = <Notice title={`Couldn't load ${plural}`}>{list.error.message}</Notice>;
  } else if (list.data.length === 0) {
    body = (
      <Notice title={`No ${plural} yet`} tone="note">
        <p>
          Your local instance has no {plural}. Import a {description.singular} document from your
          terminal:
        </p>
        <Command command={description.importCommand} />
      </Notice>
    );
  } else {
    const shown = list.data.filter((summary) => matches(summary, filter));

    body =
      shown.length === 0 ? (
        <Notice title={`No ${plural} match “${filter.trim()}”`} tone="note">
          <p>
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                setFilter("");
              }}
            >
              Clear the filter
            </button>
          </p>
        </Notice>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Version</th>
              {columns.map((column) => (
                <th key={column.header} scope="col" className={styles.number}>
                  {column.header}
                </th>
              ))}
              <th scope="col" className={styles.number}>
                Revision
              </th>
              <th scope="col">Imported</th>
              <th className={styles.remote} aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {shown.map((summary) => (
              <tr key={`${summary.id}@${summary.version}`}>
                <td className={styles.name}>
                  <div className={styles.nameStack}>
                    <Link className={styles.link} to={detailPath(kind, summary)}>
                      {summary.name}
                    </Link>
                    <span className={styles.description}>{summary.description}</span>
                  </div>
                </td>
                <td className={styles.version} data-label="Version">
                  {summary.version}
                </td>
                {columns.map((column) => (
                  <td key={column.header} className={styles.number} data-label={column.header}>
                    {column.cell(summary)}
                  </td>
                ))}
                <td className={styles.number} data-label="Revision">
                  <RevisionCell revision={summary.revision} />
                </td>
                <td className={styles.when} data-label="Imported">
                  <RelativeTime iso={summary.revision.imported_at} />
                </td>
                <td className={styles.remote} data-slot="remote-status" aria-hidden="true" />
              </tr>
            ))}
          </tbody>
        </table>
      );
  }

  const total = list.data?.length ?? 0;
  const shownCount = list.data?.filter((summary) => matches(summary, filter)).length ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{description.title}</h1>
        <p className={styles.lead}>{description.lead}</p>
      </header>
      {total > 0 && (
        <div className={styles.toolbar}>
          <label className="visually-hidden" htmlFor={filterId}>
            Filter {plural}
          </label>
          <input
            id={filterId}
            className={styles.filter}
            type="search"
            value={filter}
            placeholder="Filter by name, description, version or id"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
          />
          <p className={styles.count} aria-live="polite">
            {filter.trim() === ""
              ? `${String(total)} ${total === 1 ? description.singular : plural}`
              : `${String(shownCount)} of ${String(total)}`}
          </p>
        </div>
      )}
      {body}
    </div>
  );
}
