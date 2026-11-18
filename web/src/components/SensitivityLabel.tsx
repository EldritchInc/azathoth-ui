import type { Sensitivity } from "../api/types";
import { SENSITIVITY_NAMES } from "../invocations";
import styles from "./SensitivityLabel.module.css";

/**
 * The label of some data, the same wherever data is shown (ADR 0011):
 * public, internal or restricted, restricted standing out.
 */
export function SensitivityLabel({ sensitivity }: { readonly sensitivity: Sensitivity }) {
  return (
    <span className={styles.label} data-sensitivity={sensitivity} title={`Labelled ${sensitivity}`}>
      {SENSITIVITY_NAMES[sensitivity]}
    </span>
  );
}
