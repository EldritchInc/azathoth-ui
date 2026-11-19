/**
 * Optimization as the editor's server describes it: a workflow's experiments,
 * one read with its candidates ranked, a comparison of its winner with what
 * production runs and what that would save, whether the winner can still be
 * promoted, and a live optimization with its events (ADR 0013).
 */

import type {
  ExperimentCandidate,
  ExperimentComparison,
  ExperimentDetail,
  ExperimentSummary,
  LiveRun,
  OptimizationEvent,
  OptimizationSummary,
  Promotability,
} from "../api/types";
import { BENCHMARK, WORKFLOW } from "./instances";
import { LIVE_RUN } from "./runs";

const STEP_ID = "d1000000-0000-4000-8000-000000000001";

const CONFIGURED_STRATEGY = "57000000-0000-4000-8000-000000000001";

const CHEAPER_STRATEGY = "57000000-0000-4000-8000-000000000002";

const FIRST_CASE = "c1000000-0000-4000-8000-000000000001";

const SECOND_CASE = "c1000000-0000-4000-8000-000000000002";

/** The experiment that holds the session's winner. */
export const EXPERIMENT_ID = "e5000000-0000-4000-8000-000000000002";

/** An earlier generation's experiment. */
export const EARLIER_EXPERIMENT_ID = "e5000000-0000-4000-8000-000000000001";

const HEADER = {
  experiment_id: EXPERIMENT_ID,
  workflow_id: WORKFLOW.id,
  workflow_name: WORKFLOW.name,
  recorded_at: "2026-11-19T12:00:00Z",
  benchmark_id: BENCHMARK.id,
  benchmark_digest: BENCHMARK.revision.content_digest,
  benchmark_revision: 1,
  sensitivity: "internal",
  candidate_count: 2,
  case_count: 2,
  winner_observation_id: "0b000000-0000-4000-8000-000000000002",
  command: `azathoth experiment show ${EXPERIMENT_ID}`,
} as const;

/** The winner: the cheaper model, passing both cases. */
export const WINNER: ExperimentCandidate = {
  observation_id: "0b000000-0000-4000-8000-000000000002",
  rank: 1,
  workflow_revision: 3,
  strategy_ids: [CHEAPER_STRATEGY],
  steps: [{ step_id: STEP_ID, strategy_id: CHEAPER_STRATEGY, model: "openrouter/acme/small" }],
  cases_run: 2,
  cases_passed: 2,
  scorecard: {
    quality_score: 1,
    reliability_score: 1,
    latency_score: 0.9,
    cost_score: 0.95,
    citation_score: null,
    overall_score: 0.96,
    rationale: "Benchmark aggregate across 2 cases.",
  },
  judge_calls: 0,
  judge_cost_usd: 0,
  cases: [
    {
      case_id: FIRST_CASE,
      run_id: "a1000000-0000-4000-8000-000000000201",
      evaluation_id: "e1000000-0000-4000-8000-000000000201",
      passed: true,
      judge_calls: 0,
      judge_cost_usd: 0,
    },
    {
      case_id: SECOND_CASE,
      run_id: "a1000000-0000-4000-8000-000000000202",
      evaluation_id: "e1000000-0000-4000-8000-000000000202",
      passed: true,
      judge_calls: 0,
      judge_cost_usd: 0,
    },
  ],
};

/** The configured candidate, which production runs: the larger model, failing one case. */
export const CONFIGURED: ExperimentCandidate = {
  ...WINNER,
  observation_id: "0b000000-0000-4000-8000-000000000001",
  rank: 2,
  strategy_ids: [CONFIGURED_STRATEGY],
  steps: [{ step_id: STEP_ID, strategy_id: CONFIGURED_STRATEGY, model: "openrouter/acme/large" }],
  cases_passed: 1,
  scorecard: { ...WINNER.scorecard, quality_score: 0.5, overall_score: 0.62 },
  cases: [
    {
      case_id: FIRST_CASE,
      run_id: "a1000000-0000-4000-8000-000000000101",
      evaluation_id: "e1000000-0000-4000-8000-000000000101",
      passed: true,
      judge_calls: 0,
      judge_cost_usd: 0,
    },
    {
      case_id: SECOND_CASE,
      run_id: "a1000000-0000-4000-8000-000000000102",
      evaluation_id: "e1000000-0000-4000-8000-000000000102",
      passed: false,
      judge_calls: 0,
      judge_cost_usd: 0,
    },
  ],
};

/** The experiment, with both candidates ranked. */
export const EXPERIMENT: ExperimentDetail = { ...HEADER, candidates: [WINNER, CONFIGURED] };

/** The workflow's experiments, newest first. */
export const EXPERIMENTS: readonly ExperimentSummary[] = [
  { ...HEADER, winner_score: 0.96 },
  {
    ...HEADER,
    experiment_id: EARLIER_EXPERIMENT_ID,
    recorded_at: "2026-11-19T11:00:00Z",
    candidate_count: 1,
    winner_observation_id: CONFIGURED.observation_id,
    winner_score: 0.62,
    command: `azathoth experiment show ${EARLIER_EXPERIMENT_ID}`,
  },
];

