import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  addJudge,
  fetchInterruptedRuns,
  fetchInvocationAnnotations,
  fetchJudges,
  fetchRunAnnotations,
  fetchRunChildren,
  fetchRunFeedback,
  recordFeedback,
  removeJudge,
  resumeRun,
} from "./api/client";
import {
  isAnnotations,
  isInterruptedRun,
  isJudgeSummary,
  isLiveRun,
  isRunChildSummary,
  isRunDetail,
  isRunFeedback,
  isRunSummary,
} from "./api/types";
import { queryKeys, useJudgeChange, useRecordFeedback, useResumeRun } from "./queries";
import { LOCAL_SCOPE, scoped } from "./scope";
import {
  ANNOTATIONS,
  BAD_JUDGMENT,
  CHILDREN,
  GOOD_JUDGMENT,
  INTERRUPTED,
  INTERRUPTED_RUNS,
  JUDGES,
  LARGE_JUDGE,
  RESUMING,
  UNFINISHED_CHILD,
} from "./test/evidence";
import { WORKFLOW, urlOf } from "./test/instances";
import { LIVE_RUN, RUN_DETAIL, RUN_SUMMARY } from "./test/runs";

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

describe("the evidence's values", () => {
  it("are read as the server writes them", () => {
    expect(JUDGES.every(isJudgeSummary)).toBe(true);
    expect([BAD_JUDGMENT, GOOD_JUDGMENT].every(isRunFeedback)).toBe(true);
    expect(isAnnotations(ANNOTATIONS)).toBe(true);
    expect(CHILDREN.every(isRunChildSummary)).toBe(true);
    expect(INTERRUPTED_RUNS.every(isInterruptedRun)).toBe(true);
    expect(isLiveRun(RESUMING)).toBe(true);
  });

  it("carry a run's latest judgment, or none", () => {
    expect(isRunSummary({ ...RUN_SUMMARY, feedback: "bad" })).toBe(true);
    expect(isRunDetail({ ...RUN_DETAIL, feedback: "good" })).toBe(true);
    expect(isRunSummary({ ...RUN_SUMMARY, feedback: "meh" })).toBe(false);
    expect(isRunSummary({ ...RUN_SUMMARY, feedback: undefined })).toBe(false);
  });

  it("say which run a live run resumes, or that it resumes none", () => {
    expect(isLiveRun({ ...LIVE_RUN, resumes_run_id: null })).toBe(true);
    expect(isLiveRun({ ...LIVE_RUN, resumes_run_id: 7 })).toBe(false);
    expect(isLiveRun({ ...LIVE_RUN, resumes_run_id: undefined })).toBe(false);
  });

  it("are refused when they are not what the server writes", () => {
    expect(isJudgeSummary({ ...LARGE_JUDGE, position: 1.5 })).toBe(false);
    expect(isJudgeSummary({ ...LARGE_JUDGE, authorized: "yes" })).toBe(false);
    expect(isRunFeedback({ ...BAD_JUDGMENT, disposition: "ugly" })).toBe(false);
    expect(isRunFeedback({ ...GOOD_JUDGMENT, reason: 3 })).toBe(false);
    expect(isAnnotations({ ...ANNOTATIONS, items: ["a citation"] })).toBe(false);
    expect(isAnnotations({ ...ANNOTATIONS, collection: [] })).toBe(false);
    expect(isRunChildSummary({ ...UNFINISHED_CHILD, status: "running" })).toBe(false);
    expect(isRunChildSummary({ ...UNFINISHED_CHILD, depth: 0 })).toBe(false);
    expect(isInterruptedRun({ ...INTERRUPTED, resumes: -1 })).toBe(false);
    expect(isInterruptedRun({ ...INTERRUPTED, last_recorded_at: null })).toBe(false);
  });
});

