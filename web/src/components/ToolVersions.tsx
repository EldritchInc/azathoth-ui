import { detailPath } from "../kinds";
import { useToolVersions } from "../queries";
import { InstanceNavLink } from "./InstanceLink";
import styles from "./WorkflowTabs.module.css";

/**
 * Every version of a tool, each opening its own page at its latest
 * revision, the one the page shows marked current (ADR 0015). While the
 * versions are being read, or if they cannot be, nothing is shown: the page
 * still shows its own version.
 */
export function ToolVersions({ toolId }: { readonly toolId: string }) {
  const versions = useToolVersions(toolId);

  if (!versions.isSuccess) {
    return null;
  }

  return (
    <nav className={styles.tabs} aria-label="Versions">
      {versions.data.map((each) => (
        <InstanceNavLink
          key={each.version}
          className={styles.tab}
          to={detailPath("tools", each)}
          end
        >
          {each.version}
        </InstanceNavLink>
      ))}
    </nav>
  );
}
