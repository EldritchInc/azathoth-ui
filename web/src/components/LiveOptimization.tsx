import { useEffect, useMemo, useState } from "react";

import { isOptimizationSummary, type LiveRun } from "../api/types";
import {
  candidateLine,
  generationEndLine,
  generationProgressOf,
  generationTitle,
  type GenerationProgress,
} from "../optimizing";
import { useCancelRun, useDetail } from "../queries";
import { duration, LIVE_STATE_NAMES } from "../running";
import { useLiveEvents } from "../useLiveEvents";
import { resource } from "../permissions";
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

/** One generation, or the final evaluation: its candidates so far, and its winner. */
function GenerationList({
  progress,
  running,
}: {
  readonly progress: GenerationProgress;
  readonly running: boolean;
}) {
  const name = progress.final ? "Final evaluation" : `Generation ${String(progress.generation)}`;
  const waiting =
    progress.ended === null && progress.finished.length < progress.candidates
      ? progress.finished.length + 1
      : null;
  const end = generationEndLine(progress);

  return (
    <section className={styles.outcome} aria-label={name}>
      <h3 className={styles.sectionTitle}>{generationTitle(progress)}</h3>
      <ol className={styles.events} aria-live="polite">
        {progress.finished.map((candidate, index) => (
          <li key={index} className={styles.event} data-type="candidate_finished">
            {candidateLine(candidate, index + 1, progress.candidates)}
          </li>
        ))}
        {waiting !== null && (
          <li className={styles.event} data-type="candidate_started">
            Candidate {waiting} of {progress.candidates}: {running ? "Running…" : "Stopped"}
          </li>
        )}
        {end !== null && progress.ended !== null && (
          <li className={styles.event} data-type="generation_finished">
            {end}
            {" · "}
            <InstanceLink
              className={styles.back}
              to={`/experiments/${encodeURIComponent(progress.ended.experiment_id)}`}
            >
              its experiment
            </InstanceLink>
          </li>
        )}
      </ol>
    </section>
  );
}

/** How an optimization ended: its winning experiment, or why there is none. */
function OptimizationEnd({ live }: { readonly live: LiveRun }) {
  const experiments = `/workflows/${encodeURIComponent(live.workflow_id)}/experiments`;

  if (live.state === "cancelled") {
    return (
      <Notice title="It was cancelled" tone="note">
        <p>
          It stopped between candidates. The experiments of the generations that finished are kept,
          and so are the runs of the candidates that finished.{" "}
          <InstanceLink className={styles.back} to={experiments}>
            See its experiments
          </InstanceLink>
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

  const session = isOptimizationSummary(live.result) ? live.result : null;

  if (live.state !== "finished" || session === null) {
    return null;
  }

  return (
    <section className={styles.outcome} aria-labelledby="winner-heading">
      <h2 id="winner-heading" className={styles.sectionTitle}>
        Winner
      </h2>
      {session.final_skipped !== null && (
        <Notice title="The final evaluation didn't run" tone="note">
          <p>{session.final_skipped}</p>
        </Notice>
      )}
      <p className={styles.kept}>
        Its experiment ranks every candidate it measured, and compares the winner with what
        production runs.{" "}
        <InstanceLink
          className={styles.back}
          to={`/experiments/${encodeURIComponent(session.winning_experiment_id)}`}
        >
          Open the winning experiment
        </InstanceLink>
      </p>
    </section>
  );
}

/**
 * One optimization started from the editor, as it runs (ADR 0013): each
 * generation as it starts, each candidate's passes and score as it
 * finishes, each generation's winner, how many it proposes and its
 * experiment, Cancel, which stops it between candidates, and, once it ends,
 * its winning experiment.
 */
export function LiveOptimizationView({
  handle,
  described,
}: {
  readonly handle: string;
  readonly described: LiveRun;
}) {
  const stream = useLiveEvents(handle);
  const cancel = useCancelRun();
  const live = stream.end ?? described;
  const workflow = useDetail("workflows", { id: live.workflow_id }, null);
  const benchmarkId = live.benchmark_id ?? "";
  const benchmark = useDetail("benchmarks", { id: benchmarkId }, null, {
    enabled: benchmarkId !== "",
  });
  const running = live.state === "running" && !stream.lost;
  const now = useNow(running);
  const progress = useMemo(() => generationProgressOf(stream.generations), [stream.generations]);
  const name = workflow.data?.name ?? "This workflow";
  const base = `/workflows/${encodeURIComponent(live.workflow_id)}`;
  const kept = progress.filter((each) => each.ended !== null).length;

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <InstanceLink to="/workflows">Workflows</InstanceLink>
        <span aria-hidden="true">/</span>
        <InstanceLink to={base}>{name}</InstanceLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Optimization</span>
      </nav>
      <header className={styles.header}>
        <div className={styles.titles}>
          <p className={styles.eyebrow}>Optimization</p>
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
              {kept > 0 && ` · ${String(kept)} experiment${kept === 1 ? "" : "s"} kept`}
            </span>
          </p>
        </div>
        <div className={styles.actions}>
          {running ? (
            <ActionButton
              action="optimize"
              subject={resource("workflow", live.workflow_id)}
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
            <InstanceLink className={buttons.primary} to={`${base}/optimize`}>
              Optimize again
            </InstanceLink>
          )}
        </div>
      </header>
      {benchmark.data !== undefined && (
        <p className={styles.kept}>Against {benchmark.data.name}.</p>
      )}
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
      <OptimizationEnd live={live} />
      <section className={styles.timeline} aria-labelledby="generations-heading">
        <h2 id="generations-heading" className={styles.sectionTitle}>
          Generations
        </h2>
        {progress.length === 0 ? (
          <p className={styles.quiet}>
            {running ? "Waiting for the first generation to start…" : "No generation ran."}
          </p>
        ) : (
          progress.map((each, index) => (
            <GenerationList key={index} progress={each} running={running} />
          ))
        )}
      </section>
    </div>
  );
}
