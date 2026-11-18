import type { Sensitivity } from "../api/types";
import { classNames } from "../classNames";
import input from "./RunInput.module.css";
import styles from "./SensitivityPicker.module.css";

/** Each choice, in order: unlabelled first, then Azathoth's labels from least to most sensitive. */
const CHOICES: readonly { readonly value: Sensitivity | null; readonly name: string }[] = [
  { value: null, name: "Unlabelled" },
  { value: "public", name: "Public" },
  { value: "internal", name: "Internal" },
  { value: "restricted", name: "Restricted" },
];

/** What each choice means for where the input may go (Azathoth's ADR 0123). */
function meaning(value: Sensitivity | null): string {
  switch (value) {
    case null:
      return "Unlabelled, it counts as internal.";
    case "restricted":
      return "Only models declared to neither retain nor train on data may receive it.";
    case "public":
    case "internal":
      return "Any model the portfolio authorizes may receive it.";
  }
}

/**
 * How a person labels what they give a run, an invocation or a tried step
 * (ADR 0011): unlabelled until a label is chosen, which Azathoth counts as
 * internal. It can't be chosen while there is nothing to label.
 */
export function SensitivityPicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  readonly value: Sensitivity | null;
  readonly onChange: (value: Sensitivity | null) => void;
  /** Whether there is nothing to label, since nothing is given. */
  readonly disabled?: boolean;
  /** Whether it sits in a step's details, where room is short. */
  readonly compact?: boolean;
}) {
  return (
    <fieldset className={input.panel} data-compact={compact ? "true" : undefined}>
      <legend className={input.legend}>Label</legend>
      <div className={input.modes} role="radiogroup" aria-label="The input's label">
        {CHOICES.map((choice) => (
          <button
            key={choice.name}
            type="button"
            role="radio"
            className={classNames(input.mode, styles.mode)}
            data-label={choice.value ?? undefined}
            aria-checked={value === choice.value}
            disabled={disabled}
            onClick={() => {
              onChange(choice.value);
            }}
          >
            {choice.name}
          </button>
        ))}
      </div>
      <p
        className={styles.hint}
        data-label={disabled ? undefined : (value ?? undefined)}
        aria-live="polite"
      >
        {disabled ? "Give it input to label." : meaning(value)}
      </p>
    </fieldset>
  );
}
