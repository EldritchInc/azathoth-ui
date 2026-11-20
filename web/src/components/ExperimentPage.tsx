import { useParams } from "react-router";

import type { ExperimentCandidate, ExperimentDetail } from "../api/types";
import { dollarsOf, scoreOf } from "../benchmarking";
import { useDetail, useExperiment } from "../queries";
import styles from "./Benchmarks.module.css";
import { Command } from "./Command";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import { PromoteWinner } from "./PromoteWinner";
import { RelativeTime } from "./RelativeTime";
import { Restricted, RestrictedScope } from "./Restricted";
import layout from "./RunWorkflow.module.css";
import { SensitivityLabel } from "./SensitivityLabel";
import structure from "./Structure.module.css";
import { WinnerComparison } from "./WinnerComparison";

const MISSING_CODES = new Set(["not_found", "experiment_not_found", "invalid_argument"]);

function outcome(passed: boolean | null): string {
  if (passed === null) {
    return "Unknown";
  }

  return passed ? "Passed" : "Failed";
}

/** Returns how many of a candidate's cases passed, said in words. */
function candidatePassed(candidate: ExperimentCandidate): string {
  return candidate.cases_passed === null
    ? `${String(candidate.cases_run)} cases, outcomes unknown`
    : `${String(candidate.cases_passed)} of ${String(candidate.cases_run)} passed`;
}

