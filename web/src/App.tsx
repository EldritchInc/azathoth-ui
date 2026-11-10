import { useCallback, useLayoutEffect, useState } from "react";
import { Route, Routes } from "react-router";

import styles from "./App.module.css";
import { ComponentList } from "./components/ComponentList";
import { LiveRunPage } from "./components/LiveRun";
import { BenchmarkPage, ToolPage, WorkflowPage } from "./components/ComponentPages";
import { ModelList } from "./components/ModelList";
import { ModelPage } from "./components/ModelPage";
import { NotFound } from "./components/NotFound";
import { Overview } from "./components/Overview";
import { Rail } from "./components/Rail";
import { RunWorkflow } from "./components/RunWorkflow";
import { NewWorkflow, WorkflowEditor } from "./components/WorkflowEditor";
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
          <Route path="/workflows/new" element={<NewWorkflow />} />
          <Route path="/workflows/:id" element={<WorkflowPage />} />
          <Route path="/workflows/:id/edit" element={<WorkflowEditor />} />
          <Route path="/workflows/:id/run" element={<RunWorkflow />} />
          <Route path="/live/:handle" element={<LiveRunPage />} />
          <Route path="/tools" element={<ComponentList kind="tools" />} />
          <Route path="/tools/:id/versions/:version" element={<ToolPage />} />
          <Route path="/benchmarks" element={<ComponentList kind="benchmarks" />} />
          <Route path="/benchmarks/:id" element={<BenchmarkPage />} />
          <Route path="/models" element={<ModelList />} />
          <Route path="/models/*" element={<ModelPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
