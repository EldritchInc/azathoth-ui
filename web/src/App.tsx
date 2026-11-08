import { useCallback, useLayoutEffect, useState } from "react";

import styles from "./App.module.css";
import { Mark } from "./components/Mark";
import { Overview } from "./components/Overview";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { applyTheme, browserStorage, readTheme, saveTheme, type ThemeChoice } from "./theme";
import { useInstance } from "./useInstance";

/** The editor: its rail, and the page the rail has open. */
export function App() {
  const connection = useInstance();
  const [theme, setTheme] = useState<ThemeChoice>(() => readTheme(browserStorage()));

  useLayoutEffect(() => {
    applyTheme(document.documentElement, theme);
  }, [theme]);

  const choose = useCallback((choice: ThemeChoice) => {
    saveTheme(browserStorage(), choice);
    setTheme(choice);
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.rail}>
        <a className={styles.brand} href="/">
          <Mark className={styles.mark} />
          <span>Azathoth</span>
        </a>
        <nav className={styles.nav} aria-label="Editor">
          <a className={styles.navItem} href="/" aria-current="page">
            Overview
          </a>
        </nav>
        <div className={styles.footer}>
          <ConnectionStatus connection={connection} />
          <ThemeSwitch choice={theme} onChoose={choose} />
        </div>
      </header>
      <main className={styles.main}>
        <Overview connection={connection} />
      </main>
    </div>
  );
}
