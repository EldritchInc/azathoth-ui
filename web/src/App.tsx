import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router";

import styles from "./App.module.css";
import { ComponentList } from "./components/ComponentList";
import { GoalList, GoalPage } from "./components/Goals";
import { JudgeList } from "./components/JudgeList";
import { McpTool } from "./components/McpTool";
import { LiveRunPage } from "./components/LiveRun";
import { AddCase } from "./components/AddCase";
import { CasePage } from "./components/CasePage";
import { ExecutionPage } from "./components/ExecutionPage";
import { ExperimentPage } from "./components/ExperimentPage";
import { BenchmarkPage, ToolPage, WorkflowPage } from "./components/ComponentPages";
import { ModelList } from "./components/ModelList";
import { RunBenchmark } from "./components/RunBenchmark";
import { NewBenchmark } from "./components/NewBenchmark";
import { ModelPage } from "./components/ModelPage";
import { NotFound } from "./components/NotFound";
import { Overview } from "./components/Overview";
import { Rail } from "./components/Rail";
import { RemoteList } from "./components/RemoteList";
import { RemotePage } from "./components/RemotePage";
import { RevisionDiffPage } from "./components/RevisionDiff";
import { RunPage } from "./components/RunPage";
import { SpendPage } from "./components/SpendPage";
import { InvocationPage } from "./components/InvocationPage";
import { InvokeWorkflow } from "./components/InvokeWorkflow";
import { OptimizeWorkflow } from "./components/OptimizeWorkflow";
import { RunWorkflow } from "./components/RunWorkflow";
import { NewWorkflow, WorkflowEditor } from "./components/WorkflowEditor";
import { ScopeContext, scopeAt } from "./scope";
import { applyTheme, browserStorage, readTheme, saveTheme, type ThemeChoice } from "./theme";
import { useInstance } from "./useInstance";

/**
 * The pages of one instance, below where its pages are: the local
 * instance's at the top, a remote's under `/remotes/{name}` (ADR 0016).
 * `overview` is its first page.
 */
function InstancePages({ overview }: { readonly overview: ReactNode }) {
  return (
    <Routes>
      <Route index element={overview} />
      <Route path="workflows" element={<ComponentList kind="workflows" />} />
      <Route path="workflows/new" element={<NewWorkflow />} />
      <Route path="workflows/:id" element={<WorkflowPage />} />
      <Route path="workflows/:id/runs" element={<WorkflowPage tab="runs" />} />
      <Route path="workflows/:id/production" element={<WorkflowPage tab="production" />} />
      <Route path="workflows/:id/experiments" element={<WorkflowPage tab="experiments" />} />
      <Route path="workflows/:id/spend" element={<WorkflowPage tab="spend" />} />
      <Route path="workflows/:id/diff" element={<RevisionDiffPage kind="workflows" />} />
      <Route path="experiments/:id" element={<ExperimentPage />} />
      <Route path="workflows/:id/edit" element={<WorkflowEditor />} />
      <Route path="workflows/:id/run" element={<RunWorkflow />} />
      <Route path="workflows/:id/invoke" element={<InvokeWorkflow />} />
      <Route path="workflows/:id/optimize" element={<OptimizeWorkflow />} />
      <Route path="live/:handle" element={<LiveRunPage />} />
      <Route path="runs/:runId" element={<RunPage />} />
      <Route path="invocations/:invocationId" element={<InvocationPage />} />
      <Route path="tools" element={<ComponentList kind="tools" />} />
      <Route path="tools/from-mcp" element={<McpTool />} />
      <Route path="tools/:id/versions/:version" element={<ToolPage />} />
      <Route path="tools/:id/versions/:version/diff" element={<RevisionDiffPage kind="tools" />} />
      <Route path="benchmarks" element={<ComponentList kind="benchmarks" />} />
      <Route path="benchmarks/new" element={<NewBenchmark />} />
      <Route path="benchmarks/:id" element={<BenchmarkPage />} />
      <Route path="benchmarks/:id/document" element={<BenchmarkPage tab="document" />} />
      <Route path="benchmarks/:id/diff" element={<RevisionDiffPage kind="benchmarks" />} />
      <Route path="benchmarks/:id/executions" element={<BenchmarkPage tab="executions" />} />
      <Route path="benchmark-executions/:id" element={<ExecutionPage />} />
      <Route path="benchmarks/:id/run" element={<RunBenchmark />} />
      <Route path="benchmarks/:id/compare" element={<RunBenchmark comparing />} />
      <Route path="benchmarks/:id/cases/new" element={<AddCase />} />
      <Route path="benchmarks/:id/cases/:caseId" element={<CasePage />} />
      <Route path="goals" element={<GoalList />} />
      <Route path="goals/:id" element={<GoalPage />} />
      <Route path="models" element={<ModelList />} />
      <Route path="models/*" element={<ModelPage />} />
      <Route path="judges" element={<JudgeList />} />
      <Route path="spend" element={<SpendPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

/** The editor at one address: its rail, and the page the address names, on its instance. */
function Editor() {
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
          <Route path="/remotes" element={<RemoteList />} />
          <Route
            path="/remotes/:name/*"
            element={<InstancePages overview={<RemotePage connection={connection} />} />}
          />
          <Route
            path="/*"
            element={<InstancePages overview={<Overview connection={connection} />} />}
          />
        </Routes>
      </main>
    </div>
  );
}

/**
 * The editor: every page acts on the instance its address is on (ADR 0009),
 * the local instance's at the top and a remote's under `/remotes/{name}`,
 * so a link or a reload keeps the instance it was made on.
 */
export function App() {
  const { pathname } = useLocation();
  const scope = useMemo(() => scopeAt(pathname), [pathname]);

  return (
    <ScopeContext.Provider value={scope}>
      <Editor />
    </ScopeContext.Provider>
  );
}
