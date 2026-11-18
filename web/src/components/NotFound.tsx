import { useLocation } from "react-router";

import { InstanceLink } from "./InstanceLink";
import styles from "./NotFound.module.css";

/** Any address the editor has no page for. */
export function NotFound() {
  const location = useLocation();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Nothing at this address</h1>
      <p className={styles.lead}>
        The editor has no page at <code>{location.pathname}</code>.
      </p>
      <p>
        <InstanceLink className={styles.link} to="/">
          Go to the overview
        </InstanceLink>
      </p>
    </div>
  );
}