/** One candidate of an experiment, in its place. */
function Candidate({
  experiment,
  candidate,
}: {
  readonly experiment: ExperimentDetail;
  readonly candidate: ExperimentCandidate;
}) {
  const card = candidate.scorecard;

  return (
    <section className={styles.panel} aria-label={`Rank ${String(candidate.rank)}`}>
      <h3 className={styles.heading}>
        {candidate.rank === 1 ? "Winner" : `Rank ${String(candidate.rank)}`}
      </h3>
      <p className={styles.quiet}>
        {candidatePassed(candidate)}
        {candidate.workflow_revision !== null &&
          ` · revision ${String(candidate.workflow_revision)}`}
        {candidate.judge_calls > 0 &&
          ` · ${String(candidate.judge_calls)} judge ${candidate.judge_calls === 1 ? "call" : "calls"}, ${dollarsOf(candidate.judge_cost_usd)}`}
      </p>
      {candidate.steps.length === 0 ? (
        <p className={styles.quiet}>
          Its runs are no longer kept, so the models it ran on can’t be told.
        </p>
      ) : (
        <ul className={styles.citations} aria-label="Its steps">
          {candidate.steps.map((step) => (
            <li key={step.step_id}>
              <code>{step.step_id.slice(0, 8)}</code>:{" "}
              {step.model === null ? "no model" : <code>{step.model}</code>}
            </li>
          ))}
        </ul>
      )}
      <dl className={styles.facts} aria-label="Its scores">
        <div>
          <dt>Overall</dt>
          <dd>{scoreOf(card.overall_score)}</dd>
        </div>
        <div>
          <dt>Quality</dt>
          <dd>{scoreOf(card.quality_score)}</dd>
        </div>
        <div>
          <dt>Reliability</dt>
          <dd>{scoreOf(card.reliability_score)}</dd>
        </div>
        <div>
          <dt>Latency</dt>
          <dd>{scoreOf(card.latency_score)}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>{scoreOf(card.cost_score)}</dd>
        </div>
        <div>
          <dt>Citations</dt>
          <dd>{scoreOf(card.citation_score)}</dd>
        </div>
      </dl>
      <Restricted
        sensitivity={experiment.sensitivity}
        what="its cases"
        subject={experiment.experiment_id}
      >
        <table className={structure.table} aria-label="Its cases">
          <thead>
            <tr>
              <th scope="col">Case</th>
              <th scope="col">Result</th>
              <th scope="col">Run</th>
            </tr>
          </thead>
          <tbody>
            {candidate.cases.map((result, index) => (
              <tr key={`${String(index)}-${result.run_id}`}>
                <td>
                  <code>{result.case_id === null ? "—" : result.case_id.slice(0, 8)}</code>
                </td>
                <td>{outcome(result.passed)}</td>
                <td>
                  <InstanceLink
                    className={styles.link}
                    to={`/runs/${encodeURIComponent(result.run_id)}`}
                  >
                    Open
                  </InstanceLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Restricted>
    </section>
  );
}

/** One experiment, once it is read. */
function Experiment({ experiment }: { readonly experiment: ExperimentDetail }) {
  const benchmark = useDetail("benchmarks", { id: experiment.benchmark_id ?? "" }, null, {
    enabled: experiment.benchmark_id !== null,
  });
  const benchmarkName = benchmark.data?.name ?? "Its benchmark";

  return (
    <>
      <dl className={styles.facts}>
        <div>
          <dt>Recorded</dt>
          <dd>
            <RelativeTime iso={experiment.recorded_at} />
          </dd>
        </div>
        <div>
          <dt>Benchmark</dt>
          <dd>
            {experiment.benchmark_id === null ? (
              "None recorded"
            ) : (
              <InstanceLink
                className={styles.link}
                to={`/benchmarks/${encodeURIComponent(experiment.benchmark_id)}`}
              >
                {experiment.benchmark_revision === null
                  ? benchmarkName
                  : `${benchmarkName}, revision ${String(experiment.benchmark_revision)}`}
              </InstanceLink>
            )}
          </dd>
        </div>
        <div>
          <dt>Candidates</dt>
          <dd>{experiment.candidate_count}</dd>
        </div>
        <div>
          <dt>Cases</dt>
          <dd>{experiment.case_count}</dd>
        </div>
        <div>
          <dt>Label</dt>
          <dd>
            <SensitivityLabel sensitivity={experiment.sensitivity} />
          </dd>
        </div>
      </dl>
      <Command command={experiment.command} />
      <WinnerComparison experiment={experiment} />
      <PromoteWinner experiment={experiment} />
      <section className={styles.section} aria-label="Candidates">
        <h2 className={styles.heading}>Candidates</h2>
        {experiment.candidates.map((candidate) => (
          <Candidate key={candidate.observation_id} experiment={experiment} candidate={candidate} />
        ))}
      </section>
    </>
  );
}

/**
 * `/experiments/:id`: one experiment an optimization recorded (ADR 0013):
 * what it ran, its winner compared with what promoting it would replace,
 * promoting it once it is confirmed, and every candidate ranked, with the model each step ran on, its
 * scorecard, and each case linking to its run. A restricted experiment's
 * cases stay hidden until shown (ADR 0011).
 */
export function ExperimentPage() {
  const { id = "" } = useParams();
  const experiment = useExperiment(id);
  const workflowId = experiment.data?.workflow_id ?? null;
  const name = experiment.data?.workflow_name ?? "A workflow";

  const crumbs = (
    <nav className={layout.crumbs} aria-label="Breadcrumb">
      <InstanceLink to="/workflows">Workflows</InstanceLink>
      <span aria-hidden="true">/</span>
      {workflowId === null ? (
        <span>{name}</span>
      ) : (
        <InstanceLink to={`/workflows/${encodeURIComponent(workflowId)}/experiments`}>
          {name}
        </InstanceLink>
      )}
      <span aria-hidden="true">/</span>
      <span aria-current="page">Experiment</span>
    </nav>
  );

  if (experiment.isPending) {
    return (
      <div className={layout.page}>
        {crumbs}
        <p className={styles.quiet} role="status">
          Loading this experiment…
        </p>
      </div>
    );
  }

  if (experiment.isError) {
    return (
      <div className={layout.page}>
        {crumbs}
        <Notice
          title={
            MISSING_CODES.has(experiment.error.code)
              ? "No experiment at this address"
              : "Couldn't load this experiment"
          }
        >
          <p>{experiment.error.message}</p>
        </Notice>
      </div>
    );
  }

  return (
    <RestrictedScope>
      <div className={layout.page}>
        {crumbs}
        <header className={layout.header}>
          <p className={styles.quiet}>Experiment</p>
          <h1 className={layout.title}>{experiment.data.workflow_name}</h1>
        </header>
        <Experiment experiment={experiment.data} />
      </div>
    </RestrictedScope>
  );
}
