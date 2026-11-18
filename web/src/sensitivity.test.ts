import { describe, expect, it } from "vitest";

import {
  declareModelPolicy,
  fetchReadiness,
  matchModels,
  startBody,
  startInvocation,
  startRun,
  startTrial,
} from "./api/client";
import {
  isBenchmarkSummary,
  isLiveRun,
  isPortfolioEntry,
  isRunDetail,
  isRunSummary,
  isSensitivity,
} from "./api/types";
import { queryKeys } from "./queries";
import { BENCHMARK, LARGE_ENTRY, LARGE_MODEL, WORKFLOW, urlOf } from "./test/instances";
import { DECLARED_ENTRY, RESTRICTED_RUN } from "./test/sensitivity";
import { LIVE_RUN, READY, RUN_DETAIL, RUN_SUMMARY, SUMMARIZE } from "./test/runs";

interface Asked {
  readonly path: string;
  readonly body: unknown;
}

/** Returns a fetch that answers every request with one body, and what each request sent. */
function answering(status: number, body: unknown): { fetcher: typeof fetch; asked: Asked[] } {
  const asked: Asked[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const url = urlOf(input);

    asked.push({
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

describe("labels, as the server writes them", () => {
  it("are Azathoth's three, and nothing else", () => {
    expect(["public", "internal", "restricted"].every(isSensitivity)).toBe(true);
    expect(isSensitivity("secret")).toBe(false);
    expect(isSensitivity(null)).toBe(false);
  });

  it("are read on runs, live runs, benchmarks and the portfolio's entries", () => {
    expect(isRunSummary(RUN_SUMMARY)).toBe(true);
    expect(isRunDetail(RUN_DETAIL)).toBe(true);
    expect(isRunDetail(RESTRICTED_RUN)).toBe(true);
    expect(isLiveRun(LIVE_RUN)).toBe(true);
    expect(isLiveRun({ ...LIVE_RUN, sensitivity: "restricted" })).toBe(true);
    expect(isBenchmarkSummary(BENCHMARK)).toBe(true);
    expect(isPortfolioEntry(LARGE_ENTRY)).toBe(true);
    expect(isPortfolioEntry(DECLARED_ENTRY)).toBe(true);
  });

  it("are refused when they are not Azathoth's", () => {
    expect(isRunSummary({ ...RUN_SUMMARY, sensitivity: "secret" })).toBe(false);
    expect(isLiveRun({ ...LIVE_RUN, sensitivity: "secret" })).toBe(false);
    expect(isBenchmarkSummary({ ...BENCHMARK, sensitivity: null })).toBe(false);
    expect(
      isPortfolioEntry({
        ...DECLARED_ENTRY,
        data_policy: { retains_data: "maybe", trains_on_data: "no" },
      }),
    ).toBe(false);
    expect(isPortfolioEntry({ ...DECLARED_ENTRY, receives_restricted: "yes" })).toBe(false);
    expect(isPortfolioEntry({ ...DECLARED_ENTRY, policy_declared_by: { email: null } })).toBe(
      false,
    );
  });
});

describe("a label, as the editor sends it", () => {
  it("goes with a start only when one is chosen", () => {
    expect(startBody("w", { kind: "json", value: "x" }, "restricted")).toEqual({
      workflow_id: "w",
      input: "x",
      sensitivity: "restricted",
    });
    expect(startBody("w", { kind: "json", value: "x" }, null)).toEqual({
      workflow_id: "w",
      input: "x",
    });
  });

  it("goes with a run, a tried step and an invocation", async () => {
    const run = answering(201, LIVE_RUN);

    await startRun(
      { workflowId: WORKFLOW.id, given: { kind: "json", value: "x" }, sensitivity: "public" },
      { fetcher: run.fetcher },
    );
    await startRun(
      { workflowId: WORKFLOW.id, given: { kind: "json", value: "x" } },
      { fetcher: run.fetcher },
    );
    await startTrial(
      { document: {}, step_id: SUMMARIZE, inputs: {}, files: {}, sensitivity: "restricted" },
      { fetcher: run.fetcher },
    );
    await startInvocation(
      {
        workflowId: WORKFLOW.id,
        given: { kind: "json", value: "x" },
        idempotencyKey: "k",
        sensitivity: "internal",
      },
      { fetcher: run.fetcher },
    );

    expect(run.asked).toEqual([
      {
        path: "/api/live/runs",
        body: { workflow_id: WORKFLOW.id, input: "x", sensitivity: "public" },
      },
      { path: "/api/live/runs", body: { workflow_id: WORKFLOW.id, input: "x" } },
      {
        path: "/api/live/steps",
        body: {
          document: {},
          step_id: SUMMARIZE,
          inputs: {},
          files: {},
          sensitivity: "restricted",
        },
      },
      {
        path: "/api/live/invocations",
        body: {
          workflow_id: WORKFLOW.id,
          input: "x",
          sensitivity: "internal",
          idempotency_key: "k",
        },
      },
    ]);
  });

  it("asks readiness and matching for that label", async () => {
    const ready = answering(200, READY);
    const matched = answering(200, { items: [LARGE_MODEL] });

    await fetchReadiness({ steps: [] }, { fetcher: ready.fetcher }, "restricted");
    await fetchReadiness({ steps: [] }, { fetcher: ready.fetcher });
    await matchModels({}, { fetcher: matched.fetcher }, "restricted");
    await matchModels({}, { fetcher: matched.fetcher });

    expect(ready.asked.map((asked) => asked.path)).toEqual([
      "/api/workflows/readiness?sensitivity=restricted",
      "/api/workflows/readiness",
    ]);
    expect(matched.asked.map((asked) => asked.body)).toEqual([
      { requirements: {}, sensitivity: "restricted" },
      { requirements: {} },
    ]);
  });

  it("keeps readiness and matching apart by label", () => {
    expect(queryKeys.readiness("{}", "restricted")).not.toEqual(queryKeys.readiness("{}", null));
    expect(queryKeys.matching("{}", "restricted")).not.toEqual(queryKeys.matching("{}", null));
  });
});

describe("declaring a model's policy", () => {
  it("posts both answers, and answers with the entry and who declared it", async () => {
    const declared = answering(200, DECLARED_ENTRY);

    expect(
      await declareModelPolicy(
        LARGE_MODEL.identifier,
        { retains_data: "no", trains_on_data: "no" },
        { fetcher: declared.fetcher, base: "/api/remotes/staging" },
      ),
    ).toEqual(DECLARED_ENTRY);
    expect(declared.asked).toEqual([
      {
        path: "/api/remotes/staging/local/portfolio/policy",
        body: { identifier: LARGE_MODEL.identifier, retains_data: "no", trains_on_data: "no" },
      },
    ]);
  });

  it("refuses an answer that is not an entry", async () => {
    const { fetcher } = answering(200, { identifier: LARGE_MODEL.identifier });

    await expect(
      declareModelPolicy(
        LARGE_MODEL.identifier,
        { retains_data: "no", trains_on_data: "no" },
        { fetcher },
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
