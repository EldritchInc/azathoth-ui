import { useId, useState } from "react";

import type { JsonObject } from "../editing";
import { parseObject } from "../forms";
import styles from "./JsonEditor.module.css";

function written(value: JsonObject): string {
  return JSON.stringify(value, null, 2);
}

/**
 * A JSON object as text to edit. Each change that reads as an object is
 * made as it is typed; while the text does not, it is kept as typed and
 * says where and why. Once the object changes some other way, such as by
 * undoing or in a form, the text shows it again.
 */
export function JsonEditor({
  label,
  value,
  rows = 12,
  onChange,
}: {
  readonly label: string;
  readonly value: JsonObject;
  readonly rows?: number;
  readonly onChange: (value: JsonObject) => void;
}) {
  const id = useId();
  const shown = written(value);
  const [draft, setDraft] = useState<{ readonly text: string; readonly shows: string } | null>(
    null,
  );
  const current = draft !== null && draft.shows === shown ? draft : null;
  const error = current === null ? null : parseObject(current.text).error;

  return (
    <div className={styles.editor}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className={styles.text}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        aria-invalid={error !== null}
        aria-describedby={`${id}-state`}
        value={current?.text ?? shown}
        onChange={(event) => {
          const text = event.target.value;
          const parsed = parseObject(text);

          if (parsed.value === null) {
            setDraft({ text, shows: shown });
          } else {
            const next = written(parsed.value);

            setDraft({ text, shows: next });
            if (next !== shown) {
              onChange(parsed.value);
            }
          }
        }}
      />
      <p id={`${id}-state`} className={styles.state} data-error={error !== null} aria-live="polite">
        {error ?? "Changes as you type, while it reads as JSON."}
      </p>
    </div>
  );
}
