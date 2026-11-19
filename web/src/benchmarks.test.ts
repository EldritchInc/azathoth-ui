import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addBenchmarkCase,
  createBenchmark,
  editBenchmarkCase,
  fetchBenchmarkCase,
  fetchBenchmarkCases,
  fetchBenchmarkExecution,
  fetchBenchmarkExecutions,
  removeBenchmarkCase,
  startBenchmarkRun,
  startComparison,
} from "./api/client";
import {
  isBenchmarkCaseChange,
  isBenchmarkCaseDetail,
  isBenchmarkCaseSummary,
  isBenchmarkEvent,
  isBenchmarkExecutionDetail,
  isBenchmarkExecutionSummary,
  isLiveRun,
  isRunEvent,
} from "./api/types";
import {
  queryKeys,
  useAddBenchmarkCase,
  useCreateBenchmark,
  useStartBenchmarkRun,
} from "./queries";
import { LOCAL_SCOPE, scoped } from "./scope";
import {
  ADDED,
  CASE_EVENTS,
  CASES,
  COMPARISON,
  EXECUTIONS,
  JSON_CASE,
  JSON_CASE_DETAIL,
  LIVE_BENCHMARK,
  LIVE_COMPARISON,
  RUN_CASE_DETAIL,
  RUN_EXECUTION,
} from "./test/benchmarks";
import { BENCHMARK_DETAIL } from "./test/documents";
import { BENCHMARK, REVIEW_WORKFLOW, WORKFLOW, urlOf } from "./test/instances";
import { LIVE_RUN, RUN_EVENTS, RUN_SUMMARY } from "./test/runs";

const STAGING = "/api/remotes/staging";
const BENCHMARK_PATH = `/api/benchmarks/${BENCHMARK.id}`;

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

describe("a benchmark's values", () => {
  it("are read as the server writes them", () => {
    expect(CASES.every(isBenchmarkCaseSummary)).toBe(true);
    expect([JSON_CASE_DETAIL, RUN_CASE_DETAIL].every(isBenchmarkCaseDetail)).toBe(true);
    expect(isBenchmarkCaseChange(ADDED)).toBe(true);
    expect(EXECUTIONS.every(isBenchmarkExecutionSummary)).toBe(true);
    expect([RUN_EXECUTION, COMPARISON].every(isBenchmarkExecutionDetail)).toBe(true);
    expect(CASE_EVENTS.every(isBenchmarkEvent)).toBe(true);
    expect([LIVE_BENCHMARK, LIVE_COMPARISON].every(isLiveRun)).toBe(true);
  });

  it("keep a run's events and a benchmark's apart", () => {
    expect(CASE_EVENTS.some(isRunEvent)).toBe(false);
    expect(RUN_EVENTS.some(isBenchmarkEvent)).toBe(false);
  });

  it("say which benchmark a live run runs, or that it runs none", () => {
    expect(isLiveRun({ ...LIVE_RUN, benchmark_id: undefined })).toBe(false);
    expect(isLiveRun({ ...LIVE_BENCHMARK, benchmark_id: 7 })).toBe(false);
    expect(isLiveRun({ ...LIVE_BENCHMARK, kind: "benchmarks" })).toBe(false);
  });

  it("are refused when they are not what the server writes", () => {
    expect(isBenchmarkCaseSummary({ ...JSON_CASE, comparison: "fuzzy" })).toBe(false);
    expect(isBenchmarkCaseSummary({ ...JSON_CASE, source: "pdf" })).toBe(false);
    expect(isBenchmarkCaseSummary({ ...JSON_CASE, revision: 0 })).toBe(false);
    expect(isBenchmarkCaseDetail({ ...JSON_CASE_DETAIL, expected: undefined })).toBe(false);
    expect(
      isBenchmarkCaseDetail({
        ...RUN_CASE_DETAIL,
        citations: { require: [{ source: "report" }], on_unverified: "fail" },
      }),
    ).toBe(false);
    expect(
      isBenchmarkCaseDetail({
        ...RUN_CASE_DETAIL,
        citations: { require: [], on_unverified: "warn" },
      }),
    ).toBe(false);
    expect(isBenchmarkCaseChange({ case: RUN_CASE_DETAIL })).toBe(false);
    expect(isBenchmarkExecutionSummary({ ...EXECUTIONS[0], kind: "trial" })).toBe(false);
    expect(
      isBenchmarkExecutionDetail({ ...COMPARISON, scoring_policy: { target_cost_usd: 1 } }),
    ).toBe(false);
    expect(isBenchmarkEvent({ ...CASE_EVENTS[0], index: 0 })).toBe(false);
    expect(isBenchmarkEvent({ ...CASE_EVENTS[1], passed: "yes" })).toBe(false);
  });
});

