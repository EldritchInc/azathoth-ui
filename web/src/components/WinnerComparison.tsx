import type {
  ComparisonBaseline,
  ExperimentComparison,
  ExperimentDetail,
  RunCosts,
} from "../api/types";
import { dollarsOf } from "../benchmarking";
import { comparedResult, costSaving, projectionLine, timeSaving } from "../optimizing";
import { useComparison } from "../queries";
import { lengthOf } from "../running";
import { resource } from "../permissions";
import styles from "./Benchmarks.module.css";
import { Notice } from "./Notice";
import { Restricted } from "./Restricted";
import structure from "./Structure.module.css";

/** What each baseline is called, as a column. */
const BASELINE_NAMES: Readonly<Record<ComparisonBaseline, string>> = {
  production: "Production",
  configured: "Configured",
};

/** What the comparison is headed, by its baseline. */
const HEADINGS: Readonly<Record<ComparisonBaseline, string>> = {
  production: "The winner against production",
  configured: "The winner against the workflow as configured",
};

function shortId(id: string | null): string {
  return id === null ? "—" : id.slice(0, 8);
}

function costOf(runs: RunCosts | null): string {
  const cost = runs?.cost_usd ?? null;

  return cost === null ? "—" : dollarsOf(cost);
}

function timeOf(runs: RunCosts | null): string {
  const seconds = runs?.latency_seconds ?? null;

  return seconds === null ? "—" : lengthOf(seconds);
}

/** The winner beside its baseline, once there is one. */
function Compared({
  experiment,
  comparison,
  baseline,
}: {
  readonly experiment: ExperimentDetail;
  readonly comparison: ExperimentComparison;
  readonly baseline: ComparisonBaseline;
}) {
  const before = BASELINE_NAMES[baseline];
  const changed = comparison.steps.filter((step) => step.differs);
  const savings = comparison.savings;
  const projection = comparison.projection;

  return (
    <>
      <h2 className={styles.heading}>{HEADINGS[baseline]}</h2>
      {baseline === "configured" && (
        <p className={styles.quiet}>
          Production runs none of this experiment’s candidates, so the winner is compared with the
          candidate the workflow is configured with.
        </p>
      )}
      {changed.length === 0 ? (
        <p className={styles.quiet}>No step’s model changed.</p>
      ) : (
        <table className={structure.table} aria-label="Steps that changed">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">{before}</th>
              <th scope="col">Winner</th>
            </tr>
          </thead>
          <tbody>
            {changed.map((step) => (
              <tr key={step.step_id}>
                <td>
                  <code>{shortId(step.step_id)}</code>
                </td>
                <td>
                  {step.baseline_model === null ? "no model" : <code>{step.baseline_model}</code>}
                </td>
                <td>
                  {step.winner_model === null ? "no model" : <code>{step.winner_model}</code>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Restricted
        sensitivity={experiment.sensitivity}
        what="its cases on both sides"
        subject={resource("experiment", experiment.experiment_id)}
      >
        <table className={structure.table} aria-label="Cases on both sides">
          <thead>
            <tr>
              <th scope="col">Case</th>
              <th scope="col">{before}</th>
              <th scope="col">Winner</th>
            </tr>
          </thead>
          <tbody>
            {comparison.cases.map((each, index) => (
              <tr key={`${String(index)}-${each.case_id ?? ""}`}>
                <td>
                  <code>{shortId(each.case_id)}</code>
                </td>
                <td>{comparedResult(each.baseline_passed, each.baseline_score)}</td>
                <td>{comparedResult(each.winner_passed, each.winner_score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Restricted>
      <table className={structure.table} aria-label="Per run">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Measure</span>
            </th>
            <th scope="col">{before}</th>
            <th scope="col">Winner</th>
            <th scope="col">Winner saves</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Cost</th>
            <td>{costOf(comparison.baseline_runs)}</td>
            <td>{costOf(comparison.winner_runs)}</td>
            <td>{costSaving(savings?.cost_usd ?? null, savings?.cost_percent ?? null)}</td>
          </tr>
          <tr>
            <th scope="row">Time</th>
            <td>{timeOf(comparison.baseline_runs)}</td>
            <td>{timeOf(comparison.winner_runs)}</td>
            <td>
              {timeSaving(savings?.latency_seconds ?? null, savings?.latency_percent ?? null)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className={styles.quiet}>
        Measured over {comparison.winner_runs.runs} runs of the winner and{" "}
        {comparison.baseline_runs?.runs ?? 0} of {before.toLowerCase()}.
      </p>
      {projection !== null && (
        <section className={styles.panel} aria-label="Projection">
          <h3 className={styles.heading}>If production had run the winner</h3>
          <p className={styles.quiet}>
            A projection from production’s recent invocations, not a measurement: it assumes each
            would have saved what the winner saves per run on the benchmark.
          </p>
          <p>{projectionLine(projection)}</p>
        </section>
      )}
    </>
  );
}

/**
 * An experiment's winner beside what promoting it would replace (ADR 0013):
 * what production runs, or else the workflow as configured; each step that
 * changed, each case on both sides, what each costs and takes per run, what
 * the winner saves, and, over production's recent invocations, a
 * projection labelled as one. A negative saving is said as a cost.
 */
export function WinnerComparison({ experiment }: { readonly experiment: ExperimentDetail }) {
  const comparison = useComparison(experiment.experiment_id);

  return (
    <section className={styles.section} aria-label="Comparison">
      {comparison.isPending && (
        <p className={styles.quiet} role="status">
          Comparing the winner…
        </p>
      )}
      {comparison.isError && (
        <Notice title="Couldn't compare the winner">
          <p>{comparison.error.message}</p>
        </Notice>
      )}
      {comparison.isSuccess &&
        (comparison.data.baseline === null ? (
          <>
            <h2 className={styles.heading}>Comparison</h2>
            <Notice title="Nothing to compare" tone="note">
              <p>{comparison.data.reason ?? "There is no baseline to compare the winner with."}</p>
            </Notice>
          </>
        ) : (
          <Compared
            experiment={experiment}
            comparison={comparison.data}
            baseline={comparison.data.baseline}
          />
        ))}
    </section>
  );
}
