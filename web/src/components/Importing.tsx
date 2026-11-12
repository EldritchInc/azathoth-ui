import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Link } from "react-router";

import type { Outcome } from "../importing";
import { DESCRIPTIONS, detailPath, type Kind } from "../kinds";
import styles from "./Importing.module.css";

function filesOf(list: FileList | null): File[] {
  return list === null ? [] : Array.from(list);
}

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

/** A button that chooses documents of one kind to import. */
export function ImportButton({
  kind,
  busy,
  onFiles,
  quiet = false,
}: {
  readonly kind: Kind;
  readonly busy: boolean;
  readonly onFiles: (files: File[]) => void;
  readonly quiet?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const singular = DESCRIPTIONS[kind].singular;

  return (
    <>
      <input
        id={inputId}
        ref={input}
        className="visually-hidden"
        type="file"
        accept=".json,application/json"
        multiple
        aria-label={`Choose ${singular} documents`}
        tabIndex={-1}
        onChange={(event) => {
          const files = filesOf(event.target.files);
          event.target.value = "";

          if (files.length > 0) {
            onFiles(files);
          }
        }}
      />
      <button
        type="button"
        className={quiet ? styles.quietButton : styles.button}
        disabled={busy}
        onClick={() => {
          input.current?.click();
        }}
      >
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />
        </svg>
        {busy ? "Importing…" : `Import ${singular}`}
      </button>
    </>
  );
}

/** A page that takes documents of one kind dropped anywhere on it. */
export function DropZone({
  kind,
  onFiles,
  children,
}: {
  readonly kind: Kind;
  readonly onFiles: (files: File[]) => void;
  readonly children: ReactNode;
}) {
  const [depth, setDepth] = useState(0);
  const singular = DESCRIPTIONS[kind].singular;

  return (
    <div
      className={styles.zone}
      data-dragging={depth > 0 ? "true" : undefined}
      onDragEnter={(event) => {
        if (carriesFiles(event)) {
          event.preventDefault();
          setDepth((current) => current + 1);
        }
      }}
      onDragOver={(event) => {
        if (carriesFiles(event)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(event) => {
        if (carriesFiles(event)) {
          setDepth((current) => Math.max(0, current - 1));
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDepth(0);
        const files = filesOf(event.dataTransfer.files);

        if (files.length > 0) {
          onFiles(files);
        }
      }}
    >
      {children}
      {depth > 0 && (
        <div className={styles.overlay} aria-hidden="true">
          <p className={styles.overlayText}>
            Drop to import {singular} documents into your local instance
          </p>
        </div>
      )}
    </div>
  );
}

function outcomeText(outcome: Outcome, singular: string): ReactNode {
  switch (outcome.state) {
    case "importing":
      return `Importing ${outcome.fileName}…`;
    case "failed":
      return outcome.message;
    case "imported": {
      const { created, detail } = outcome;
      const revision = detail.revision;
      const named = `${detail.name} ${detail.version}`;

      if (!created) {
        return `${named} is unchanged at revision ${String(revision.number)}: it is the latest ${singular}'s document.`;
      }

      return revision.identical_to === null
        ? `Imported ${named} as revision ${String(revision.number)}.`
        : `Imported ${named} as revision ${String(revision.number)}, ` +
            `a return to revision ${String(revision.identical_to)}.`;
    }
  }
}

/** What became of each document imported, newest first, each to dismiss. */
export function ImportOutcomes({
  kind,
  outcomes,
  onDismiss,
}: {
  readonly kind: Kind;
  readonly outcomes: readonly Outcome[];
  readonly onDismiss: (id: number) => void;
}) {
  if (outcomes.length === 0) {
    return null;
  }

  const singular = DESCRIPTIONS[kind].singular;

  return (
    <ul className={styles.outcomes} aria-label="Imports" aria-live="polite">
      {outcomes.map((outcome) => (
        <li key={outcome.id} className={styles.outcome} data-state={outcome.state}>
          <span className={styles.mark} aria-hidden="true" />
          <div className={styles.outcomeText}>
            {outcome.state === "failed" && (
              <p className={styles.outcomeTitle}>Couldn&apos;t import {outcome.fileName}</p>
            )}
            <p>{outcomeText(outcome, singular)}</p>
          </div>
          {outcome.state === "imported" && (
            <Link className={styles.open} to={detailPath(kind, outcome.detail)}>
              Open it
            </Link>
          )}
          {outcome.state !== "importing" && (
            <button
              type="button"
              className={styles.dismiss}
              aria-label={`Dismiss ${outcome.fileName}`}
              onClick={() => {
                onDismiss(outcome.id);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M7 7l10 10M17 7 7 17"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
