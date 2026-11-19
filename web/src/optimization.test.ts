import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchComparison,
  fetchExperiment,
  fetchPromotability,
  fetchWorkflowExperiments,
  startOptimization,
} from "./api/client";
import {
  isExperimentComparison,
  isExperimentDetail,
  isExperimentSummary,
  isLiveRun,
  isOptimizationEvent,
  isOptimizationSummary,
  isPromotability,
  isRunEvent,
  isBenchmarkEvent,
} from "./api/types";
import { queryKeys, useProductionChange, useStartOptimization } from "./queries";
import { LOCAL_SCOPE, scoped } from "./scope";
import { BENCHMARK, WORKFLOW, urlOf } from "./test/instances";
import {
  COMPARED,
  EXPERIMENT,
  EXPERIMENT_ID,
  EXPERIMENTS,
  LIVE_OPTIMIZATION,
  NOT_PROMOTABLE,
  NOTHING_COMPARED,
  OPTIMIZATION_EVENTS,
  PROMOTABLE,
  SESSION,
  WINNER,
} from "./test/optimization";
import { RUN_EVENTS } from "./test/runs";

const STAGING = "/api/remotes/staging";

interface Asked {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

/** Returns a fetch that answers every request with one body, and what each request asked. */
function answering(status: number, body: unknown): { fetcher: typeof fetch; asked: Asked[] } {
  const asked: Asked[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const url = urlOf(input);

    asked.push({
      method: init?.method ?? "GET",
      path: `${url.pathname}${url.search}`,
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null,
    });

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  return { fetcher, asked };
}

/** Returns a query client, and a wrapper that gives it to a hook acting on the local instance. */
function withClient(): {
  client: QueryClient;
  wrapper: (props: { readonly children: ReactNode }) => ReactNode;
} {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

  return { client, wrapper };
}

/** Returns whether what is kept under a local key has been marked to fetch again. */
function invalidated(client: QueryClient, key: readonly unknown[]): boolean {
  return client.getQueryState(scoped(LOCAL_SCOPE, key))?.isInvalidated === true;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("optimization's values", () => {
  it("are read as the server writes them", () => {
    expect(EXPERIMENTS.every(isExperimentSummary)).toBe(true);
    expect(isExperimentDetail(EXPERIMENT)).toBe(true);
    expect([COMPARED, NOTHING_COMPARED].every(isExperimentComparison)).toBe(true);
    expect([PROMOTABLE, NOT_PROMOTABLE].every(isPromotability)).toBe(true);
    expect(isOptimizationSummary(SESSION)).toBe(true);
    expect(OPTIMIZATION_EVENTS.every(isOptimizationEvent)).toBe(true);
    expect(isLiveRun(LIVE_OPTIMIZATION)).toBe(true);
  });

  it("keep an optimization's events apart from a run's and a benchmark's", () => {
    expect(OPTIMIZATION_EVENTS.some(isRunEvent)).toBe(false);
    expect(OPTIMIZATION_EVENTS.some(isBenchmarkEvent)).toBe(false);
    expect(RUN_EVENTS.some(isOptimizationEvent)).toBe(false);
  });

  it("read what a legacy experiment lacks as null", () => {
    const legacy = {
      ...EXPERIMENT,
      benchmark_id: null,
      benchmark_digest: null,
      benchmark_revision: null,
      candidates: [
        {
          ...WINNER,
          workflow_revision: null,
          steps: [],
          cases_passed: null,
          cases: [{ ...WINNER.cases[0], case_id: null, passed: null }],
        },
      ],
    };

    expect(isExperimentDetail(legacy)).toBe(true);
  });

  it("are refused when they are not what the server writes", () => {
    expect(isExperimentSummary({ ...EXPERIMENTS[0], winner_score: "0.9" })).toBe(false);
    expect(isExperimentDetail({ ...EXPERIMENT, candidates: [{ ...WINNER, rank: 0 }] })).toBe(false);
    expect(isExperimentComparison({ ...COMPARED, baseline: "previous" })).toBe(false);
    expect(
      isExperimentComparison({ ...COMPARED, savings: { ...COMPARED.savings, cost_usd: "4" } }),
    ).toBe(false);
    expect(isExperimentComparison({ ...COMPARED, projection: { invocations: 3 } })).toBe(false);
    expect(isPromotability({ ...PROMOTABLE, promotable: "yes" })).toBe(false);
    expect(isOptimizationSummary({ ...SESSION, generations: [] })).toBe(false);
    expect(isOptimizationEvent({ ...OPTIMIZATION_EVENTS[0], generation: 0 })).toBe(false);
    expect(isOptimizationEvent({ type: "generation_finished", generation: 1 })).toBe(false);
  });
});

describe("experiments' calls", () => {
  it("list a workflow's experiments, newest first, at most so many", async () => {
    const listing = answering(200, { items: EXPERIMENTS });

    expect(await fetchWorkflowExperiments(WORKFLOW.id, { fetcher: listing.fetcher })).toEqual(
      EXPERIMENTS,
    );
    expect(listing.asked[0]?.path).toBe(`/api/workflows/${WORKFLOW.id}/experiments?limit=20`);
  });

  it("read one, its comparison and whether its winner can be promoted, on any instance", async () => {
    const reading = answering(200, EXPERIMENT);
    const comparing = answering(200, COMPARED);
    const checking = answering(200, NOT_PROMOTABLE);

    expect(await fetchExperiment(EXPERIMENT_ID, { fetcher: reading.fetcher })).toEqual(EXPERIMENT);
    expect(
      await fetchComparison(EXPERIMENT_ID, { fetcher: comparing.fetcher, base: STAGING }),
    ).toEqual(COMPARED);
    expect(await fetchPromotability(EXPERIMENT_ID, { fetcher: checking.fetcher })).toEqual(
      NOT_PROMOTABLE,
    );
    expect(
      [...reading.asked, ...comparing.asked, ...checking.asked].map((asked) => asked.path),
    ).toEqual([
      `/api/experiments/${EXPERIMENT_ID}`,
      `${STAGING}/experiments/${EXPERIMENT_ID}/compare`,
      `/api/experiments/${EXPERIMENT_ID}/promotable`,
    ]);
  });

  it("refuse an answer that is not what was asked for", async () => {
    await expect(
      fetchComparison(EXPERIMENT_ID, { fetcher: answering(200, EXPERIMENT).fetcher }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("start an optimization live, with its targets and generations", async () => {
    const starting = answering(201, LIVE_OPTIMIZATION);

    expect(
      await startOptimization(
        {
          workflowId: WORKFLOW.id,
          benchmarkId: BENCHMARK.id,
          targetLatencySeconds: 5,
          targetCostUsd: 0.01,
          generations: 2,
        },
        { fetcher: starting.fetcher },
      ),
    ).toEqual(LIVE_OPTIMIZATION);
    expect(starting.asked).toEqual([
      {
        method: "POST",
        path: "/api/live/optimizations",
        body: {
          workflow_id: WORKFLOW.id,
          benchmark_id: BENCHMARK.id,
          target_latency_seconds: 5,
          target_cost_usd: 0.01,
          generations: 2,
        },
      },
    ]);
  });
});

describe("experiments' queries", () => {
  it("keep every experiment's view under one key", () => {
    const experiments = queryKeys.experiments;

    expect(queryKeys.workflowExperiments("w").slice(0, 1)).toEqual(experiments);
    expect(queryKeys.experiment("e").slice(0, 1)).toEqual(experiments);
    expect(queryKeys.comparison("e").slice(0, 1)).toEqual(experiments);
    expect(queryKeys.promotability("e").slice(0, 1)).toEqual(experiments);
  });

  it("keep a started optimization as a live run", async () => {
    vi.stubGlobal("fetch", answering(201, LIVE_OPTIMIZATION).fetcher);
    const { client, wrapper } = withClient();

    client.setQueryData(scoped(LOCAL_SCOPE, queryKeys.liveList), []);
    const { result } = renderHook(() => useStartOptimization(), { wrapper });

    await result.current.mutateAsync({
      workflowId: WORKFLOW.id,
      benchmarkId: BENCHMARK.id,
      targetLatencySeconds: 5,
      targetCostUsd: 0.01,
      generations: 1,
    });
    expect(
      client.getQueryData(scoped(LOCAL_SCOPE, queryKeys.liveRun(LIVE_OPTIMIZATION.handle))),
    ).toEqual(LIVE_OPTIMIZATION);
    expect(invalidated(client, queryKeys.liveList)).toBe(true);
  });

  it("compare and check every experiment again once production changes", async () => {
    vi.stubGlobal("fetch", answering(201, { revision_id: "r" }).fetcher);
    const { client, wrapper } = withClient();
    const kept = [queryKeys.comparison(EXPERIMENT_ID), queryKeys.promotability(EXPERIMENT_ID)];

    for (const key of kept) {
      client.setQueryData(scoped(LOCAL_SCOPE, key), {});
    }
    const { result } = renderHook(() => useProductionChange(WORKFLOW.id), { wrapper });

    await result.current
      .mutateAsync({ promote: true, experimentId: EXPERIMENT_ID })
      .catch(() => undefined);
    expect(kept.map((key) => invalidated(client, key))).toEqual([true, true]);
  });
});
