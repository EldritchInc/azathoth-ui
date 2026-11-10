import { useMemo } from "react";
import { Link, useParams } from "react-router";

import type { RunDetail } from "../api/types";
import { idOf, stepsOf, type JsonObject } from "../editing";
import { titleOf } from "../problems";
import { useDetail, useRun } from "../queries";
import { duration, keptStepRun, type StepRun } from "../running";
import buttons from "./Buttons.module.css";
import { Command } from "./Command";
import { JsonBlock } from "./JsonBlock";
import styles from "./LiveRun.module.css";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";
import { RunningContext } from "./runningContext";
import { WorkflowSteps } from "./WorkflowSteps";

const MISSING_CODES = new Set(["not_found", "invalid_argument"]);

function Crumbs({ run }: { readonly run: RunDetail | undefined }) {
  return (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      <Link to="/workflows">Workflows</Link>
      <span aria-hidden="true">/</span>
      {run === undefined ? (
        <span>A workflow</span>
      ) : (
        <Link to={`/workflows/${run.workflow_id}`}>{run.workflow_name}</Link>
      )}
      <span aria-hidden="true">/</span>
      <span aria-current="page">Run</span>
    </nav>
  );
}

/** One kept run, once it has loaded: how it ended, what it was given, and each step. */
function KeptRun({ run }: { readonly run: RunDetail }) {
  const detail = useDetail("workflows", { id: run.workflow_id }, run.workflow_revision);
  const workflow = detail.data?.document as JsonObject | undefined;
  const steps = useMemo(() => (workflow === undefined ? [] : stepsOf(workflow)), [workflow]);
  const titles = useMemo(() => new Map(steps.map((step) => [idOf(step), titleOf(step)])), [steps]);
  const states = useMemo(() => {
    const kept = new Map(run.steps.map((step) => [step.step_id, step]));

    return new Map<string, StepRun>(
      steps.map((step) => [idOf(step), keptStepRun(kept.get(idOf(step)))]),
    );
  }, [run, steps]);
  const outcome = run.succeeded ? "Succeeded" : "Failed";
  const failedStep = run.error?.step_id ?? null;

  return (
    <div className={styles.page}>
      <Crumbs run={run} />
      <header className={styles.header}>
        <div className={styles.titles}>
          <p className={styles.eyebrow}>{run.invocation_id === null ? "Run" : "Production run"}</p>
          <h1 className={styles.title}>{run.workflow_name}</h1>
          <p className={styles.status}>
            <span className={styles.pill} data-state={outcome.toLowerCase()}>
              {outcome}
            </span>
            <span className={styles.facts}>
              <RelativeTime iso={run.started_at} /> · {duration(run.started_at, run.completed_at)}
              {run.workflow_revision !== null && ` · revision ${String(run.workflow_revision)}`}
              {run.resumes > 0 &&
                ` · resumed ${run.resumes === 1 ? "once" : `${String(run.resumes)} times`}`}
            </span>
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={buttons.primary} to={`/workflows/${run.workflow_id}/run`}>
            Run again
          </Link>
        </div>
      </header>
      <Command command={run.command} />
      {run.error !== null && (
        <Notice
          title={
            failedStep === null ? "The run failed" : `${titles.get(failedStep) ?? "A step"} failed`
          }
        >
          <p>{run.error.message}</p>
        </Notice>
      )}
      <div className={styles.pair}>
        <section className={styles.outcome} aria-labelledby="input-heading">
          <h2 id="input-heading" className={styles.sectionTitle}>
            Input
          </h2>
          {run.has_input ? (
            <JsonBlock value={run.input} label="The run's input, as JSON" />
          ) : (
            <p className={styles.quiet}>It was given no input.</p>
          )}
        </section>
        <section className={styles.outcome} aria-labelledby="result-heading">
          <h2 id="result-heading" className={styles.sectionTitle}>
            Result
          </h2>
          {run.has_result ? (
            <JsonBlock value={run.result} label="The run's result, as JSON" />
          ) : (
            <p className={styles.quiet}>
              {run.succeeded ? "The workflow declares no result." : "It produced none."}
            </p>
          )}
        </section>
      </div>
      {detail.isError && (
        <Notice title="Couldn't load the revision it ran" tone="note">
          <p>{detail.error.message}</p>
        </Notice>
      )}
      {workflow !== undefined && (
        <RunningContext value={states}>
          <WorkflowSteps document={workflow} />
        </RunningContext>
      )}
    </div>
  );
}

/**
 * `/runs/:runId`: one run Azathoth kept, as `run show` shows it: how it
 * ended, its input and result, and each step on the graph of the revision
 * it ran, with what it did (ADR 0007).
 */
export function RunPage() {
  const { runId = "" } = useParams();
  const run = useRun(runId);

  if (run.isPending) {
    return (
      <div className={styles.page}>
        <Crumbs run={undefined} />
        <p className={styles.quiet} role="status">
          Loading this run…
        </p>
      </div>
    );
  }

  if (run.isError) {
    return (
      <div className={styles.page}>
        <Crumbs run={undefined} />
        <Notice
          title={
            MISSING_CODES.has(run.error.code) ? "No run at this address" : "Couldn't load this run"
          }
        >
          <p>{run.error.message}</p>
          <p>
            <Link className={styles.back} to="/workflows">
              Back to workflows
            </Link>
          </p>
        </Notice>
      </div>
    );
  }

  return <KeptRun run={run.data} />;
}
