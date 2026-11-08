import { useId, type ReactNode } from "react";

import { THEME_CHOICES, type ThemeChoice } from "../theme";
import styles from "./ThemeSwitch.module.css";

const NAMES: Record<ThemeChoice, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

const ICONS: Record<ThemeChoice, ReactNode> = {
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
};

/** Chooses between the system's theme, light and dark. */
export function ThemeSwitch({
  choice,
  onChoose,
}: {
  readonly choice: ThemeChoice;
  readonly onChoose: (choice: ThemeChoice) => void;
}) {
  const name = useId();

  return (
    <div className={styles.switch} role="radiogroup" aria-label="Theme">
      {THEME_CHOICES.map((option) => (
        <label key={option} className={styles.option} title={NAMES[option]}>
          <input
            className={styles.input}
            type="radio"
            name={name}
            value={option}
            checked={choice === option}
            aria-label={NAMES[option]}
            onChange={() => {
              onChoose(option);
            }}
          />
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICONS[option]}
          </svg>
        </label>
      ))}
    </div>
  );
}
