import { Link } from "react-router";

import { instanceStyle } from "../instanceColour";
import { useRemotes } from "../queries";
import { LOCAL_SCOPE, pageOf, useScope } from "../scope";
import styles from "./InstanceSwitcher.module.css";

/** Returns how the switcher names an instance: `Local` for the editor's own, a remote by its name. */
function shownName(name: string): string {
  return name === LOCAL_SCOPE.name ? "Local" : name;
}

/**
 * Which instance the page acts on, and every other the editor works on
 * (ADR 0009): the local instance, then each remote it names, each in its
 * own colour. In Azathoth 1.5 a remote opens on its page; from 1.6, on its
 * own instance's pages.
 */
export function InstanceSwitcher() {
  const scope = useScope();
  const remotes = useRemotes();
  const names = [LOCAL_SCOPE.name, ...(remotes.data ?? []).map((remote) => remote.name)];

  return (
    <details
      className={styles.switcher}
      data-testid="instance-switcher"
      data-instance={scope.name}
      style={instanceStyle(scope.name)}
    >
      <summary className={styles.current}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.name}>{shownName(scope.name)}</span>
        <span className={styles.hint}>instance</span>
      </summary>
      <nav aria-label="Instances">
        <ul className={styles.list}>
          {names.map((name) => (
            <li key={name}>
              <Link
                className={styles.choice}
                to={
                  name === LOCAL_SCOPE.name
                    ? pageOf(LOCAL_SCOPE, "/")
                    : `/remotes/${encodeURIComponent(name)}`
                }
                aria-current={name === scope.name ? "true" : undefined}
                style={instanceStyle(name)}
              >
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.name}>{shownName(name)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
