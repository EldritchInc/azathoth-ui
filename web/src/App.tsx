import { useCallback, useLayoutEffect, useState } from "react";
import { Route, Routes } from "react-router";

import styles from "./App.module.css";
import { ComponentList } from "./components/ComponentList";
import { NotFound } from "./components/NotFound";
import { Overview } from "./components/Overview";
import { Rail } from "./components/Rail";
import { applyTheme, browserStorage, readTheme, saveTheme, type ThemeChoice } from "./theme";
import { useInstance } from "./useInstance";

/** The editor: its rail, and the page the address names. */
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
      <Rail connection={connection} theme={theme} onChooseTheme={choose} />
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<Overview connection={connection} />} />
          <Route path="/workflows" element={<ComponentList kind="workflows" />} />
          <Route path="/tools" element={<ComponentList kind="tools" />} />
          <Route path="/benchmarks" element={<ComponentList kind="benchmarks" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
