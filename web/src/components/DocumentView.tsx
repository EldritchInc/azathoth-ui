import { useMemo } from "react";

import { layOut, tokenize } from "../json";
import { CopyButton } from "./CopyButton";
import styles from "./DocumentView.module.css";

/** Saves one text as a file the browser downloads. */
function download(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** A component's document as Azathoth keeps it, highlighted, to copy or download. */
export function DocumentView({
  document: value,
  fileName,
}: {
  readonly document: unknown;
  readonly fileName: string;
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
          <button
            type="button"
            className={styles.download}
            onClick={() => {
              download(`${json}\n`, fileName);
            }}
          >
            Download
          </button>
        </div>
      </header>
      <pre className={styles.code} tabIndex={0} aria-label={`${fileName}, as JSON`}>
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
