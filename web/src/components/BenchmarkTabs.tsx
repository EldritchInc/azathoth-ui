import { InstanceNavLink } from "./InstanceLink";
import styles from "./WorkflowTabs.module.css";

/** A benchmark page's tabs (ADR 0012). */
export type BenchmarkTab = "cases" | "document";

/**
 * A benchmark's tabs, each its own address: its cases at its own, and its
 * document, with its revisions. The one the page shows is marked current.
 */
export function BenchmarkTabs({ benchmarkId }: { readonly benchmarkId: string }) {
  const base = `/benchmarks/${encodeURIComponent(benchmarkId)}`;

  return (
    <nav className={styles.tabs} aria-label="Benchmark">
      <InstanceNavLink className={styles.tab} to={base} end>
        Cases
      </InstanceNavLink>
      <InstanceNavLink className={styles.tab} to={`${base}/document`}>
        Document
      </InstanceNavLink>
    </nav>
  );
}
