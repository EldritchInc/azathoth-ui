import { useEffect, useMemo, useState } from "react";

import { isBenchmarkExecutionDetail, type LiveRun } from "../api/types";
import { caseProgressOf, type CaseRun, type WorkflowCases } from "../benchmarking";
import { useBenchmarkCases, useCancelRun, useDetail, useList } from "../queries";
import { duration, LIVE_STATE_NAMES } from "../running";
import { useLiveEvents } from "../useLiveEvents";
import { ActionButton } from "./ActionButton";
import buttons from "./Buttons.module.css";
import { InstanceLink } from "./InstanceLink";
import styles from "./LiveRun.module.css";
import { Notice } from "./Notice";

/** Returns the moment now, again every second while `ticking`. */
function useNow(ticking: boolean): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!ticking) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [ticking]);

  return now;
}

/** Returns what to say of a case so far: running, or passed or failed, with its score. */
function caseState(run: CaseRun, running: boolean): string {
  if (run.finished === null) {
    return running ? "Running…" : "Stopped";
  }
  const score = run.finished.score.toFixed(2);

  return run.finished.passed ? `Passed, scoring ${score}` : `Failed, scoring ${score}`;
}

/** One workflow's cases as they started and finished. */
function WorkflowCaseList({
  workflow,
  name,
  caseName,
  running,
}: {
  readonly workflow: WorkflowCases;
  readonly name: string;
  readonly caseName: (caseId: string) => string;
  readonly running: boolean;
}) {
  return (
    <section className={styles.outcome} aria-label={name}>
      <h3 className={styles.sectionTitle}>
        {name}: {workflow.done} of {workflow.total} done, {workflow.passed} passed
      </h3>
      <ol className={styles.events} aria-live="polite">
        {workflow.cases.map((run) => (
          <li
            key={run.case_id}
            className={styles.event}
            data-type={run.finished === null ? "case_started" : "case_finished"}
          >
            Case {run.index} of {workflow.total}, {caseName(run.case_id)}: {caseState(run, running)}
            {run.finished !== null && (
              <>
                {" · "}
                <InstanceLink
                  className={styles.back}
                  to={`/runs/${encodeURIComponent(run.finished.run_id)}`}
                >
                  its run
                </InstanceLink>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** How a benchmark run or a comparison ended: its execution, or why there is none. */
function BenchmarkEnd({
  live,
  workflowName,
}: {
  readonly live: LiveRun;
  readonly workflowName: (workflowId: string) => string;
}) {
  if (live.state === "cancelled") {
    return (
      <Notice title="It was cancelled" tone="note">
        <p>
          It stopped between cases. The runs of the cases that finished are kept, and no execution
          was recorded.
        </p>
      </Notice>
    );
  }
  if (live.state === "refused") {
    return (
      <Notice title="Azathoth refused it">
        <p>{live.error?.message ?? "It gave no reason."}</p>
        {live.error !== null && (
          <p>
            <code>{live.error.code}</code>
          </p>
        )}
      </Notice>
    );
  }

  const execution = isBenchmarkExecutionDetail(live.result) ? live.result : null;

  if (live.state !== "finished" || execution === null) {
    return null;
  }

  return (
    <section className={styles.outcome} aria-labelledby="execution-heading">
      <h2 id="execution-heading" className={styles.sectionTitle}>
        Execution
      </h2>
      <ol className={styles.warnings}>
        {execution.candidates.map((candidate) => (
          <li key={candidate.candidate_id}>
            {workflowName(candidate.workflow_id)}: {candidate.cases_passed} of {candidate.cases_run}{" "}
            passed
            {candidate.overall_score !== null &&
              `, scoring ${candidate.overall_score.toFixed(2)} overall`}
          </li>
        ))}
      </ol>
      <p className={styles.kept}>
        <InstanceLink
          className={styles.back}
          to={`/benchmark-executions/${encodeURIComponent(execution.execution_id)}`}
        >
          Open the execution
        </InstanceLink>
      </p>
    </section>
  );
}

/**
 * One benchmark run or comparison started from the editor, as it runs
 * (ADR 0012): each case as it starts and finishes, workflow by workflow,
 * how many have passed, Cancel, which stops it between cases, and, once it
 * ends, its execution.
 */
export function LiveBenchmarkView({
  handle,
  described,
}: {
  readonly handle: string;
  readonly described: LiveRun;
}) {
  const stream = useLiveEvents(handle);
  const cancel = useCancelRun();
  const live = stream.end ?? described;
  const benchmarkId = live.benchmark_id ?? "";
  const benchmark = useDetail("benchmarks", { id: benchmarkId }, null);
  const cases = useBenchmarkCases(benchmarkId);
  const workflows = useList("workflows");
  const running = live.state === "running" && !stream.lost;
  const now = useNow(running);
  const progress = useMemo(() => caseProgressOf(stream.cases), [stream.cases]);
  const comparing = live.kind === "comparison";
  const name = benchmark.data?.name ?? "This benchmark";
  const base = `/benchmarks/${encodeURIComponent(benchmarkId)}`;
  const caseNames = new Map(
    (cases.data ?? []).map((each) => [
      each.case_id,
      each.description === "" ? each.case_id : each.description,
    ]),
  );
  const workflowNames = new Map((workflows.data ?? []).map((each) => [each.id, each.name]));
  const workflowName = (workflowId: string): string => workflowNames.get(workflowId) ?? workflowId;
  const done = progress.reduce((sum, each) => sum + each.done, 0);
  const total = progress.reduce((sum, each) => sum + each.total, 0);
  const passed = progress.reduce((sum, each) => sum + each.passed, 0);

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <InstanceLink to="/benchmarks">Benchmarks</InstanceLink>
        <span aria-hidden="true">/</span>
        <InstanceLink to={base}>{name}</InstanceLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{comparing ? "Comparison" : "Benchmark run"}</span>
      </nav>
      <header className={styles.header}>
        <div className={styles.titles}>
          <p className={styles.eyebrow}>{comparing ? "Comparison" : "Benchmark run"}</p>
          <h1 className={styles.title}>{name}</h1>
          <p className={styles.status}>
            <span
              className={styles.pill}
              data-state={LIVE_STATE_NAMES[live.state].toLowerCase()}
              role="status"
            >
              {LIVE_STATE_NAMES[live.state]}
            </span>
            <span className={styles.facts}>
              {duration(live.started_at, live.finished_at, now)}
              {total > 0 &&
                ` · ${String(done)} of ${String(total)} cases done, ${String(passed)} passed`}
            </span>
          </p>
        </div>
        <div className={styles.actions}>
          {running ? (
            <ActionButton
              action="run_benchmark"
              subject={benchmarkId}
              type="button"
              className={buttons.danger}
              disabled={cancel.isPending}
              onClick={() => {
                cancel.mutate(handle);
              }}
            >
              {cancel.isPending ? "Cancelling…" : "Cancel"}
            </ActionButton>
          ) : (
            <InstanceLink
              className={buttons.primary}
              to={`${base}/${comparing ? "compare" : "run"}`}
            >
              {comparing ? "Compare again" : "Run again"}
            </InstanceLink>
          )}
        </div>
      </header>
      {stream.lost && live.state === "running" && (
        <Notice title="Its events stopped coming">
          <p>The editor’s server may have stopped. Reload the page to ask it again.</p>
        </Notice>
      )}
      {cancel.isError && (
        <Notice title="Couldn't cancel it">
          <p>{cancel.error.message}</p>
        </Notice>
      )}
      <BenchmarkEnd live={live} workflowName={workflowName} />
      <section className={styles.timeline} aria-labelledby="cases-heading">
        <h2 id="cases-heading" className={styles.sectionTitle}>
          Cases
        </h2>
        {progress.length === 0 ? (
          <p className={styles.quiet}>
            {running ? "Waiting for the first case to start…" : "No case ran."}
          </p>
        ) : (
          progress.map((workflow) => (
            <WorkflowCaseList
              key={workflow.workflow_id}
              workflow={workflow}
              name={workflowName(workflow.workflow_id)}
              caseName={(caseId) => caseNames.get(caseId) ?? caseId}
              running={running}
            />
          ))
        )}
      </section>
    </div>
  );
}
