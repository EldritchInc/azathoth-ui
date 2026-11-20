import { useId } from "react";
import { useParams, useSearchParams } from "react-router";

import type { RevisionChange } from "../api/types";
import {
  comparedRevisions,
  diffCommand,
  MARKS,
  shownValue,
  WITHHELD,
  type ComparedRevisions,
} from "../diffing";
import { DESCRIPTIONS, detailPath, type ComponentRef, type Kind } from "../kinds";
import { useDetail, useRevisionComparison } from "../queries";
import { Command } from "./Command";
import pages from "./DetailPage.module.css";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import styles from "./RevisionDiff.module.css";

/** The words each kind of change is read out with. */
const KIND_NAMES: Record<RevisionChange["kind"], string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};

/** One side of a change, its JSON, or that it is withheld. */
function Value({ value, withheld }: { readonly value: unknown; readonly withheld: boolean }) {
  const shown = shownValue(value, withheld);

  return shown === WITHHELD ? (
    <span className={styles.withheld}>withheld, restricted</span>
  ) : (
    <span>{shown}</span>
  );
}

/** One value that differs: its mark, its path, and its value before and after. */
function Change({ change }: { readonly change: RevisionChange }) {
  return (
    <li className={styles.change} data-kind={change.kind}>
      <span className={styles.mark} aria-label={KIND_NAMES[change.kind]} role="img">
        {MARKS[change.kind]}
      </span>
      <code className={styles.pointer}>{change.pointer === "" ? "/" : change.pointer}</code>
      <span className={styles.values}>
        {change.kind === "added" && <Value value={change.after} withheld={change.withheld} />}
        {change.kind === "removed" && <Value value={change.before} withheld={change.withheld} />}
        {change.kind === "changed" && (
          <>
            <Value value={change.before} withheld={change.withheld} />
            {" → "}
            <Value value={change.after} withheld={change.withheld} />
          </>
        )}
      </span>
    </li>
  );
}

/** What differs between the two revisions named, as Azathoth compares them. */
function Comparison({
  kind,
  component,
  compared,
}: {
  readonly kind: Kind;
  readonly component: ComponentRef;
  readonly compared: ComparedRevisions;
}) {
  const comparison = useRevisionComparison(kind, component, compared.before, compared.after);

  if (comparison.isPending) {
    return (
      <p className={styles.quiet} role="status">
        Comparing revisions {compared.before} and {compared.after}…
      </p>
    );
  }

  if (comparison.isError) {
    return (
      <Notice title="Couldn't compare these revisions">
        <p>{comparison.error.message}</p>
      </Notice>
    );
  }

  const { changes, identical } = comparison.data;
  const withheld = changes.some((change) => change.withheld);

  return (
    <section className={styles.changes} aria-labelledby="changes-heading">
      <h2 id="changes-heading" className={styles.heading}>
        Changes
      </h2>
      {identical ? (
        <p className={styles.quiet}>
          Revisions {compared.before} and {compared.after} are identical.
        </p>
      ) : (
        <>
          <p className={styles.quiet}>
            {changes.length === 1 ? "1 value differs" : `${String(changes.length)} values differ`},
            each by where it is in the document.
          </p>
          {withheld && (
            <Notice title="Some values are withheld" tone="note">
              <p>
                A restricted case&apos;s values are left out where restricted data may not be read.
              </p>
            </Notice>
          )}
          <ol className={styles.list}>
            {changes.map((change) => (
              <Change key={`${change.kind}:${change.pointer}`} change={change} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/**
 * `…/diff?before=&after=`: what differs between two revisions of a
 * workflow, a tool version or a benchmark (ADR 0015). The latest revision
 * and the one before it unless the address names others; either can be
 * changed, and each choice is kept in the address. The `azathoth … diff`
 * command that prints the same comparison is shown.
 */
export function RevisionDiffPage({ kind }: { readonly kind: Kind }) {
  const { id = "", version } = useParams();
  const component: ComponentRef = version === undefined ? { id } : { id, version };
  const [search, setSearch] = useSearchParams();
  const latest = useDetail(kind, component, null);
  const description = DESCRIPTIONS[kind];
  const ids = { before: useId(), after: useId() };
  const page = detailPath(kind, { id, version: version ?? "" });

  const crumbs = (
    <nav className={pages.crumbs} aria-label="Breadcrumb">
      <InstanceLink to={description.path}>{description.title}</InstanceLink>
      <span aria-hidden="true">/</span>
      <InstanceLink to={page}>
        {latest.data?.name ?? id}
        {version !== undefined && ` ${version}`}
      </InstanceLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">Compare</span>
    </nav>
  );

  if (latest.isPending) {
    return (
      <div className={pages.page}>
        {crumbs}
        <p className={pages.loading} role="status">
          Loading this {description.singular}…
        </p>
      </div>
    );
  }

  if (latest.isError) {
    return (
      <div className={pages.page}>
        {crumbs}
        <Notice title={`Couldn't load this ${description.singular}`}>
          <p>{latest.error.message}</p>
        </Notice>
      </div>
    );
  }

  const newest = latest.data.latest_number;
  const compared = comparedRevisions(search.get("before"), search.get("after"), newest);
  const numbers = Array.from({ length: newest }, (_, index) => newest - index);

  const choose = (side: keyof ComparedRevisions, value: string): void => {
    const next = { ...compared, [side]: Number(value) };

    setSearch({ before: String(next.before), after: String(next.after) });
  };

  return (
    <div className={pages.page}>
      {crumbs}
      <header>
        <h1 className={pages.title}>Compare revisions of {latest.data.name}</h1>
      </header>
      <form
        className={styles.choices}
        aria-label="Revisions to compare"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        {(["before", "after"] as const).map((side) => (
          <div key={side} className={styles.field}>
            <label htmlFor={ids[side]}>{side === "before" ? "From revision" : "To revision"}</label>
            <select
              id={ids[side]}
              className={styles.select}
              value={String(compared[side])}
              onChange={(event) => {
                choose(side, event.target.value);
              }}
            >
              {numbers.map((number) => (
                <option key={number} value={String(number)}>
                  {number === newest ? `${String(number)}, latest` : String(number)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </form>
      <Command command={diffCommand(kind, component, compared)} />
      <Comparison kind={kind} component={component} compared={compared} />
    </div>
  );
}
