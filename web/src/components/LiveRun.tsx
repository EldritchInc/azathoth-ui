import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { isRunResult, type LiveRun, type RunEvent } from "../api/types";
import { idOf, stepsOf, type JsonObject } from "../editing";
import { titleOf } from "../problems";
import { useCancelRun, useDetail, useLiveRun } from "../queries";
import {
  duration,
  eventLine,
  outcomeName,
  progressOf,
  stepState,
  type Progress,
  type StepState,
} from "../running";
import { useLiveEvents } from "../useLiveEvents";
import buttons from "./Buttons.module.css";
import { JsonBlock } from "./JsonBlock";
import styles from "./LiveRun.module.css";
import { Notice } from "./Notice";
import { RunningContext } from "./runningContext";
import { WorkflowSteps } from "./WorkflowSteps";

const MISSING_CODES = new Set(["not_found"]);

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

function Crumbs({
  name,
  workflowId,
}: {
  readonly name: string;
  readonly workflowId: string | null;
}) {
  return (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      <Link to="/workflows">Workflows</Link>
      <span aria-hidden="true">/</span>
      {workflowId === null ? (
        <span>{name}</span>
      ) : (
        <Link to={`/workflows/${workflowId}`}>{name}</Link>
      )}
      <span aria-hidden="true">/</span>
      <span aria-current="page">Live run</span>
    </nav>
  );
}

/** Returns the values a tried step added, from its trial. */
function trialValues(result: Readonly<Record<string, unknown>> | null): unknown {
  const step = result?.step;

  if (typeof step !== "object" || step === null || !("values" in step)) {
    return {};
  }
  return step.values;
}

/** How the run ended, said in full: its result, why it failed, or why it never ran. */
function Outcome({
  live,
  titleOf: title,
}: {
  readonly live: LiveRun;
  readonly titleOf: (step: string) => string;
}) {
  if (live.state === "running") {
    return null;
  }
  if (live.state === "cancelled") {
    return (
      <Notice title="The run was cancelled" tone="note">
        <p>It stopped where it was, and nothing of it was kept.</p>
      </Notice>
    );
  }
  if (live.state === "refused") {
    return (
      <Notice title="Azathoth refused the run">
        <p>{live.error?.message ?? "It gave no reason."}</p>
      </Notice>
    );
  }
  if (live.kind === "step") {
    return (
      <section className={styles.outcome} aria-labelledby="outcome-heading">
        <h2 id="outcome-heading" className={styles.sectionTitle}>
          What the step added
        </h2>
        <JsonBlock value={trialValues(live.result)} label="The values the step added, as JSON" />
      </section>
    );
  }

  const result = isRunResult(live.result) ? live.result : null;

  if (result === null) {
    return null;
  }

  return (
    <section className={styles.outcome} aria-labelledby="outcome-heading">
      <h2 id="outcome-heading" className={styles.sectionTitle}>
        {result.succeeded ? "Result" : "Why it failed"}
      </h2>
      {result.succeeded &&
        (result.has_result ? (
          <JsonBlock value={result.result} label="The run's result, as JSON" />
        ) : (
          <p className={styles.quiet}>The workflow declares no result, so there is none to show.</p>
        ))}
      {result.error !== null && (
        <Notice
          title={
            result.error.step_id === null
              ? "The run failed"
              : `${title(result.error.step_id)} failed`
          }
        >
          <p>{result.error.message}</p>
        </Notice>
      )}
      {result.warnings.length > 0 && (
        <Notice title="Beside the run" tone="note">
          <ul className={styles.warnings}>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      )}
      <p className={styles.kept}>
        Kept as run <code>{result.run_id}</code>.
      </p>
    </section>
  );
}

