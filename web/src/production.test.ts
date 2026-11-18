import { describe, expect, it } from "vitest";

import {
  fetchInvocation,
  fetchProduction,
  fetchProductionRevisions,
  fetchWorkflowInvocations,
  promoteWorkflow,
  resumeInvocation,
  rollBackWorkflow,
  startInvocation,
} from "./api/client";
import {
  isInvocationDetail,
  isInvocationOutcome,
  isInvocationSummary,
  isLiveRun,
  isProductionRevisionSummary,
  isProductionState,
} from "./api/types";
import { queryKeys } from "./queries";
import { WORKFLOW, urlOf } from "./test/instances";
import {
  FIRST_PROMOTION,
  INCOMPLETE_DETAIL,
  INVOCATIONS,
  LIVE_INVOCATION,
  OUTCOME,
  PRODUCTION,
  PRODUCTION_REVISIONS,
  ROLLBACK,
  SUCCEEDED_DETAIL,
} from "./test/production";

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

describe("production's values", () => {
  it("are read as the server writes them", () => {
    expect(isProductionState(PRODUCTION)).toBe(true);
    expect(PRODUCTION_REVISIONS.every(isProductionRevisionSummary)).toBe(true);
    expect(INVOCATIONS.every(isInvocationSummary)).toBe(true);
    expect(isInvocationDetail(SUCCEEDED_DETAIL)).toBe(true);
    expect(isInvocationDetail(INCOMPLETE_DETAIL)).toBe(true);
    expect(isInvocationOutcome(OUTCOME)).toBe(true);
    expect(isLiveRun(LIVE_INVOCATION)).toBe(true);
  });

  it("are refused when they are not what the server writes", () => {
    expect(isProductionRevisionSummary({ ...ROLLBACK, active: "yes" })).toBe(false);
    expect(isProductionRevisionSummary({ ...ROLLBACK, author: { email: null } })).toBe(false);
    expect(isInvocationSummary({ ...INVOCATIONS[0], sensitivity: "secret" })).toBe(false);
    expect(isInvocationDetail({ ...SUCCEEDED_DETAIL, status: "done" })).toBe(false);
    expect(isLiveRun({ ...LIVE_INVOCATION, kind: "job" })).toBe(false);
  });
});

describe("production's calls", () => {
  it("read what runs, or nothing, from the instance's endpoints", async () => {
    const running = answering(200, { production: PRODUCTION });
    const none = answering(200, { production: null });

    expect(await fetchProduction(WORKFLOW.id, { fetcher: running.fetcher, base: STAGING })).toEqual(
      PRODUCTION,
    );
    expect(await fetchProduction(WORKFLOW.id, { fetcher: none.fetcher })).toBeNull();
    expect(running.asked[0]?.path).toBe(`${STAGING}/workflows/${WORKFLOW.id}/production`);
    expect(none.asked[0]?.path).toBe(`/api/workflows/${WORKFLOW.id}/production`);
  });

  it("list revisions and invocations, at most so many", async () => {
    const revisions = answering(200, { items: PRODUCTION_REVISIONS });
    const invocations = answering(200, { items: INVOCATIONS });

    expect(await fetchProductionRevisions(WORKFLOW.id, { fetcher: revisions.fetcher })).toEqual(
      PRODUCTION_REVISIONS,
    );
    expect(await fetchWorkflowInvocations(WORKFLOW.id, { fetcher: invocations.fetcher })).toEqual(
      INVOCATIONS,
    );
    expect(revisions.asked[0]?.path).toBe(
      `/api/workflows/${WORKFLOW.id}/production/revisions?limit=20`,
    );
    expect(invocations.asked[0]?.path).toBe(`/api/workflows/${WORKFLOW.id}/invocations?limit=20`);
  });

  it("promote and roll back with what they are told, and nothing else", async () => {
    const changing = answering(201, ROLLBACK);

    await promoteWorkflow(WORKFLOW.id, {}, { fetcher: changing.fetcher });
    await promoteWorkflow(WORKFLOW.id, { experimentId: "x1" }, { fetcher: changing.fetcher });
    await rollBackWorkflow(WORKFLOW.id, {}, { fetcher: changing.fetcher });
    await rollBackWorkflow(
      WORKFLOW.id,
      { to: FIRST_PROMOTION.revision_id },
      { fetcher: changing.fetcher, base: STAGING },
    );

    expect(changing.asked).toEqual([
      { method: "POST", path: `/api/workflows/${WORKFLOW.id}/promote`, body: {} },
      {
        method: "POST",
        path: `/api/workflows/${WORKFLOW.id}/promote`,
        body: { experiment_id: "x1" },
      },
      { method: "POST", path: `/api/workflows/${WORKFLOW.id}/rollback`, body: {} },
      {
        method: "POST",
        path: `${STAGING}/workflows/${WORKFLOW.id}/rollback`,
        body: { to: FIRST_PROMOTION.revision_id },
      },
    ]);
  });

  it("read one invocation", async () => {
    const reading = answering(200, SUCCEEDED_DETAIL);

    expect(
      await fetchInvocation(SUCCEEDED_DETAIL.invocation_id, { fetcher: reading.fetcher }),
    ).toEqual(SUCCEEDED_DETAIL);
    expect(reading.asked[0]?.path).toBe(`/api/invocations/${SUCCEEDED_DETAIL.invocation_id}`);
  });

  it("invoke and resume as live runs, sending a key only when one is named", async () => {
    const live = answering(201, LIVE_INVOCATION);

    await startInvocation(
      { workflowId: WORKFLOW.id, given: { kind: "json", value: "a" } },
      { fetcher: live.fetcher },
    );
    await startInvocation(
      { workflowId: WORKFLOW.id, given: { kind: "json", value: "a" }, idempotencyKey: "order-7" },
      { fetcher: live.fetcher },
    );
    await resumeInvocation(INCOMPLETE_DETAIL.invocation_id, { fetcher: live.fetcher });

    expect(live.asked).toEqual([
      {
        method: "POST",
        path: "/api/live/invocations",
        body: { workflow_id: WORKFLOW.id, input: "a" },
      },
      {
        method: "POST",
        path: "/api/live/invocations",
        body: { workflow_id: WORKFLOW.id, input: "a", idempotency_key: "order-7" },
      },
      {
        method: "POST",
        path: `/api/live/invocations/${INCOMPLETE_DETAIL.invocation_id}/resume`,
        body: {},
      },
    ]);
  });
});

describe("production's queries", () => {
  it("keep a workflow's production and its revisions together, apart from its invocations", () => {
    expect(queryKeys.productionRevisions("w").slice(0, 2)).toEqual(queryKeys.production("w"));
    expect(queryKeys.workflowInvocations("w").slice(0, 1)).toEqual(queryKeys.invocations);
    expect(queryKeys.invocation("i").slice(0, 1)).toEqual(queryKeys.invocations);
  });
});
