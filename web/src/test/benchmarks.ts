/**
 * A benchmark's cases and executions as the editor's server describes them:
 * a case made from JSON and one made from a run, what adding one answers, a
 * run of the benchmark and a comparison, and their live events (ADR 0012).
 */

import type {
  BenchmarkCaseChange,
  BenchmarkCaseDetail,
  BenchmarkCaseSummary,
  BenchmarkEvent,
  BenchmarkExecutionDetail,
  BenchmarkExecutionSummary,
  CandidateScorecard,
  ExecutionCandidate,
  LiveRun,
} from "../api/types";
import { BENCHMARK, REVIEW_WORKFLOW, WORKFLOW } from "./instances";
import { LIVE_RUN, RUN_SUMMARY } from "./runs";

/** The benchmark's first case: JSON, compared exactly, naming no citations. */
export const JSON_CASE: BenchmarkCaseSummary = {
  benchmark_id: BENCHMARK.id,
  revision: 2,
  case_id: "c1000000-0000-4000-8000-000000000001",
  description: "Eight words.",
  comparison: "exact",
  sensitivity: "internal",
  source: "json",
  source_run_id: null,
  cited: false,
  command: `azathoth benchmark case-show ${BENCHMARK.id} c1000000-0000-4000-8000-000000000001`,
};

/** The benchmark's second case: made from a kept run, restricted, naming what it must cite. */
export const RUN_CASE: BenchmarkCaseSummary = {
  ...JSON_CASE,
  case_id: "c1000000-0000-4000-8000-000000000002",
  description: "The summary the run should have written.",
  comparison: "semantic",
  sensitivity: "restricted",
  source: "run",
  source_run_id: RUN_SUMMARY.run_id,
  cited: true,
  command: `azathoth benchmark case-show ${BENCHMARK.id} c1000000-0000-4000-8000-000000000002`,
};

/** The benchmark's cases at its latest revision, in order. */
export const CASES: readonly BenchmarkCaseSummary[] = [JSON_CASE, RUN_CASE];

/** The first case, with its input and what it expects. */
export const JSON_CASE_DETAIL: BenchmarkCaseDetail = {
  ...JSON_CASE,
  input: "that is not dead which can eternal lie",
  input_provenance: null,
  expected: 8,
  citations: null,
  source_feedback_id: null,
  metadata: {},
};

/** The second case, expecting its run's corrected output and two cited segments. */
export const RUN_CASE_DETAIL: BenchmarkCaseDetail = {
  ...RUN_CASE,
  input: { text: "The fire spread to the east wing." },
  input_provenance: { run_id: RUN_SUMMARY.run_id },
  expected: { summary: "A fire spread east." },
  citations: {
    require: [
      { source: "report", segment: "p1" },
      { source: "report", segment: "p2" },
    ],
    on_unverified: "fail",
  },
  source_feedback_id: "fb000000-0000-4000-8000-000000000001",
  metadata: { added_by: "eris" },
};

/** What adding the second case answers: it, and the benchmark's revision that holds it. */
export const ADDED: BenchmarkCaseChange = {
  case: RUN_CASE_DETAIL,
  benchmark: {
    ...BENCHMARK,
    case_count: 2,
    sensitivity: "restricted",
    revision: { ...BENCHMARK.revision, number: 2 },
  },
};

const RUN_CANDIDATE: ExecutionCandidate = {
  candidate_id: "ca000000-0000-4000-8000-000000000001",
  workflow_id: WORKFLOW.id,
  workflow_name: WORKFLOW.name,
  workflow_revision: 1,
  cases_run: 2,
  cases_passed: 1,
  accuracy: 0.5,
  overall_score: null,
  strategy_ids: ["57000000-0000-4000-8000-000000000001"],
  run_failures: 0,
  judged_semantically: true,
  judge_calls: 1,
  judge_cost_usd: 0.0004,
  tallies: [
    { comparison: "exact", cases_run: 1, cases_passed: 1 },
    { comparison: "semantic", cases_run: 1, cases_passed: 0 },
  ],
  scorecard: null,
  cases: [
    {
      case_id: JSON_CASE.case_id,
      comparison: "exact",
      run_id: "a1000000-0000-4000-8000-000000000101",
      evaluation_id: "e1000000-0000-4000-8000-000000000101",
      passed: true,
      run_failure: false,
      score: 1,
      reason: "It matched.",
      judge_calls: 0,
      judge_cost_usd: 0,
    },
    {
      case_id: RUN_CASE.case_id,
      comparison: "semantic",
      run_id: "a1000000-0000-4000-8000-000000000102",
      evaluation_id: "e1000000-0000-4000-8000-000000000102",
      passed: false,
      run_failure: false,
      score: null,
      reason: null,
      judge_calls: 1,
      judge_cost_usd: 0.0004,
    },
  ],
};