describe("the judges' calls", () => {
  it("list the rotation from the instance's endpoint", async () => {
    const listing = answering(200, { items: JUDGES });

    expect(await fetchJudges({ fetcher: listing.fetcher, base: STAGING })).toEqual(JUDGES);
    expect(listing.asked).toEqual([{ method: "GET", path: `${STAGING}/judges`, body: null }]);
  });

  it("add and remove a judge by its identifier", async () => {
    const changing = answering(201, LARGE_JUDGE);

    expect(await addJudge(LARGE_JUDGE.identifier, { fetcher: changing.fetcher })).toEqual(
      LARGE_JUDGE,
    );
    expect(await removeJudge(LARGE_JUDGE.identifier, { fetcher: changing.fetcher })).toEqual(
      LARGE_JUDGE,
    );
    expect(changing.asked).toEqual([
      { method: "POST", path: "/api/judges", body: { identifier: LARGE_JUDGE.identifier } },
      {
        method: "POST",
        path: "/api/judges/remove",
        body: { identifier: LARGE_JUDGE.identifier },
      },
    ]);
  });

  it("refuse an answer that is not a judge", async () => {
    const wrong = answering(201, { identifier: LARGE_JUDGE.identifier });

    await expect(
      addJudge(LARGE_JUDGE.identifier, { fetcher: wrong.fetcher }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("a run's judgments", () => {
  const RUN = RUN_SUMMARY.run_id;

  it("are listed, newest first", async () => {
    const listing = answering(200, { items: [BAD_JUDGMENT, GOOD_JUDGMENT] });

    expect(await fetchRunFeedback(RUN, { fetcher: listing.fetcher })).toEqual([
      BAD_JUDGMENT,
      GOOD_JUDGMENT,
    ]);
    expect(listing.asked[0]?.path).toBe(`/api/runs/${RUN}/feedback`);
  });

  it("are recorded with what they are told, and nothing else", async () => {
    const recording = answering(201, BAD_JUDGMENT);

    await recordFeedback(RUN, { disposition: "good" }, { fetcher: recording.fetcher });
    await recordFeedback(
      RUN,
      { disposition: "bad", reason: "It left out the fire." },
      { fetcher: recording.fetcher, base: STAGING },
    );
    await recordFeedback(
      RUN,
      { disposition: "bad", reason: "Wrong.", correctedOutput: { text: "Right." } },
      { fetcher: recording.fetcher },
    );
    await recordFeedback(
      RUN,
      { disposition: "bad", reason: "Wrong.", correctedOutput: null },
      { fetcher: recording.fetcher },
    );

    expect(recording.asked).toEqual([
      { method: "POST", path: `/api/runs/${RUN}/feedback`, body: { disposition: "good" } },
      {
        method: "POST",
        path: `${STAGING}/runs/${RUN}/feedback`,
        body: { disposition: "bad", reason: "It left out the fire." },
      },
      {
        method: "POST",
        path: `/api/runs/${RUN}/feedback`,
        body: { disposition: "bad", reason: "Wrong.", corrected_output: { text: "Right." } },
      },
      {
        method: "POST",
        path: `/api/runs/${RUN}/feedback`,
        body: { disposition: "bad", reason: "Wrong.", corrected_output: null },
      },
    ]);
  });

  it("pass on what Azathoth refuses", async () => {
    const refusing = answering(422, {
      error: { code: "invalid_argument", message: "A bad judgment needs a reason." },
    });

    await expect(
      recordFeedback(RUN, { disposition: "bad" }, { fetcher: refusing.fetcher }),
    ).rejects.toMatchObject({
      code: "invalid_argument",
      message: "A bad judgment needs a reason.",
      status: 422,
    });
  });
});

describe("a run's evidence", () => {
  const RUN = RUN_SUMMARY.run_id;

  it("is its citations, by run or by invocation", async () => {
    const reading = answering(200, ANNOTATIONS);

    expect(await fetchRunAnnotations(RUN, { fetcher: reading.fetcher })).toEqual(ANNOTATIONS);
    expect(
      await fetchInvocationAnnotations("f1000000-0000-4000-8000-000000000001", {
        fetcher: reading.fetcher,
        base: STAGING,
      }),
    ).toEqual(ANNOTATIONS);
    expect(reading.asked.map((asked) => asked.path)).toEqual([
      `/api/runs/${RUN}/annotations`,
      `${STAGING}/invocations/f1000000-0000-4000-8000-000000000001/annotations`,
    ]);
  });

  it("is the runs it started", async () => {
    const listing = answering(200, { items: CHILDREN });

    expect(await fetchRunChildren(RUN, { fetcher: listing.fetcher })).toEqual(CHILDREN);
    expect(listing.asked[0]?.path).toBe(`/api/runs/${RUN}/children`);
  });

  it("refuses citations it cannot read", async () => {
    const wrong = answering(200, { ...ANNOTATIONS, items: null });

    await expect(fetchRunAnnotations(RUN, { fetcher: wrong.fetcher })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

describe("interrupted runs", () => {
  it("are listed for one workflow, at most so many", async () => {
    const listing = answering(200, { items: INTERRUPTED_RUNS });

    expect(await fetchInterruptedRuns(WORKFLOW.id, { fetcher: listing.fetcher })).toEqual(
      INTERRUPTED_RUNS,
    );
    expect(listing.asked[0]?.path).toBe(`/api/workflows/${WORKFLOW.id}/interrupted?limit=20`);
  });

  it("are resumed as live runs, naming their workflow", async () => {
    const live = answering(201, RESUMING);

    expect(
      await resumeRun(
        { runId: INTERRUPTED.run_id, workflowId: WORKFLOW.id },
        { fetcher: live.fetcher, base: STAGING },
      ),
    ).toEqual(RESUMING);
    expect(live.asked).toEqual([
      {
        method: "POST",
        path: `${STAGING}/live/runs/${INTERRUPTED.run_id}/resume`,
        body: { workflow_id: WORKFLOW.id },
      },
    ]);
  });
});

describe("the evidence's queries", () => {
  it("keep a run's evidence with its runs, and an invocation's with its invocations", () => {
    const runs = queryKeys.runs;

    expect(queryKeys.feedback("r").slice(0, 1)).toEqual(runs);
    expect(queryKeys.runAnnotations("r").slice(0, 1)).toEqual(runs);
    expect(queryKeys.children("r").slice(0, 1)).toEqual(runs);
    expect(queryKeys.interrupted("w").slice(0, 1)).toEqual(runs);
    expect(queryKeys.invocationAnnotations("i").slice(0, 1)).toEqual(queryKeys.invocations);
  });

  it("fetch a run, its judgments and its workflow's runs again once it is judged", async () => {
    vi.stubGlobal("fetch", answering(201, BAD_JUDGMENT).fetcher);
    const { client, wrapper } = withClient();
    const RUN = RUN_SUMMARY.run_id;
    const kept = [
      queryKeys.run(RUN),
      queryKeys.feedback(RUN),
      queryKeys.workflowRuns(WORKFLOW.id),
      queryKeys.children(RUN),
    ];

    for (const key of kept) {
      client.setQueryData(scoped(LOCAL_SCOPE, key), []);
    }
    const { result } = renderHook(() => useRecordFeedback(RUN), { wrapper });

    expect(await result.current.mutateAsync({ disposition: "bad", reason: "No." })).toEqual(
      BAD_JUDGMENT,
    );
    expect(kept.map((key) => invalidated(client, key))).toEqual([true, true, true, false]);
  });

  it("fetch the rotation again once it changes", async () => {
    vi.stubGlobal("fetch", answering(201, LARGE_JUDGE).fetcher);
    const { client, wrapper } = withClient();

    client.setQueryData(scoped(LOCAL_SCOPE, queryKeys.judges), JUDGES);
    const { result } = renderHook(() => useJudgeChange(), { wrapper });

    await result.current.mutateAsync({ identifier: LARGE_JUDGE.identifier, add: false });

    expect(invalidated(client, queryKeys.judges)).toBe(true);
  });

  it("keep a resumed run, and fetch the live runs and the interrupted ones again", async () => {
    vi.stubGlobal("fetch", answering(201, RESUMING).fetcher);
    const { client, wrapper } = withClient();

    client.setQueryData(scoped(LOCAL_SCOPE, queryKeys.liveList), []);
    client.setQueryData(scoped(LOCAL_SCOPE, queryKeys.interrupted(WORKFLOW.id)), INTERRUPTED_RUNS);
    const { result } = renderHook(() => useResumeRun(), { wrapper });

    await result.current.mutateAsync({ runId: INTERRUPTED.run_id, workflowId: WORKFLOW.id });

    expect(client.getQueryData(scoped(LOCAL_SCOPE, queryKeys.liveRun(RESUMING.handle)))).toEqual(
      RESUMING,
    );
    expect(invalidated(client, queryKeys.liveList)).toBe(true);
    expect(invalidated(client, queryKeys.interrupted(WORKFLOW.id))).toBe(true);
  });
});
