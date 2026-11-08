import type { Connection } from "../useInstance";
import styles from "./ConnectionStatus.module.css";

type Tone = "waiting" | "live" | "lost";

function describe(connection: Connection): { readonly label: string; readonly tone: Tone } {
  switch (connection.state) {
    case "connecting":
      return { label: "Connecting", tone: "waiting" };
    case "connected":
      return { label: "Connected", tone: "live" };
    case "lost":
      return connection.failure.code === "unauthenticated"
        ? { label: "Signed out", tone: "lost" }
        : { label: "Not answering", tone: "lost" };
  }
}

/** Whether the editor's server is answering, as a dot and a word. */
export function ConnectionStatus({ connection }: { readonly connection: Connection }) {
  const { label, tone } = describe(connection);

  return (
    <div className={styles.status} role="status" aria-label="Connection" data-tone={tone}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
