import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { fetchSpend, spendCsvPath, spendSearch } from "./api/client";
import { isSpendReport } from "./api/types";
import { queryKeys, useSpend } from "./queries";
import { LOCAL_SCOPE, scoped } from "./scope";
import { urlOf } from "./test/instances";
import { SPEND_QUERY, SPEND_REPORT } from "./test/spend";

interface Asked {
  readonly url: URL;
}

function answering(status: number, body: unknown): { fetcher: typeof fetch; asked: Asked[] } {
  const asked: Asked[] = [];

  return {
    asked,
    fetcher: (input) => {
      asked.push({ url: urlOf(input) });

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    },
  };
}

describe("a spend report", () => {
  it("is read as the server writes it", () => {
    expect(isSpendReport(SPEND_REPORT)).toBe(true);
    expect(isSpendReport({ ...SPEND_REPORT, workflow_id: SPEND_REPORT.groups[0]?.key })).toBe(true);
  });

  it.each([
    ["a period not listed", { ...SPEND_REPORT, period: "fortnight" }],
    ["a grouping not listed", { ...SPEND_REPORT, group: "colour" }],
    [
      "billed and estimated added into one",
      { ...SPEND_REPORT, totals: { cost_usd: 0.75, calls: 3, unpriced_calls: 1 } },
    ],
    ["a negative amount", { ...SPEND_REPORT, totals: { ...SPEND_REPORT.totals, billed_usd: -1 } }],
    ["a fraction of a call", { ...SPEND_REPORT, totals: { ...SPEND_REPORT.totals, calls: 2.5 } }],
    ["a period with no end", { ...SPEND_REPORT, periods: [{ start: SPEND_REPORT.since }] }],
    ["no command", { ...SPEND_REPORT, command: undefined }],
  ])("is refused with %s", (_name, value) => {
    expect(isSpendReport(value)).toBe(false);
  });
});

describe("spend's calls", () => {
  it("ask for the report with every choice in the query, offsets kept", async () => {
    const reading = answering(200, SPEND_REPORT);

    await expect(
      fetchSpend(SPEND_QUERY, { fetcher: reading.fetcher, base: "/api/remotes/staging" }),
    ).resolves.toEqual(SPEND_REPORT);

    const url = reading.asked[0]?.url;

    expect(url?.pathname).toBe("/api/remotes/staging/spend");
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      since: "2026-11-18T00:00:00-05:00",
      until: "2026-11-20T00:00:00-05:00",
      period: "day",
      group: "workflow",
      time_zone: "America/New_York",
    });
  });

  it("encode an offset's plus sign, so the server never reads it as a space", () => {
    const search = spendSearch({ ...SPEND_QUERY, since: "2026-11-18T00:00:00+09:00" });

    expect(search).toContain("since=2026-11-18T00%3A00%3A00%2B09%3A00");
  });

  it("name one workflow when the report keeps to it", () => {
    expect(spendSearch({ ...SPEND_QUERY, workflowId: "abc" })).toContain("workflow_id=abc");
  });

  it("refuse an answer that is not a report", async () => {
    await expect(
      fetchSpend(SPEND_QUERY, { fetcher: answering(200, { items: [] }).fetcher }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("pass on what the server refuses", async () => {
    await expect(
      fetchSpend(SPEND_QUERY, {
        fetcher: answering(422, {
          error: { code: "invalid_argument", message: "'Mars/Olympus' is not a time zone." },
        }).fetcher,
      }),
    ).rejects.toMatchObject({ code: "invalid_argument", status: 422 });
  });

  it("download the same report as CSV from its own address", () => {
    expect(spendCsvPath(SPEND_QUERY)).toBe(`/api/spend.csv${spendSearch(SPEND_QUERY)}`);
    expect(spendCsvPath(SPEND_QUERY, "/api/remotes/staging")).toBe(
      `/api/remotes/staging/spend.csv${spendSearch(SPEND_QUERY)}`,
    );
  });
});

describe("the spend query", () => {
  it("is kept by every choice it asks", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { readonly children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    client.setQueryData(scoped(LOCAL_SCOPE, queryKeys.spend(SPEND_QUERY)), SPEND_REPORT);

    const { result } = renderHook(() => useSpend(SPEND_QUERY), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(SPEND_REPORT);
    });
    expect(queryKeys.spend(SPEND_QUERY)).not.toEqual(
      queryKeys.spend({ ...SPEND_QUERY, group: "model" }),
    );
    expect(queryKeys.spend(SPEND_QUERY).slice(0, 1)).toEqual(queryKeys.spending);
  });
});
