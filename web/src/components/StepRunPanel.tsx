import { STEP_STATE_NAMES, duration, measured, type StepRun } from "../running";
import { JsonBlock } from "./JsonBlock";
import styles from "./StepRunPanel.module.css";

/**
 * What the run being shown did with one step: where it is, how long it
 * took and how often it was tried, what it ran on and measured, what it
 * returned and added, and every attempt that failed. A step tried alone is
 * shown the same way, under a `heading` of its own.
 */
export function StepRunPanel({
  run,
  title,
  heading = "In this run",
  label = `${title} in this run`,
}: {
  readonly run: StepRun;
  readonly title: string;
  readonly heading?: string;
  readonly label?: string;
}) {
  const facts = [
    run.attempts !== null && run.attempts > 1 ? `${String(run.attempts)} attempts` : null,
    run.startedAt !== null && run.completedAt !== null
      ? duration(run.startedAt, run.completedAt)
      : null,
  ].filter((fact) => fact !== null);
  const values = Object.keys(run.values);
  const measures = run.metrics === null ? [] : measured(run.metrics);

  return (
    <section className={styles.panel} aria-label={label}>
      <div className={styles.top}>
        <h4 className={styles.title}>{heading}</h4>
        <span className={styles.state} data-run={run.state}>
          {STEP_STATE_NAMES[run.state]}
        </span>
        {facts.length > 0 && <span className={styles.facts}>{facts.join(" · ")}</span>}
      </div>
      {run.message !== null && run.state === "running" && (
        <p className={styles.message}>“{run.message}”</p>
      )}
      {(run.strategy !== null || measures.length > 0) && (
        <dl className={styles.measures}>
          {run.strategy !== null && (
            <div>
              <dt>Ran</dt>
              <dd>{run.strategy}</dd>
            </div>
          )}
          {measures.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {run.failures.length > 0 ? (
        <ol className={styles.failures} aria-label="Failed attempts">
          {run.failures.map((failure) => (
            <li key={failure.attempt}>
              <span className={styles.attempt}>Attempt {failure.attempt}</span>
              <code className={styles.exception}>{failure.exception_type}</code>
              <span>{failure.message}</span>
            </li>
          ))}
        </ol>
      ) : (
        run.failure !== null && <p className={styles.failure}>{run.failure}</p>
      )}
      {run.hasOutput && (
        <div className={styles.block}>
          <h5 className={styles.label}>It returned</h5>
          <JsonBlock value={run.output} label={`What ${title} returned, as JSON`} />
        </div>
      )}
      {values.length > 0 && (
        <div className={styles.block}>
          <h5 className={styles.label}>It added</h5>
          <JsonBlock value={run.values} label={`What ${title} added, as JSON`} />
        </div>
      )}
    </section>
  );
}
