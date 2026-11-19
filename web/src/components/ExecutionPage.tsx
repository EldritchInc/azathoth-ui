import { useParams } from "react-router";

import type { BenchmarkExecutionDetail, ExecutionCandidate } from "../api/types";
import { dollarsOf, EXECUTION_KIND_NAMES, passedOf, percentOf, scoreOf } from "../benchmarking";
import { useBenchmarkCases, useBenchmarkExecution, useDetail } from "../queries";
import styles from "./Benchmarks.module.css";
import { Command } from "./Command";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import { RelativeTime } from "./RelativeTime";
import { Restricted, RestrictedScope } from "./Restricted";
import layout from "./RunWorkflow.module.css";
import { SensitivityLabel } from "./SensitivityLabel";
import structure from "./Structure.module.css";

const MISSING_CODES = new Set(["not_found", "invalid_argument"]);

/** How a comparison scored one workflow, part by part. */
function Scorecard({ candidate }: { readonly candidate: ExecutionCandidate }) {
  const card = candidate.scorecard;

  if (card === null) {
    return null;
  }

  return (
    <>
      <dl className={styles.facts} aria-label={`How ${candidate.workflow_name} scored`}>
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
      <p className={styles.quiet}>{card.rationale}</p>
    </>
  );
}

/** One workflow an execution ran: how it did, and each case's result. */
function Candidate({
  execution,
  candidate,
  rank,
  caseName,
}: {
  readonly execution: BenchmarkExecutionDetail;
  readonly candidate: ExecutionCandidate;
  readonly rank: number;
  readonly caseName: (caseId: string) => string;
}) {
  const comparing = execution.kind === "compare";

  return (
    <section className={styles.panel} aria-label={candidate.workflow_name}>
      <h2 className={styles.heading}>
        {comparing && `${String(rank)}. `}
        <InstanceLink
          className={styles.link}
          to={`/workflows/${encodeURIComponent(candidate.workflow_id)}`}
        >
          {candidate.workflow_name}
        </InstanceLink>
      </h2>
      <p className={styles.quiet}>
        {passedOf(candidate)} ({percentOf(candidate.accuracy)})
        {candidate.workflow_revision !== null &&
          ` · revision ${String(candidate.workflow_revision)}`}
        {candidate.run_failures > 0 &&
          ` · ${String(candidate.run_failures)} ${candidate.run_failures === 1 ? "run" : "runs"} failed`}
        {candidate.judged_semantically &&
          ` · ${String(candidate.judge_calls)} judge ${candidate.judge_calls === 1 ? "call" : "calls"}, ${dollarsOf(candidate.judge_cost_usd)}`}
      </p>
      <Scorecard candidate={candidate} />
      <p className={styles.quiet}>
        {candidate.tallies
          .map(
            (tally) =>
              `${tally.comparison}: ${String(tally.cases_passed)} of ${String(tally.cases_run)}`,
          )
          .join(" · ")}
      </p>
      <Restricted
        sensitivity={execution.sensitivity}
        what={`${candidate.workflow_name}'s results`}
        subject={execution.execution_id}
      >
        <table className={structure.table} aria-label={`${candidate.workflow_name}'s cases`}>
          <thead>
            <tr>
              <th scope="col">Case</th>
              <th scope="col">Compared</th>
              <th scope="col">Result</th>
              <th scope="col">Score</th>
              <th scope="col">Why</th>
              <th scope="col">Run</th>
            </tr>
          </thead>
          <tbody>
            {candidate.cases.map((result) => (
              <tr key={result.case_id}>
                <td>{caseName(result.case_id)}</td>
                <td>
                  <span className={structure.comparison}>{result.comparison}</span>
                </td>
                <td data-passed={result.passed}>
                  {result.passed ? "Passed" : result.run_failure ? "Run failed" : "Failed"}
                </td>
                <td>{scoreOf(result.score)}</td>
                <td>{result.reason ?? "No longer kept"}</td>
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

/** One execution, once it is read. */
function Execution({ execution }: { readonly execution: BenchmarkExecutionDetail }) {
  const cases = useBenchmarkCases(execution.benchmark_id, execution.benchmark_revision);
  const names = new Map(
    (cases.data ?? []).map((each) => [
      each.case_id,
      each.description === "" ? each.case_id : each.description,
    ]),
  );
  const policy = execution.scoring_policy;

  return (
    <>
      <dl className={styles.facts}>
        <div>
          <dt>Recorded</dt>
          <dd>
            <RelativeTime iso={execution.recorded_at} />
          </dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{execution.benchmark_revision ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Cases</dt>
          <dd>{execution.case_count}</dd>
        </div>
        <div>
          <dt>Label</dt>
          <dd>
            <SensitivityLabel sensitivity={execution.sensitivity} />
          </dd>
        </div>
        {policy !== null && (
          <>
            <div>
              <dt>Target latency</dt>
              <dd>{policy.target_latency_seconds} s</dd>
            </div>
            <div>
              <dt>Target cost</dt>
              <dd>{dollarsOf(policy.target_cost_usd)}</dd>
            </div>
          </>
        )}
      </dl>
      <Command command={execution.command} />
      {execution.candidates.map((candidate, index) => (
        <Candidate
          key={candidate.candidate_id}
          execution={execution}
          candidate={candidate}
          rank={index + 1}
          caseName={(caseId) => names.get(caseId) ?? caseId}
        />
      ))}
    </>
  );
}

/**
 * `/benchmark-executions/:id`: one saved run or comparison of a benchmark
 * (ADR 0012): its scoring targets, its workflows, ranked in a comparison,
 * with their scorecards, and each case's result, linking to its run. A
 * restricted execution's results stay hidden until shown (ADR 0011).
 */
export function ExecutionPage() {
  const { id = "" } = useParams();
  const execution = useBenchmarkExecution(id);
  const benchmarkId = execution.data?.benchmark_id ?? null;
  const benchmark = useDetail("benchmarks", { id: benchmarkId ?? "" }, null, {
    enabled: benchmarkId !== null,
  });
  const name = benchmark.data?.name ?? "A benchmark";

  const crumbs = (
    <nav className={layout.crumbs} aria-label="Breadcrumb">
      <InstanceLink to="/benchmarks">Benchmarks</InstanceLink>
      <span aria-hidden="true">/</span>
      {benchmarkId === null ? (
        <span>{name}</span>
      ) : (
        <InstanceLink to={`/benchmarks/${encodeURIComponent(benchmarkId)}/executions`}>
          {name}
        </InstanceLink>
      )}
      <span aria-hidden="true">/</span>
      <span aria-current="page">Execution</span>
    </nav>
  );

  if (execution.isPending) {
    return (
      <div className={layout.page}>
        {crumbs}
        <p className={styles.quiet} role="status">
          Loading this execution…
        </p>
      </div>
    );
  }

  if (execution.isError) {
    return (
      <div className={layout.page}>
        {crumbs}
        <Notice
          title={
            MISSING_CODES.has(execution.error.code)
              ? "No execution at this address"
              : "Couldn't load this execution"
          }
        >
          <p>{execution.error.message}</p>
        </Notice>
      </div>
    );
  }

  return (
    <RestrictedScope>
      <div className={layout.page}>
        {crumbs}
        <header className={layout.header}>
          <p className={styles.quiet}>{EXECUTION_KIND_NAMES[execution.data.kind]}</p>
          <h1 className={layout.title}>{name}</h1>
        </header>
        <Execution execution={execution.data} />
      </div>
    </RestrictedScope>
  );
}
