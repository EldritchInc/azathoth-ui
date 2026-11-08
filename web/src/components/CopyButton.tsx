import { useEffect, useState } from "react";

import styles from "./CopyButton.module.css";

type Outcome = "idle" | "copied" | "failed";

const ANNOUNCEMENTS: Record<Outcome, string> = {
  idle: "",
  copied: "Copied",
  failed: "Couldn't copy",
};

export const RESET_AFTER = 2000;

/** Copies one text to the clipboard, and says whether it did. */
export function CopyButton({ text, label }: { readonly text: string; readonly label: string }) {
  const [outcome, setOutcome] = useState<Outcome>("idle");

  useEffect(() => {
    if (outcome === "idle") {
      return;
    }
    const timer = window.setTimeout(() => {
      setOutcome("idle");
    }, RESET_AFTER);

    return () => {
      window.clearTimeout(timer);
    };
  }, [outcome]);

  async function copy(): Promise<void> {
    // The Clipboard API is missing outside a secure context and in older browsers.
    const clipboard = (navigator as Partial<Navigator>).clipboard;

    try {
      if (clipboard === undefined) {
        throw new Error("No clipboard");
      }
      await clipboard.writeText(text);
      setOutcome("copied");
    } catch {
      setOutcome("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.button}
        data-outcome={outcome}
        aria-label={label}
        onClick={() => {
          void copy();
        }}
      >
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {outcome === "copied" ? (
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          ) : (
            <>
              <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
              <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
            </>
          )}
        </svg>
        <span>{outcome === "copied" ? "Copied" : "Copy"}</span>
      </button>
      <span className="visually-hidden" role="status">
        {ANNOUNCEMENTS[outcome]}
      </span>
    </>
  );
}