/** The run's events as they came, each said in words. */
function Timeline({
  events,
  titleOf: title,
  running,
}: {
  readonly events: readonly RunEvent[];
  readonly titleOf: (step: string) => string;
  readonly running: boolean;
}) {
  return (
    <section className={styles.timeline} aria-labelledby="timeline-heading">
      <h2 id="timeline-heading" className={styles.sectionTitle}>
        As it ran
      </h2>
      {events.length === 0 ? (
        <p className={styles.quiet}>
          {running ? "Waiting for the run’s first event…" : "No events."}
        </p>
      ) : (
        <ol className={styles.events} aria-live="polite">
          {events.map((event, index) => (
            <li key={index} className={styles.event} data-type={event.type}>
              {eventLine(event, title)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Returns whether a finished run succeeded, by how it ended: a run's result,
 * a tried step's status, or else its events.
 */
function succeededOf(live: LiveRun, progress: Progress): boolean | null {
  if (isRunResult(live.result)) {
    return live.result.succeeded;
  }

  const step = live.result?.step;

  if (typeof step === "object" && step !== null && "status" in step) {
    return step.status === "executed";
  }
  return progress.succeeded;
}

const DONE: ReadonlySet<StepState> = new Set(["executed", "failed", "skipped"]);

function counted(progress: Progress, steps: readonly string[]): string {
  const done = steps.filter((step) => DONE.has(stepState(progress, step))).length;

  return `${String(done)} of ${String(steps.length)} steps done`;
}

/** One live run, once the server has said what it runs. */
function LiveRunView({
  handle,
  described,
}: {
  readonly handle: string;
  readonly described: LiveRun;
}) {
  const stream = useLiveEvents(handle);
  const cancel = useCancelRun();
  const detail = useDetail("workflows", { id: described.workflow_id }, null);
  const live = stream.end ?? described;
  const running = live.state === "running" && !stream.lost;
  const now = useNow(running);
  const progress = useMemo(() => progressOf(stream.events), [stream.events]);
  const workflow = detail.data?.document as JsonObject | undefined;
  const steps = useMemo(() => (workflow === undefined ? [] : stepsOf(workflow)), [workflow]);
  const titles = useMemo(() => new Map(steps.map((step) => [idOf(step), titleOf(step)])), [steps]);
  const title = (step: string): string => titles.get(step) ?? "A step";
  const ended = live.state !== "running";
  const states = useMemo(
    () =>
      new Map<string, StepState>(
        steps.map((step) => [idOf(step), stepState(progress, idOf(step), ended)]),
      ),
    [steps, progress, ended],
  );
  const name = detail.data?.name ?? "This workflow";
  const outcome = outcomeName(live, succeededOf(live, progress));

  return (
    <div className={styles.page}>
      <Crumbs name={name} workflowId={live.workflow_id} />
      <header className={styles.header}>
        <div className={styles.titles}>
          <p className={styles.eyebrow}>
            {live.kind === "step" ? `Trying ${title(live.step_id ?? "")}` : "Live run"}
          </p>
          <h1 className={styles.title}>{name}</h1>
          <p className={styles.status}>
            <span className={styles.pill} data-state={outcome.toLowerCase()} role="status">
              {outcome}
            </span>
            <span className={styles.facts}>
              {duration(live.started_at, live.finished_at, now)}
              {steps.length > 0 &&
                live.kind === "run" &&
                ` · ${counted(progress, [...titles.keys()])}`}
            </span>
          </p>
        </div>
        <div className={styles.actions}>
          {running ? (
            <button
              type="button"
              className={buttons.danger}
              disabled={cancel.isPending}
              onClick={() => {
                cancel.mutate(handle);
              }}
            >
              {cancel.isPending ? "Cancelling…" : "Cancel"}
            </button>
          ) : (
            live.kind === "run" && (
              <Link className={buttons.primary} to={`/workflows/${live.workflow_id}/run`}>
                Run again
              </Link>
            )
          )}
        </div>
      </header>
      {stream.lost && live.state === "running" && (
        <Notice title="The run's events stopped coming">
          <p>The editor’s server may have stopped. Reload the page to ask it again.</p>
        </Notice>
      )}
      {cancel.isError && (
        <Notice title="Couldn't cancel the run">
          <p>{cancel.error.message}</p>
        </Notice>
      )}
      <Outcome live={live} titleOf={title} />
      <div className={styles.body}>
        <div className={styles.graph}>
          {workflow !== undefined && (
            <RunningContext value={states}>
              <WorkflowSteps document={workflow} />
            </RunningContext>
          )}
        </div>
        <Timeline events={stream.events} titleOf={title} running={running} />
      </div>
    </div>
  );
}

/**
 * `/live/:handle`: one run started from the editor, as it runs (ADR 0007):
 * each step lit on the graph as it starts and ends, every event in words,
 * and how it ended. Reloading picks it up where it is.
 */
export function LiveRunPage() {
  const { handle = "" } = useParams();
  const live = useLiveRun(handle);

  if (live.isPending) {
    return (
      <div className={styles.page}>
        <Crumbs name="A workflow" workflowId={null} />
        <p className={styles.quiet} role="status">
          Finding this run…
        </p>
      </div>
    );
  }

  if (live.isError) {
    return (
      <div className={styles.page}>
        <Crumbs name="A workflow" workflowId={null} />
        <Notice
          title={
            MISSING_CODES.has(live.error.code) ? "No run at this address" : "Couldn't find this run"
          }
        >
          <p>{live.error.message}</p>
          <p>
            <Link className={styles.back} to="/workflows">
              Back to workflows
            </Link>
          </p>
        </Notice>
      </div>
    );
  }

  return <LiveRunView key={handle} handle={handle} described={live.data} />;
}
