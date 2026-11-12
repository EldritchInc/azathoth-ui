import type { Lineage, PullReport, PushReport, ReceivedRevision } from "../api/types";
import { useLineageNames } from "../lineageNames";
import { lineageKey, lineageLabel } from "../remotes";
import { Notice } from "./Notice";
import styles from "./Ship.module.css";

function count(number: number, one: string, many: string): string {
  return number === 1 ? `1 ${one}` : `${String(number)} ${many}`;
}

function Received({
  received,
  verb,
}: {
  readonly received: readonly ReceivedRevision[];
  readonly verb: string;
}) {
  const nameOf = useLineageNames();

  if (received.length === 0) {
    return null;
  }

  return (
    <ul className={styles.received} aria-label={verb}>
      {received.map((revision) => (
        <li key={revision.revision_digest}>
          {lineageLabel(revision.lineage, nameOf(revision.lineage))}{" "}
          <span className={styles.number}>as revision {revision.number}</span>
        </li>
      ))}
    </ul>
  );
}

function Lineages({
  lineages,
  label,
}: {
  readonly lineages: readonly Lineage[];
  readonly label: string;
}) {
  const nameOf = useLineageNames();

  return (
    <ul className={styles.received} aria-label={label}>
      {lineages.map((lineage) => (
        <li key={lineageKey(lineage)}>{lineageLabel(lineage, nameOf(lineage))}</li>
      ))}
    </ul>
  );
}

function Unresolved({ unresolved }: { readonly unresolved: readonly string[] }) {
  if (unresolved.length === 0) {
    return null;
  }

  return (
    <Notice title="Some of what it needs wasn't gathered" tone="note">
      <ul className={styles.lines}>
        {unresolved.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Notice>
  );
}

/**
 * What a push did: what the remote received, what it already held, and
 * each warning of what would stop it running there. A warning never
 * refused the push; it says what to fix at the remote.
 */
export function PushReportView({
  report,
  name,
}: {
  readonly report: PushReport;
  readonly name: string;
}) {
  const received = report.received.length;

  return (
    <div className={styles.report} role="status" aria-label="Push report">
      <p className={styles.summary}>
        {received === 0
          ? `${name} already held all of it: nothing was sent.`
          : `${name} received ${count(received, "revision", "revisions")}.`}{" "}
        {report.already_held > 0 && `${count(report.already_held, "was", "were")} already held. `}
        {report.content_sent > 0 &&
          `${count(report.content_sent, "file", "files")} of content sent.`}
      </p>
      <Received received={report.received} verb={`Received by ${name}`} />
      {report.warnings.length > 0 && (
        <Notice title={`Before it runs at ${name}`} tone="note">
          <ul className={styles.warnings} aria-label="Warnings">
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      )}
      <Unresolved unresolved={report.unresolved} />
    </div>
  );
}

/**
 * What a pull did: what was saved here, what it forked, and what it
 * withheld as restricted, which a pull that asks for restricted data brings.
 */
export function PullReportView({
  report,
  name,
  onIncludeRestricted,
}: {
  readonly report: PullReport;
  readonly name: string;
  readonly onIncludeRestricted?: () => void;
}) {
  const received = report.received.length;

  return (
    <div className={styles.report} role="status" aria-label="Pull report">
      <p className={styles.summary}>
        {received === 0
          ? `This instance already held everything pulled from ${name}.`
          : `Saved ${count(received, "revision", "revisions")} from ${name}.`}
      </p>
      <Received received={report.received} verb="Saved here" />
      {report.forked.length > 0 && (
        <Notice title="Forked here" tone="note">
          <p>
            Both sides had changed these. The pulled revision is now the latest here, and yours is
            the revision before it: keep theirs, or import yours again on top of it, then push.
          </p>
          <Lineages lineages={report.forked} label="Forked" />
        </Notice>
      )}
      {report.withheld.length > 0 && (
        <Notice title="Withheld as restricted" tone="note">
          <p>These hold restricted data, which a pull brings only when asked for.</p>
          <Lineages lineages={report.withheld} label="Withheld" />
          {onIncludeRestricted !== undefined && (
            <p>
              <button type="button" className={styles.link} onClick={onIncludeRestricted}>
                Pull the restricted ones too
              </button>
            </p>
          )}
        </Notice>
      )}
      <Unresolved unresolved={report.unresolved} />
    </div>
  );
}
