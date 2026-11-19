import { useId } from "react";

import { CASE_COMPARISONS, type CaseComparison, type Sensitivity } from "../api/types";
import { COMPARISON_MEANINGS, raisableLabels } from "../benchmarking";
import { classNames } from "../classNames";
import { SENSITIVITY_NAMES } from "../invocations";
import styles from "./Benchmarks.module.css";
import input from "./RunInput.module.css";
import picker from "./SensitivityPicker.module.css";

/** How a case is compared, and what that asks of its run. */
export function ComparisonField({
  value,
  onChange,
}: {
  readonly value: CaseComparison;
  readonly onChange: (value: CaseComparison) => void;
}) {
  const ids = { select: useId(), hint: useId() };

  return (
    <div className={styles.field}>
      <label htmlFor={ids.select}>Comparison</label>
      <select
        id={ids.select}
        className={styles.select}
        value={value}
        aria-describedby={ids.hint}
        onChange={(event) => {
          const chosen = CASE_COMPARISONS.find((each) => each === event.target.value);

          if (chosen !== undefined) {
            onChange(chosen);
          }
        }}
      >
        {CASE_COMPARISONS.map((each) => (
          <option key={each} value={each}>
            {each}
          </option>
        ))}
      </select>
      <span id={ids.hint} className={styles.hint}>
        {COMPARISON_MEANINGS[value]}
      </span>
    </div>
  );
}

/** A JSON value a person writes, and whether it reads as one yet. */
export function JsonField({
  label,
  value,
  onChange,
  problem,
  hint,
  rows = 4,
  placeholder,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Why it can't be sent yet, or `null` when it can. */
  readonly problem: string | null;
  /** What is said while it can be sent. */
  readonly hint: string;
  readonly rows?: number;
  readonly placeholder?: string;
}) {
  const ids = { text: useId(), state: useId() };

  return (
    <div className={styles.field}>
      <label htmlFor={ids.text}>{label}</label>
      <textarea
        id={ids.text}
        className={styles.code}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        aria-invalid={problem !== null && value.trim() !== ""}
        aria-describedby={ids.state}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <span id={ids.state} className={styles.hint} data-invalid={problem !== null}>
        {problem ?? hint}
      </span>
    </div>
  );
}

/** What a case says it expects, in words. */
export function DescriptionField({
  value,
  onChange,
  hint,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint: string;
}) {
  const ids = { text: useId(), hint: useId() };

  return (
    <div className={styles.field}>
      <label htmlFor={ids.text}>Description</label>
      <input
        id={ids.text}
        className={styles.input}
        value={value}
        autoComplete="off"
        aria-describedby={ids.hint}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <span id={ids.hint} className={styles.hint}>
        {hint}
      </span>
    </div>
  );
}

/** A case's label, which an edit may only raise (Azathoth's ADR 0130). */
export function LabelRaise({
  current,
  value,
  onChange,
}: {
  /** The label the case has now. */
  readonly current: Sensitivity;
  readonly value: Sensitivity;
  readonly onChange: (value: Sensitivity) => void;
}) {
  return (
    <fieldset className={input.panel}>
      <legend className={input.legend}>Label</legend>
      <div className={input.modes} role="radiogroup" aria-label="The case's label">
        {raisableLabels(current).map((each) => (
          <button
            key={each}
            type="button"
            role="radio"
            className={classNames(input.mode, picker.mode)}
            data-label={each}
            aria-checked={value === each}
            onClick={() => {
              onChange(each);
            }}
          >
            {SENSITIVITY_NAMES[each]}
          </button>
        ))}
      </div>
      <p className={picker.hint}>A label can only be raised, never lowered.</p>
    </fieldset>
  );
}
