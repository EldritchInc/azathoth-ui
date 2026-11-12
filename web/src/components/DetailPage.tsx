import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import type { ComponentDetail } from "../api/types";
import { DESCRIPTIONS, parseRevision, type ComponentRef, type Kind } from "../kinds";
import { useDetail, useHistory } from "../queries";
import buttons from "./Buttons.module.css";
import { Command } from "./Command";
import styles from "./DetailPage.module.css";
import { DocumentView } from "./DocumentView";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";
import { RevisionHistory } from "./RevisionHistory";
import { Ship } from "./Ship";

const MISSING_CODES = new Set(["not_found", "revision_not_found", "invalid_argument"]);

/**
 * One component's page: the revision the address names, the latest by
 * default, with its command, a readable view of its document, the document
 * itself, and every revision to move between.
 */
export function DetailPage({
  kind,
  component,
  children,
  actions,
}: {
  readonly kind: Kind;
  readonly component: ComponentRef;
  readonly children: (detail: ComponentDetail) => ReactNode;
  readonly actions?: ReactNode;
}) {
  const [search] = useSearchParams();
  const asked = parseRevision(search.get("revision"));
  const detail = useDetail(kind, component, asked);
  const history = useHistory(kind, component);
  const description = DESCRIPTIONS[kind];
  const [shipping, setShipping] = useState(false);

  const crumbs = (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      <Link to={description.path}>{description.title}</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">
        {detail.data?.name ?? component.id}
        {kind === "tools" && component.version !== undefined && ` ${component.version}`}
      </span>
    </nav>
  );

  if (detail.isPending) {
    return (
      <div className={styles.page}>
        {crumbs}
        <p className={styles.loading} role="status">
          Loading this {description.singular}…
        </p>
      </div>
    );
  }

  if (detail.isError) {
    const missing = MISSING_CODES.has(detail.error.code);

    return (
      <div className={styles.page}>
        {crumbs}
        <Notice
          title={
            missing
              ? `No ${description.singular} at this address`
              : `Couldn't load this ${description.singular}`
          }
        >
          <p>{detail.error.message}</p>
          <p>
            <Link className={styles.back} to={description.path}>
              Back to {description.title.toLowerCase()}
            </Link>
          </p>
        </Notice>
      </div>
    );
  }

  const shown = detail.data;
  const revision = shown.revision;
  const latest = revision.number === shown.latest_number;
  const fileName = `${shown.name.replace(/[^\w.-]+/g, "-")}-${shown.version}-r${String(revision.number)}.json`;

  return (
    <div className={styles.page}>
      {crumbs}
      <header className={styles.header}>
        <div className={styles.titles}>
          <h1 className={styles.title}>{shown.name}</h1>
          {shown.description !== "" && <p className={styles.lead}>{shown.description}</p>}
          <div className={styles.actions}>
            {actions}
            <button
              type="button"
              className={buttons.quiet}
              aria-expanded={shipping}
              onClick={() => {
                setShipping((open) => !open);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3v12M7 8l5-5 5 5" />
                <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
              </svg>
              Ship
            </button>
          </div>
        </div>
        <div className={styles.remote} data-slot="remote-status" aria-hidden="true" />
        <dl className={styles.facts}>
          <div>
            <dt>Version</dt>
            <dd className={styles.mono}>{shown.version}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>
              {revision.number} of {shown.latest_number}
            </dd>
          </div>
          <div>
            <dt>Imported</dt>
            <dd>
              <RelativeTime iso={revision.imported_at} />
            </dd>
          </div>
          <div>
            <dt>Digest</dt>
            <dd className={styles.mono} title={revision.content_digest}>
              {revision.content_digest.slice(0, 12)}
            </dd>
          </div>
        </dl>
      </header>
      {shipping && (
        <Ship
          kind={kind}
          component={component}
          label={kind === "tools" ? `${shown.name} ${shown.version}` : shown.name}
        />
      )}
      {!latest && (
        <Notice title={`This is revision ${String(revision.number)}`} tone="note">
          <p>
            The latest is revision {shown.latest_number}.{" "}
            <Link className={styles.back} to={{ search: "" }}>
              Show the latest
            </Link>
          </p>
        </Notice>
      )}
      {revision.identical_to !== null && (
        <p className={styles.identical}>
          Same content as revision {revision.identical_to}: this revision returned to it.
        </p>
      )}
      <Command command={shown.command} />
      <div className={styles.body}>
        <div className={styles.main}>
          {children(shown)}
          <DocumentView document={shown.document} fileName={fileName} />
        </div>
        <aside className={styles.aside}>
          <RevisionHistory
            history={history}
            current={revision.number}
            latest={shown.latest_number}
          />
        </aside>
      </div>
    </div>
  );
}
