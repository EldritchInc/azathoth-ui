import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import type { LiveRun } from "../api/types";
import {
  CASE_EVENTS,
  CASES,
  COMPARISON,
  LIVE_BENCHMARK,
  LIVE_COMPARISON,
  RUN_EXECUTION,
} from "../test/benchmarks";
import { BENCHMARK_DETAIL } from "../test/documents";
import { lastStream, stubEventSource } from "../test/eventSource";
import { REVIEW_WORKFLOW, SERVER, WORKFLOW, type Answers } from "../test/instances";
import { recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";
import { LiveRunPage } from "./LiveRun";

const BENCHMARK_PATH = `/api/benchmarks/${BENCHMARK_DETAIL.id}`;

const ANSWERS: Answers = {
  ...SERVER,
  [`/api/live/${LIVE_BENCHMARK.handle}`]: [200, LIVE_BENCHMARK],
  [`/api/live/${LIVE_COMPARISON.handle}`]: [200, LIVE_COMPARISON],
  [BENCHMARK_PATH]: [200, BENCHMARK_DETAIL],
  [`${BENCHMARK_PATH}/cases`]: [200, { items: CASES }],
};

function open(handle: string, sent: Sent[] = [], posts: Answers = {}) {
  renderAt(
    <Routes>
      <Route path="/live/:handle" element={<LiveRunPage />} />
    </Routes>,
    { path: `/live/${handle}`, fetcher: recording(ANSWERS, posts, sent) },
  );
}

/** Sends events, numbered from 1, as the server would. */
function send(events: readonly unknown[]) {
  act(() => {
    events.forEach((event, index) => {
      lastStream().emit("run_event", event, String(index + 1));
    });
  });
}

function end(live: LiveRun) {
  act(() => {
    lastStream().emit("end", live);
  });
}

function cases() {
  return within(screen.getByRole("region", { name: "Cases" }));
}

describe("a live benchmark run", () => {
  beforeEach(() => {
    stubEventSource();
  });

  it("shows each case as it starts and finishes, and how many passed", async () => {
    open(LIVE_BENCHMARK.handle);

    expect(await screen.findByRole("heading", { level: 1, name: "word count" })).toBeVisible();
    expect(screen.getByText("Benchmark run", { selector: "p" })).toBeVisible();
    expect(screen.getByText("Waiting for the first case to start…")).toBeVisible();

    send(CASE_EVENTS.slice(0, 3));

    const workflow = within(cases().getByRole("region", { name: WORKFLOW.name }));

    expect(workflow.getByText(/Case 1 of 2, Eight words\./)).toHaveTextContent(
      "Passed, scoring 1.00",
    );
    expect(workflow.getByText(/Case 2 of 2, The summary/)).toHaveTextContent("Running…");
    expect(screen.getByText(/1 of 2 cases done, 1 passed/)).toBeVisible();
    expect(workflow.getByRole("link", { name: "its run" })).toHaveAttribute(
      "href",
      "/runs/a1000000-0000-4000-8000-000000000101",
    );
  });

  it("links to its execution once it finishes", async () => {
    open(LIVE_BENCHMARK.handle);
    await screen.findByRole("heading", { level: 1, name: "word count" });

    send(CASE_EVENTS);
    end({
      ...LIVE_BENCHMARK,
      state: "finished",
      finished_at: "2026-11-19T09:00:04Z",
      event_count: CASE_EVENTS.length,
      result: RUN_EXECUTION as unknown as Readonly<Record<string, unknown>>,
    });

    expect(screen.getByRole("status")).toHaveTextContent("Finished");
    expect(screen.getByText(`${WORKFLOW.name}: 1 of 2 passed`)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open the execution" })).toHaveAttribute(
      "href",
      `/benchmark-executions/${RUN_EXECUTION.execution_id}`,
    );
    expect(screen.getByRole("link", { name: "Run again" })).toHaveAttribute(
      "href",
      `/benchmarks/${BENCHMARK_DETAIL.id}/run`,
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("is cancelled between cases, keeping the runs that finished", async () => {
    const sent: Sent[] = [];
    const cancelPath = `/api/live/${LIVE_BENCHMARK.handle}/cancel`;

    open(LIVE_BENCHMARK.handle, sent, {
      [cancelPath]: [202, { ...LIVE_BENCHMARK, state: "running" }],
    });

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(sent.filter((each) => each.method === "POST").map((each) => each.path)).toEqual([
        cancelPath,
      ]);
    });

    end({ ...LIVE_BENCHMARK, state: "cancelled", finished_at: "2026-11-19T09:00:02Z" });

    expect(screen.getByRole("status")).toHaveTextContent("Cancelled");
    expect(screen.getByText(/The runs of the cases that finished are kept/)).toBeVisible();
  });

  it("says why Azathoth refused it", async () => {
    open(LIVE_BENCHMARK.handle);
    await screen.findByRole("heading", { level: 1, name: "word count" });

    end({
      ...LIVE_BENCHMARK,
      state: "refused",
      finished_at: "2026-11-19T09:00:00.1Z",
      error: { code: "judge_unavailable", message: "No judge can judge a semantic case." },
    });

    expect(screen.getByRole("status")).toHaveTextContent("Refused");
    expect(screen.getByText("No judge can judge a semantic case.")).toBeVisible();
    expect(screen.getByText("judge_unavailable")).toBeVisible();
    expect(screen.getByText("No case ran.")).toBeVisible();
  });
});

describe("a live comparison", () => {
  beforeEach(() => {
    stubEventSource();
  });

  it("shows each workflow's cases apart, and their scores once it ends", async () => {
    open(LIVE_COMPARISON.handle);
    await screen.findByRole("heading", { level: 1, name: "word count" });

    const second = CASE_EVENTS.map((event) => ({ ...event, workflow_id: REVIEW_WORKFLOW.id }));

    send([...CASE_EVENTS, ...second]);

    expect(cases().getByRole("region", { name: WORKFLOW.name })).toHaveTextContent(
      "2 of 2 done, 1 passed",
    );
    expect(cases().getByRole("region", { name: REVIEW_WORKFLOW.name })).toBeVisible();
    expect(screen.getByText(/4 of 4 cases done, 2 passed/)).toBeVisible();

    end({
      ...LIVE_COMPARISON,
      state: "finished",
      finished_at: "2026-11-19T10:00:09Z",
      result: COMPARISON as unknown as Readonly<Record<string, unknown>>,
    });

    expect(
      screen.getByText(`${REVIEW_WORKFLOW.name}: 2 of 2 passed, scoring 0.91 overall`),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Compare again" })).toHaveAttribute(
      "href",
      `/benchmarks/${BENCHMARK_DETAIL.id}/compare`,
    );
  });
});