/** One workflow run against the benchmark, with every case. */
export const RUN_EXECUTION: BenchmarkExecutionDetail = {
  execution_id: "e0000000-0000-4000-8000-000000000001",
  benchmark_id: BENCHMARK.id,
  benchmark_revision: 2,
  benchmark_digest: BENCHMARK.revision.content_digest,
  kind: "run",
  recorded_at: "2026-11-19T09:00:00Z",
  sensitivity: "restricted",
  case_count: 2,
  scoring_policy: null,
  candidates: [RUN_CANDIDATE],
  command: "azathoth benchmark execution e0000000-0000-4000-8000-000000000001",
};

const SCORECARD: CandidateScorecard = {
  quality_score: 1,
  reliability_score: 1,
  latency_score: 0.8,
  cost_score: 0.7,
  citation_score: null,
  overall_score: 0.91,
  rationale: "Every case passed, a little slowly.",
};

const REVIEW_CANDIDATE: ExecutionCandidate = {
  ...RUN_CANDIDATE,
  candidate_id: "ca000000-0000-4000-8000-000000000002",
  workflow_id: REVIEW_WORKFLOW.id,
  workflow_name: REVIEW_WORKFLOW.name,
  cases_passed: 2,
  accuracy: 1,
  overall_score: 0.91,
  scorecard: SCORECARD,
};

/** Two workflows compared against the benchmark, best first. */
export const COMPARISON: BenchmarkExecutionDetail = {
  ...RUN_EXECUTION,
  execution_id: "e0000000-0000-4000-8000-000000000002",
  kind: "compare",
  recorded_at: "2026-11-19T10:00:00Z",
  scoring_policy: { target_latency_seconds: 5, target_cost_usd: 0.01 },
  candidates: [
    REVIEW_CANDIDATE,
    {
      ...RUN_CANDIDATE,
      overall_score: 0.55,
      scorecard: { ...SCORECARD, overall_score: 0.55, rationale: "Half." },
    },
  ],
  command: "azathoth benchmark execution e0000000-0000-4000-8000-000000000002",
};

/** Returns an execution as its benchmark's list shows it. */
function summaryOf(detail: BenchmarkExecutionDetail): BenchmarkExecutionSummary {
  return {
    execution_id: detail.execution_id,
    benchmark_id: detail.benchmark_id,
    benchmark_revision: detail.benchmark_revision,
    benchmark_digest: detail.benchmark_digest,
    kind: detail.kind,
    recorded_at: detail.recorded_at,
    sensitivity: detail.sensitivity,
    case_count: detail.case_count,
    candidates: detail.candidates.map(
      ({
        candidate_id,
        workflow_id,
        workflow_name,
        workflow_revision,
        cases_run,
        cases_passed,
        accuracy,
        overall_score,
      }) => ({
        candidate_id,
        workflow_id,
        workflow_name,
        workflow_revision,
        cases_run,
        cases_passed,
        accuracy,
        overall_score,
      }),
    ),
    command: detail.command,
  };
}

/** The benchmark's executions, newest first. */
export const EXECUTIONS: readonly BenchmarkExecutionSummary[] = [
  summaryOf(COMPARISON),
  summaryOf(RUN_EXECUTION),
];

/** What a live run of the benchmark tells, case by case. */
export const CASE_EVENTS: readonly BenchmarkEvent[] = [
  {
    type: "case_started",
    case_id: JSON_CASE.case_id,
    workflow_id: WORKFLOW.id,
    index: 1,
    total: 2,
  },
  {
    type: "case_finished",
    case_id: JSON_CASE.case_id,
    workflow_id: WORKFLOW.id,
    run_id: "a1000000-0000-4000-8000-000000000101",
    passed: true,
    score: 1,
  },
  { type: "case_started", case_id: RUN_CASE.case_id, workflow_id: WORKFLOW.id, index: 2, total: 2 },
  {
    type: "case_finished",
    case_id: RUN_CASE.case_id,
    workflow_id: WORKFLOW.id,
    run_id: "a1000000-0000-4000-8000-000000000102",
    passed: false,
    score: 0.2,
  },
];

/** A run of the benchmark, just started from the editor. */
export const LIVE_BENCHMARK: LiveRun = {
  ...LIVE_RUN,
  handle: "b3nch",
  kind: "benchmark",
  benchmark_id: BENCHMARK.id,
};

/** A comparison against the benchmark, just started from the editor. */
export const LIVE_COMPARISON: LiveRun = {
  ...LIVE_BENCHMARK,
  handle: "c0mpare",
  kind: "comparison",
};
