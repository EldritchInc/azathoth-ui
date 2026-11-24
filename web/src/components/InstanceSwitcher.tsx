import { Link } from "react-router";

import { instanceStyle } from "../instanceColour";
import { useRemotes } from "../queries";
import { LOCAL_SCOPE, isLocal, pageOf, remoteScope, useScope, type InstanceScope } from "../scope";
import styles from "./InstanceSwitcher.module.css";

/** Returns how the switcher names an instance: `Local` for the editor's own, a remote by its name. */
function shownName(scope: InstanceScope): string {
  return isLocal(scope) ? "Local" : scope.name;
}

/**
 * Which instance the page acts on, and every other the editor works on
 * (ADR 0009): the local instance, then each remote it names, each in its
 * own colour. Each opens on its overview, a remote's at `/remotes/{name}`,
 * whose pages are then that remote's (ADR 0016).
 */
export function InstanceSwitcher() {
  const scope = useScope();
  const remotes = useRemotes();
  const scopes = [LOCAL_SCOPE, ...(remotes.data ?? []).map((remote) => remoteScope(remote.name))];

  return (
    <details
      className={styles.switcher}
      data-testid="instance-switcher"
      data-instance={scope.name}
      style={instanceStyle(scope.name)}
    >
      <summary className={styles.current}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.name}>{shownName(scope)}</span>
        <span className={styles.hint}>instance</span>
      </summary>
      <nav aria-label="Instances">
        <ul className={styles.list}>
          {scopes.map((each) => (
            <li key={each.api}>
              <Link
                className={styles.choice}
                to={pageOf(each, "/")}
                aria-current={each.api === scope.api ? "true" : undefined}
                style={instanceStyle(each.name)}
              >
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.name}>{shownName(each)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
