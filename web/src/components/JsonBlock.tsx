import { useMemo } from "react";

import { layOut, tokenize } from "../json";
import styles from "./JsonBlock.module.css";

/** A JSON value laid out and highlighted, to read and scroll through. */
export function JsonBlock({ value, label }: { readonly value: unknown; readonly label: string }) {
  const tokens = useMemo(() => tokenize(value === undefined ? "null" : layOut(value)), [value]);

  return (
    <pre className={styles.code} tabIndex={0} aria-label={label}>
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
  );
}
