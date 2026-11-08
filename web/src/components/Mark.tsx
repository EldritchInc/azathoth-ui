import styles from "./Mark.module.css";

/** The editor's mark: a still centre, with its pipers circling it. */
export function Mark({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
        <ellipse rx="44" ry="17" transform="rotate(-28)" />
        <ellipse rx="44" ry="17" transform="rotate(32)" />
      </g>
      <circle r="10" fill="currentColor" />
      <circle className={styles.piper} cx="38" cy="-9" r="6" transform="rotate(-28)" />
    </svg>
  );
}
