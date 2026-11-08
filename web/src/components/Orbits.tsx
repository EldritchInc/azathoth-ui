import { classNames } from "../classNames";
import styles from "./Orbits.module.css";

/** The orbits each piper keeps, as an ellipse's radii and tilt, and where its piper is. */
const ORBITS = [
  { rx: 96, ry: 34, tilt: -24, piper: [-83, -17], size: 2.6 },
  { rx: 74, ry: 27, tilt: 36, piper: [52, 19], size: 2.2 },
  { rx: 52, ry: 19, tilt: -64, piper: [26, -16.5], size: 1.9 },
  { rx: 30, ry: 11, tilt: 12, piper: [-21, 7.8], size: 1.6 },
] as const;

/**
 * The editor's one large drawing: the still centre, and its pipers.
 *
 * The orbits draw themselves in once when the page opens, and the pipers
 * arrive; after that, it turns too slowly to notice. `quiet` dims it while
 * the editor has nothing to show.
 */
export function Orbits({ quiet = false }: { readonly quiet?: boolean }) {
  return (
    <svg
      className={classNames(styles.orbits, quiet && styles.quiet)}
      viewBox="-100 -100 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <g className={styles.turning}>
        {ORBITS.map(({ rx, ry, tilt, piper, size }) => (
          <g key={rx} className={styles.ring} transform={`rotate(${String(tilt)})`}>
            <ellipse className={styles.orbit} rx={rx} ry={ry} pathLength={1} />
            <circle className={styles.piper} cx={piper[0]} cy={piper[1]} r={size} />
          </g>
        ))}
      </g>
      <circle className={styles.centre} r={7} />
    </svg>
  );
}
