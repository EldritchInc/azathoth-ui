import type { ReactNode } from "react";

import styles from "./Notice.module.css";

/** Something the person should know: a problem, as an alert, or a quiet note. */
export function Notice({
  title,
  children,
  tone = "problem",
}: {
  readonly title: string;
  readonly children?: ReactNode;
  readonly tone?: "problem" | "note";
}) {
  return (
    <div className={styles.notice} data-tone={tone} role={tone === "problem" ? "alert" : "note"}>
      <p className={styles.title}>{title}</p>
      {children !== undefined && <div className={styles.detail}>{children}</div>}
    </div>
  );
}
