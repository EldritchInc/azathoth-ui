import { useMemo } from "react";

import { layOut, tokenize } from "../json";
import { CopyButton } from "./CopyButton";
import styles from "./DocumentView.module.css";

/**
 * A component's document as Azathoth keeps it, highlighted, to copy or
 * download. Download takes the revision from the instance exactly as
 * `azathoth … export` prints it, under the file name Azathoth suggests, so
 * importing it again makes no revision (ADR 0015); a document holding
 * restricted data says so beside it.
 */
export function DocumentView({
  document: value,
  label,
  exportPath,
  restricted = false,
}: {
  readonly document: unknown;
  readonly label: string;
  readonly exportPath: string;
  readonly restricted?: boolean;
}) {
  const json = useMemo(() => layOut(value), [value]);
  const tokens = useMemo(() => tokenize(json), [json]);

  return (
    <section className={styles.section} aria-labelledby="document-heading">
      <header className={styles.header}>
        <h2 id="document-heading" className={styles.title}>
          Document
        </h2>
        <div className={styles.actions}>
          <CopyButton text={json} label="Copy document" />
          <a className={styles.download} href={exportPath} download>
            Download
          </a>
        </div>
      </header>
      {restricted && (
        <p className={styles.restricted}>
          This document holds restricted data, and so does the file Download saves. Keep it where
          restricted data may be kept.
        </p>
      )}
      <pre className={styles.code} tabIndex={0} aria-label={`${label}, as JSON`}>
        <code>
          {tokens.map((token, index) =>
            token.kind === "space" || token.kind === "punctuation" ? (
              token.text
            ) : (
              <span key={index} className={styles[token.kind]}>
                {token.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </section>
  );
}