/** The winner beside what production runs now, and what promoting it would save. */
export const COMPARED: ExperimentComparison = {
  experiment_id: EXPERIMENT_ID,
  workflow_id: WORKFLOW.id,
  baseline: "production",
  reason: null,
  winner: WINNER,
  baseline_candidate: CONFIGURED,
  steps: [
    {
      step_id: STEP_ID,
      winner_model: "openrouter/acme/small",
      baseline_model: "openrouter/acme/large",
      differs: true,
    },
  ],
  cases: [
    {
      case_id: FIRST_CASE,
      winner_passed: true,
      baseline_passed: true,
      winner_score: 1,
      baseline_score: 1,
    },
    {
      case_id: SECOND_CASE,
      winner_passed: true,
      baseline_passed: false,
      winner_score: 1,
      baseline_score: null,
    },
  ],
  winner_runs: { runs: 2, cost_usd: 0.01, latency_seconds: 2.5 },
  baseline_runs: { runs: 2, cost_usd: 0.05, latency_seconds: 5 },
  command: `azathoth workflow promote ${WORKFLOW.id} --experiment ${EXPERIMENT_ID}`,
  savings: { cost_usd: 0.04, cost_percent: 80, latency_seconds: 2.5, latency_percent: 50 },
  projection: {
    window_days: 30,
    since: "2026-10-20T12:00:00Z",
    invocations: 120,
    cost_usd: 4.8,
    latency_seconds: 300,
  },
};

/** A winner that production already runs: nothing to compare. */
export const NOTHING_COMPARED: ExperimentComparison = {
  ...COMPARED,
  baseline: null,
  reason: "Production already runs the winner.",
  baseline_candidate: null,
  steps: [],
  baseline_runs: null,
  savings: null,
  projection: null,
};

/** The winner can still be promoted. */
export const PROMOTABLE: Promotability = {
  experiment_id: EXPERIMENT_ID,
  workflow_id: WORKFLOW.id,
  promotable: true,
  code: null,
  reason: null,
  command: COMPARED.command,
};

/** The winner was measured on an earlier revision, so it cannot be rebuilt. */
export const NOT_PROMOTABLE: Promotability = {
  ...PROMOTABLE,
  promotable: false,
  code: "candidate_rebuild",
  reason: `The candidate was measured on revision 3 of workflow ${WORKFLOW.id}, but its current revision is 4.`,
};

/** A two-generation session's summary. */
export const SESSION: OptimizationSummary = {
  workflow_id: WORKFLOW.id,
  benchmark_id: BENCHMARK.id,
  generations: [
    {
      generation: 1,
      experiment_id: EARLIER_EXPERIMENT_ID,
      winner_strategy_ids: [CONFIGURED_STRATEGY],
      winner_score: 0.62,
      proposed: 2,
    },
  ],
  final_experiment_id: EXPERIMENT_ID,
  final_skipped: null,
  winning_experiment_id: EXPERIMENT_ID,
  judge_calls: 0,
  judge_cost_usd: 0,
  command: `azathoth experiment show ${EXPERIMENT_ID}`,
};

/** What that session tells as it runs: one generation, then the final evaluation. */
export const OPTIMIZATION_EVENTS: readonly OptimizationEvent[] = [
  { type: "generation_started", generation: 1, candidates: 1, final: false },
  {
    type: "candidate_finished",
    generation: 1,
    workflow_id: WORKFLOW.id,
    strategy_ids: [CONFIGURED_STRATEGY],
    cases_run: 2,
    cases_passed: 1,
    overall_score: 0.62,
  },
  {
    type: "generation_finished",
    generation: 1,
    experiment_id: EARLIER_EXPERIMENT_ID,
    winner_strategy_ids: [CONFIGURED_STRATEGY],
    winner_score: 0.62,
    proposed: 2,
  },
  { type: "generation_started", generation: 2, candidates: 2, final: true },
  {
    type: "candidate_finished",
    generation: 2,
    workflow_id: WORKFLOW.id,
    strategy_ids: [CONFIGURED_STRATEGY],
    cases_run: 2,
    cases_passed: 1,
    overall_score: 0.62,
  },
  {
    type: "candidate_finished",
    generation: 2,
    workflow_id: WORKFLOW.id,
    strategy_ids: [CHEAPER_STRATEGY],
    cases_run: 2,
    cases_passed: 2,
    overall_score: 0.96,
  },
  {
    type: "generation_finished",
    generation: 2,
    experiment_id: EXPERIMENT_ID,
    winner_strategy_ids: [CHEAPER_STRATEGY],
    winner_score: 0.96,
    proposed: 0,
  },
];

/** An optimization, just started from the editor. */
export const LIVE_OPTIMIZATION: LiveRun = {
  ...LIVE_RUN,
  handle: "0pt1m",
  kind: "optimization",
  benchmark_id: BENCHMARK.id,
};
