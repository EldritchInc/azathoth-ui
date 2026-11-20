import { useAllowed } from "../permissions";
import { InstanceNavLink } from "./InstanceLink";
import styles from "./WorkflowTabs.module.css";

/** A workflow page's tabs (ADR 0010). */
export type WorkflowTab = "revisions" | "runs" | "production" | "experiments" | "spend";

/**
 * A workflow's tabs, each its own address: its revisions at its own, its
 * runs, its production, its experiments (ADR 0013), and, where spend may
 * be read, its spend (ADR 0014). The one the page shows is marked current.
 */
export function WorkflowTabs({ workflowId }: { readonly workflowId: string }) {
  const base = `/workflows/${encodeURIComponent(workflowId)}`;
  const spend = useAllowed("read_spend");

  return (
    <nav className={styles.tabs} aria-label="Workflow">
      <InstanceNavLink className={styles.tab} to={base} end>
        Revisions
      </InstanceNavLink>
      <InstanceNavLink className={styles.tab} to={`${base}/runs`}>
        Runs
      </InstanceNavLink>
      <InstanceNavLink className={styles.tab} to={`${base}/production`}>
        Production
      </InstanceNavLink>
      <InstanceNavLink className={styles.tab} to={`${base}/experiments`}>
        Experiments
      </InstanceNavLink>
      {spend.allowed && (
        <InstanceNavLink className={styles.tab} to={`${base}/spend`}>
          Spend
        </InstanceNavLink>
      )}
    </nav>
  );
}
