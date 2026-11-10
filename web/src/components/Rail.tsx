import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";

import { DESCRIPTIONS, KINDS, type Kind } from "../kinds";
import { useList, usePortfolio } from "../queries";
import type { ThemeChoice } from "../theme";
import type { Connection } from "../useInstance";
import { ConnectionStatus } from "./ConnectionStatus";
import { Mark } from "./Mark";
import styles from "./Rail.module.css";
import { ThemeSwitch } from "./ThemeSwitch";

type IconName = Kind | "overview" | "models";

const ICONS: Record<IconName, ReactNode> = {
  overview: (
    <>
      <circle cx="12" cy="12" r="2.5" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-28 12 12)" />
    </>
  ),
  workflows: (
    <>
      <circle cx="6" cy="6" r="2.25" />
      <circle cx="18" cy="12" r="2.25" />
      <circle cx="6" cy="18" r="2.25" />
      <path d="M8.2 6.8l7.6 4.2M8.2 17.2l7.6-4.2" />
    </>
  ),
  tools: (
    <path d="M14.5 6.5a4 4 0 0 0-5.4 5.1L4 16.7 7.3 20l5.1-5.1a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4Z" />
  ),
  benchmarks: (
    <>
      <path d="M4 19h16" />
      <path d="M7 19v-5M12 19V8M17 19v-9" />
    </>
  ),
  models: (
    <>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <path d="M10 3v3.5M14 3v3.5M10 17.5V21M14 17.5V21M3 10h3.5M3 14h3.5M17.5 10H21M17.5 14H21" />
    </>
  ),
};

function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}

function KindLink({ kind }: { readonly kind: Kind }) {
  const list = useList(kind);
  const description = DESCRIPTIONS[kind];

  return (
    <NavLink className={styles.item} to={description.path}>
      <Icon name={kind} />
      <span className={styles.label}>{description.title}</span>
      {list.data !== undefined && (
        <span className={styles.count} aria-hidden="true">
          {list.data.length}
        </span>
      )}
    </NavLink>
  );
}

/** The models link, counting the models the local portfolio holds. */
function ModelsLink() {
  const portfolio = usePortfolio();

  return (
    <NavLink className={styles.item} to="/models">
      <Icon name="models" />
      <span className={styles.label}>Models</span>
      {portfolio.data !== undefined && (
        <span className={styles.count} aria-hidden="true">
          {portfolio.data.length}
        </span>
      )}
    </NavLink>
  );
}

/** The editor's rail: its mark, its pages, the connection and the theme. */
export function Rail({
  connection,
  theme,
  onChooseTheme,
}: {
  readonly connection: Connection;
  readonly theme: ThemeChoice;
  readonly onChooseTheme: (choice: ThemeChoice) => void;
}) {
  return (
    <header className={styles.rail}>
      <Link className={styles.brand} to="/">
        <Mark className={styles.mark} />
        <span>Azathoth</span>
      </Link>
      <nav className={styles.nav} aria-label="Editor">
        <NavLink className={styles.item} to="/" end>
          <Icon name="overview" />
          <span className={styles.label}>Overview</span>
        </NavLink>
        <p className={styles.section}>Local instance</p>
        {KINDS.map((kind) => (
          <KindLink key={kind} kind={kind} />
        ))}
        <ModelsLink />
      </nav>
      <div className={styles.footer}>
        <ConnectionStatus connection={connection} />
        <ThemeSwitch choice={theme} onChoose={onChooseTheme} />
      </div>
    </header>
  );
}
