import type { ReactNode } from "react";
import { NavLink } from "react-router";

import { instanceStyle } from "../instanceColour";
import { DESCRIPTIONS, KINDS, type Kind } from "../kinds";
import { useAllowed } from "../permissions";
import { useJudges, useList, useLiveRuns, usePortfolio, useRemotes } from "../queries";
import { LOCAL_SCOPE, useScope } from "../scope";
import type { ThemeChoice } from "../theme";
import type { Connection } from "../useInstance";
import { ConnectionStatus } from "./ConnectionStatus";
import { InstanceLink, InstanceNavLink } from "./InstanceLink";
import { InstanceSwitcher } from "./InstanceSwitcher";
import { Mark } from "./Mark";
import styles from "./Rail.module.css";
import { ThemeSwitch } from "./ThemeSwitch";

type IconName = Kind | "overview" | "models" | "judges" | "spend" | "remotes";

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
  judges: (
    <>
      <path d="M12 4v16M8 20h8M5 7h14" />
      <path d="M7 7l-3 6a3 3 0 0 0 6 0Z" />
      <path d="M17 7l-3 6a3 3 0 0 0 6 0Z" />
    </>
  ),
  spend: (
    <>
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </>
  ),
  remotes: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <path d="M8.5 12h7M13 9l2.5 3-2.5 3" />
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
    <InstanceNavLink className={styles.item} to={description.path}>
      <Icon name={kind} />
      <span className={styles.label}>{description.title}</span>
      {list.data !== undefined && (
        <span className={styles.count} aria-hidden="true">
          {list.data.length}
        </span>
      )}
    </InstanceNavLink>
  );
}

/** The models link, counting the models the instance's portfolio holds. */
function ModelsLink() {
  const portfolio = usePortfolio();

  return (
    <InstanceNavLink className={styles.item} to="/models">
      <Icon name="models" />
      <span className={styles.label}>Models</span>
      {portfolio.data !== undefined && (
        <span className={styles.count} aria-hidden="true">
          {portfolio.data.length}
        </span>
      )}
    </InstanceNavLink>
  );
}

/** The judges link, counting the models in the instance's rotation. */
function JudgesLink() {
  const judges = useJudges();

  return (
    <InstanceNavLink className={styles.item} to="/judges">
      <Icon name="judges" />
      <span className={styles.label}>Judges</span>
      {judges.data !== undefined && (
        <span className={styles.count} aria-hidden="true">
          {judges.data.length}
        </span>
      )}
    </InstanceNavLink>
  );
}

/** The spend link, only where spend may be read (ADR 0014). */
function SpendLink() {
  const allowance = useAllowed("read_spend");

  if (!allowance.allowed) {
    return null;
  }

  return (
    <InstanceNavLink className={styles.item} to="/spend">
      <Icon name="spend" />
      <span className={styles.label}>Spend</span>
    </InstanceNavLink>
  );
}

/** The remotes link, counting the remotes the editor's instance names. */
function RemotesLink() {
  const remotes = useRemotes();

  return (
    <NavLink className={styles.item} to="/remotes">
      <Icon name="remotes" />
      <span className={styles.label}>Remotes</span>
      {remotes.data !== undefined && (
        <span className={styles.count} aria-hidden="true">
          {remotes.data.length}
        </span>
      )}
    </NavLink>
  );
}

/**
 * While runs started from the editor are running, how many, linking to the
 * newest of them; nothing while none is.
 */
function RunningLink() {
  const live = useLiveRuns();
  const running = (live.data ?? []).filter((run) => run.state === "running");
  const newest = running[0];

  if (newest === undefined) {
    return null;
  }

  return (
    <InstanceNavLink className={styles.running} to={`/live/${newest.handle}`}>
      <span className={styles.pulse} aria-hidden="true" />
      <span className={styles.label}>
        {running.length === 1 ? "1 run running" : `${String(running.length)} runs running`}
      </span>
    </InstanceNavLink>
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
  const scope = useScope();

  return (
    <header className={styles.rail} style={instanceStyle(scope.name)}>
      <InstanceLink className={styles.brand} to="/">
        <Mark className={styles.mark} />
        <span>Azathoth</span>
      </InstanceLink>
      <InstanceSwitcher />
      <nav className={styles.nav} aria-label="Editor">
        <InstanceNavLink className={styles.item} to="/" end>
          <Icon name="overview" />
          <span className={styles.label}>Overview</span>
        </InstanceNavLink>
        <p className={styles.section}>
          {scope.name === LOCAL_SCOPE.name ? "Local instance" : scope.name}
        </p>
        {KINDS.map((kind) => (
          <KindLink key={kind} kind={kind} />
        ))}
        <ModelsLink />
        <JudgesLink />
        <SpendLink />
        <RunningLink />
        <p className={styles.section}>Sharing</p>
        <RemotesLink />
      </nav>
      <div className={styles.footer}>
        <ConnectionStatus connection={connection} />
        <ThemeSwitch choice={theme} onChoose={onChooseTheme} />
      </div>
    </header>
  );
}