describe("a benchmark's cases", () => {
  it("are listed and read, at a revision when one is asked for", async () => {
    const listing = answering(200, { items: CASES });
    const reading = answering(200, JSON_CASE_DETAIL);

    expect(await fetchBenchmarkCases(BENCHMARK.id, null, { fetcher: listing.fetcher })).toEqual(
      CASES,
    );
    await fetchBenchmarkCases(BENCHMARK.id, 1, { fetcher: listing.fetcher, base: STAGING });
    expect(
      await fetchBenchmarkCase(BENCHMARK.id, JSON_CASE.case_id, null, { fetcher: reading.fetcher }),
    ).toEqual(JSON_CASE_DETAIL);
    await fetchBenchmarkCase(BENCHMARK.id, JSON_CASE.case_id, 2, { fetcher: reading.fetcher });

    expect([...listing.asked, ...reading.asked].map((asked) => asked.path)).toEqual([
      `${BENCHMARK_PATH}/cases`,
      `${STAGING}/benchmarks/${BENCHMARK.id}/cases?revision=1`,
      `${BENCHMARK_PATH}/cases/${JSON_CASE.case_id}`,
      `${BENCHMARK_PATH}/cases/${JSON_CASE.case_id}?revision=2`,
    ]);
  });

  it("are added from JSON, a file or a run, sending only what is given", async () => {
    const adding = answering(201, ADDED);
    const file = { media_type: "text/plain", content: "aGk=" };

    expect(
      await addBenchmarkCase(
        BENCHMARK.id,
        {
          from: { kind: "json", value: "one two" },
          comparison: "exact",
          expected: 2,
          description: "Two words.",
        },
        { fetcher: adding.fetcher },
      ),
    ).toEqual(ADDED);
    await addBenchmarkCase(
      BENCHMARK.id,
      { from: { kind: "file", file }, comparison: "normalized", expected: null },
      { fetcher: adding.fetcher },
    );
    await addBenchmarkCase(
      BENCHMARK.id,
      {
        from: { kind: "run", runId: RUN_SUMMARY.run_id },
        comparison: "semantic",
        citations: RUN_CASE_DETAIL.citations,
        sensitivity: "restricted",
      },
      { fetcher: adding.fetcher },
    );

    expect(adding.asked.map((asked) => asked.body)).toEqual([
      { input: "one two", comparison: "exact", expected: 2, description: "Two words." },
      { file, comparison: "normalized", expected: null },
      {
        run_id: RUN_SUMMARY.run_id,
        comparison: "semantic",
        citations: RUN_CASE_DETAIL.citations,
        sensitivity: "restricted",
      },
    ]);
    expect(adding.asked.every((asked) => asked.path === `${BENCHMARK_PATH}/cases`)).toBe(true);
  });

  it("are edited with only what changes, and a null that clears citations", async () => {
    const editing = answering(200, ADDED);
    const path = `${BENCHMARK_PATH}/cases/${RUN_CASE_DETAIL.case_id}`;

    await editBenchmarkCase(
      BENCHMARK.id,
      RUN_CASE_DETAIL.case_id,
      { expected: { summary: "Fire." } },
      { fetcher: editing.fetcher },
    );
    await editBenchmarkCase(
      BENCHMARK.id,
      RUN_CASE_DETAIL.case_id,
      { citations: null, comparison: "exact", description: "Exactly.", sensitivity: "internal" },
      { fetcher: editing.fetcher },
    );
    await editBenchmarkCase(
      BENCHMARK.id,
      RUN_CASE_DETAIL.case_id,
      { expected: null },
      {
        fetcher: editing.fetcher,
      },
    );

    expect(editing.asked).toEqual([
      { method: "POST", path, body: { expected: { summary: "Fire." } } },
      {
        method: "POST",
        path,
        body: {
          citations: null,
          comparison: "exact",
          description: "Exactly.",
          sensitivity: "internal",
        },
      },
      { method: "POST", path, body: { expected: null } },
    ]);
  });

  it("are removed, sending nothing", async () => {
    const removing = answering(200, ADDED);

    expect(
      await removeBenchmarkCase(BENCHMARK.id, JSON_CASE.case_id, { fetcher: removing.fetcher }),
    ).toEqual(ADDED);
    expect(removing.asked).toEqual([
      { method: "POST", path: `${BENCHMARK_PATH}/cases/${JSON_CASE.case_id}/remove`, body: {} },
    ]);
  });

  it("pass on what Azathoth refuses, and refuse what is not a change", async () => {
    const refusing = answering(409, {
      error: { code: "conflict", message: "The benchmark already holds this case." },
    });
    const wrong = answering(201, { case: JSON_CASE_DETAIL });
    const given = { from: { kind: "json", value: 1 }, comparison: "exact", expected: 1 } as const;

    await expect(
      addBenchmarkCase(BENCHMARK.id, given, { fetcher: refusing.fetcher }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(
      addBenchmarkCase(BENCHMARK.id, given, { fetcher: wrong.fetcher }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("a new benchmark", () => {
  it("is created with its name and description, and a version when one is given", async () => {
    const creating = answering(201, { created: true, benchmark: BENCHMARK_DETAIL });

    expect(
      await createBenchmark(
        { name: "word count", description: "Count the words in a text." },
        { fetcher: creating.fetcher },
      ),
    ).toEqual({ created: true, detail: BENCHMARK_DETAIL });
    await createBenchmark(
      { name: "word count", description: "Count.", version: "2.0.0" },
      { fetcher: creating.fetcher },
    );

    expect(creating.asked).toEqual([
      {
        method: "POST",
        path: "/api/benchmarks",
        body: { name: "word count", description: "Count the words in a text." },
      },
      {
        method: "POST",
        path: "/api/benchmarks",
        body: { name: "word count", description: "Count.", version: "2.0.0" },
      },
    ]);
  });
});

describe("a benchmark's executions", () => {
  it("are listed, newest first, at most so many", async () => {
    const listing = answering(200, { items: EXECUTIONS });

    expect(await fetchBenchmarkExecutions(BENCHMARK.id, { fetcher: listing.fetcher })).toEqual(
      EXECUTIONS,
    );
    expect(listing.asked[0]?.path).toBe(`${BENCHMARK_PATH}/executions?limit=20`);
  });

  it("are read one at a time, with every workflow and case", async () => {
    const reading = answering(200, COMPARISON);

    expect(
      await fetchBenchmarkExecution(COMPARISON.execution_id, {
        fetcher: reading.fetcher,
        base: STAGING,
      }),
    ).toEqual(COMPARISON);
    expect(reading.asked[0]?.path).toBe(
      `${STAGING}/benchmark-executions/${COMPARISON.execution_id}`,
    );
  });

  it("are run and compared live", async () => {
    const running = answering(201, LIVE_BENCHMARK);
    const comparing = answering(201, LIVE_COMPARISON);

    expect(
      await startBenchmarkRun(
        { benchmarkId: BENCHMARK.id, workflowId: WORKFLOW.id },
        { fetcher: running.fetcher },
      ),
    ).toEqual(LIVE_BENCHMARK);
    expect(
      await startComparison(
        {
          benchmarkId: BENCHMARK.id,
          workflowIds: [WORKFLOW.id, REVIEW_WORKFLOW.id],
          targetLatencySeconds: 5,
          targetCostUsd: 0.01,
        },
        { fetcher: comparing.fetcher },
      ),
    ).toEqual(LIVE_COMPARISON);

    expect([...running.asked, ...comparing.asked]).toEqual([
      {
        method: "POST",
        path: "/api/live/benchmarks",
        body: { benchmark_id: BENCHMARK.id, workflow_id: WORKFLOW.id },
      },
      {
        method: "POST",
        path: "/api/live/comparisons",
        body: {
          benchmark_id: BENCHMARK.id,
          workflow_ids: [WORKFLOW.id, REVIEW_WORKFLOW.id],
          target_latency_seconds: 5,
          target_cost_usd: 0.01,
        },
      },
    ]);
  });
});

describe("a benchmark's queries", () => {
  it("keep its cases with benchmarks, and its executions apart", () => {
    const benchmarks = queryKeys.list("benchmarks").slice(0, 1);

    expect(queryKeys.benchmarkCases("b", null).slice(0, 1)).toEqual(benchmarks);
    expect(queryKeys.benchmarkCase("b", "c", 2).slice(0, 1)).toEqual(benchmarks);
    expect(queryKeys.benchmarkExecutions("b").slice(0, 1)).toEqual(queryKeys.executions);
    expect(queryKeys.execution("e").slice(0, 1)).toEqual(queryKeys.executions);
  });

  it("fetch every benchmark again once one is created", async () => {
    vi.stubGlobal("fetch", answering(201, { created: true, benchmark: BENCHMARK_DETAIL }).fetcher);
    const { client, wrapper } = withClient();
    const kept = [queryKeys.list("benchmarks"), queryKeys.list("workflows")];

    for (const key of kept) {
      client.setQueryData(scoped(LOCAL_SCOPE, key), []);
    }
    const { result } = renderHook(() => useCreateBenchmark(), { wrapper });

    await result.current.mutateAsync({ name: "word count", description: "Count." });
    expect(kept.map((key) => invalidated(client, key))).toEqual([true, false]);
  });

  it("fetch the benchmark and its cases again once a case is added", async () => {
    vi.stubGlobal("fetch", answering(201, ADDED).fetcher);
    const { client, wrapper } = withClient();
    const kept = [
      queryKeys.benchmarkCases(BENCHMARK.id, null),
      queryKeys.list("benchmarks"),
      queryKeys.benchmarkExecutions(BENCHMARK.id),
    ];

    for (const key of kept) {
      client.setQueryData(scoped(LOCAL_SCOPE, key), []);
    }
    const { result } = renderHook(() => useAddBenchmarkCase(BENCHMARK.id), { wrapper });

    expect(
      await result.current.mutateAsync({
        from: { kind: "json", value: 1 },
        comparison: "exact",
        expected: 1,
      }),
    ).toEqual(ADDED);
    expect(kept.map((key) => invalidated(client, key))).toEqual([true, true, false]);
  });

  it("keep a started run of the benchmark as a live run", async () => {
    vi.stubGlobal("fetch", answering(201, LIVE_BENCHMARK).fetcher);
    const { client, wrapper } = withClient();

    client.setQueryData(scoped(LOCAL_SCOPE, queryKeys.liveList), []);
    const { result } = renderHook(() => useStartBenchmarkRun(), { wrapper });

    await result.current.mutateAsync({ benchmarkId: BENCHMARK.id, workflowId: WORKFLOW.id });
    expect(
      client.getQueryData(scoped(LOCAL_SCOPE, queryKeys.liveRun(LIVE_BENCHMARK.handle))),
    ).toEqual(LIVE_BENCHMARK);
    expect(invalidated(client, queryKeys.liveList)).toBe(true);
  });
});
