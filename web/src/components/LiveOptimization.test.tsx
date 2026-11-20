import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import type { LiveRun } from "../api/types";
import { BENCHMARK_DETAIL, WORKFLOW_DETAIL } from "../test/documents";
import { lastStream, stubEventSource } from "../test/eventSource";
import { SERVER, type Answers } from "../test/instances";
import {
  EARLIER_EXPERIMENT_ID,
  EXPERIMENT_ID,
  LIVE_OPTIMIZATION,
  OPTIMIZATION_EVENTS,
  SESSION,
} from "../test/optimization";
import { recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";
import { LiveRunPage } from "./LiveRun";

const ANSWERS: Answers = {
  ...SERVER,
  [`/api/live/${LIVE_OPTIMIZATION.handle}`]: [200, LIVE_OPTIMIZATION],
  [`/api/workflows/${WORKFLOW_DETAIL.id}`]: [200, WORKFLOW_DETAIL],
  [`/api/benchmarks/${BENCHMARK_DETAIL.id}`]: [200, BENCHMARK_DETAIL],
};

function open(sent: Sent[] = [], posts: Answers = {}) {
  renderAt(
    <Routes>
      <Route path="/live/:handle" element={<LiveRunPage />} />
    </Routes>,
    { path: `/live/${LIVE_OPTIMIZATION.handle}`, fetcher: recording(ANSWERS, posts, sent) },
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

function finished(session: object): LiveRun {
  return {
    ...LIVE_OPTIMIZATION,
    state: "finished",
    finished_at: "2026-11-10T10:05:00Z",
    event_count: OPTIMIZATION_EVENTS.length,
    result: session as Readonly<Record<string, unknown>>,
  };
}

function generation(name: string) {
  return within(screen.getByRole("region", { name }));
}

async function opened() {
  expect(
    await screen.findByRole("heading", { level: 1, name: WORKFLOW_DETAIL.name }),
  ).toBeVisible();
}

describe("a live optimization", () => {
  beforeEach(() => {
    stubEventSource();
  });

  it("shows each generation as it starts, and each candidate's passes and score", async () => {
    open();
    await opened();

    expect(screen.getByText("Optimization", { selector: "p" })).toBeVisible();
    expect(await screen.findByText(/Against word count/)).toBeVisible();
    expect(screen.getByText("Waiting for the first generation to start…")).toBeVisible();

    send(OPTIMIZATION_EVENTS.slice(0, 1));

    expect(generation("Generation 1").getByText("Generation 1: 0 of 1 done")).toBeVisible();
    expect(generation("Generation 1").getByText("Candidate 1 of 1: Running…")).toBeVisible();

    send(OPTIMIZATION_EVENTS.slice(0, 5));

    const first = generation("Generation 1");
    const last = generation("Final evaluation");

    expect(first.getByText("Candidate 1 of 1: passed 1 of 2 cases, scoring 0.62")).toBeVisible();
    expect(last.getByText("Final evaluation: 1 of 2 done")).toBeVisible();
    expect(last.getByText("Candidate 1 of 2: passed 1 of 2 cases, scoring 0.62")).toBeVisible();
    expect(last.getByText("Candidate 2 of 2: Running…")).toBeVisible();
  });

  it("shows each generation's winner, what it proposes, and its experiment", async () => {
    open();
    await opened();

    send(OPTIMIZATION_EVENTS);

    const first = generation("Generation 1");

    expect(
      first.getByText(/Candidate 1 won, scoring 0.62, and proposes 2 candidates/),
    ).toBeVisible();
    expect(first.getByRole("link", { name: "its experiment" })).toHaveAttribute(
      "href",
      `/experiments/${EARLIER_EXPERIMENT_ID}`,
    );
    expect(generation("Final evaluation").getByText(/Candidate 2 won, scoring 0.96/)).toBeVisible();
    expect(screen.getByText(/2 experiments kept/)).toBeVisible();
  });

  it("links to the winning experiment once it ends", async () => {
    open();
    await opened();

    send(OPTIMIZATION_EVENTS);
    end(finished(SESSION));

    expect(screen.getByRole("status")).toHaveTextContent("Finished");
    expect(screen.getByRole("link", { name: "Open the winning experiment" })).toHaveAttribute(
      "href",
      `/experiments/${EXPERIMENT_ID}`,
    );
    expect(screen.getByRole("link", { name: "Optimize again" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW_DETAIL.id}/optimize`,
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("says why the final evaluation didn't run", async () => {
    open();
    await opened();

    send(OPTIMIZATION_EVENTS.slice(0, 3));
    end(
      finished({
        ...SESSION,
        final_experiment_id: null,
        final_skipped: "The generation proposed no new candidate.",
        winning_experiment_id: EARLIER_EXPERIMENT_ID,
      }),
    );

    expect(screen.getByText("The final evaluation didn't run")).toBeVisible();
    expect(screen.getByText("The generation proposed no new candidate.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open the winning experiment" })).toHaveAttribute(
      "href",
      `/experiments/${EARLIER_EXPERIMENT_ID}`,
    );
  });

  it("is cancelled between candidates, keeping the experiments that finished", async () => {
    const sent: Sent[] = [];
    const cancelPath = `/api/live/${LIVE_OPTIMIZATION.handle}/cancel`;

    open(sent, { [cancelPath]: [202, LIVE_OPTIMIZATION] });

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(sent.filter((each) => each.method === "POST").map((each) => each.path)).toEqual([
        cancelPath,
      ]);
    });

    send(OPTIMIZATION_EVENTS.slice(0, 4));
    end({ ...LIVE_OPTIMIZATION, state: "cancelled", finished_at: "2026-11-10T10:02:00Z" });

    expect(screen.getByRole("status")).toHaveTextContent("Cancelled");
    expect(screen.getByText(/experiments of the generations that finished are kept/)).toBeVisible();
    expect(screen.getByRole("link", { name: "See its experiments" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW_DETAIL.id}/experiments`,
    );
    expect(generation("Final evaluation").getByText("Candidate 1 of 2: Stopped")).toBeVisible();
    expect(screen.queryByText(/Running…/)).toBeNull();
  });

  it("says why Azathoth refused it", async () => {
    open();
    await opened();

    end({
      ...LIVE_OPTIMIZATION,
      state: "refused",
      finished_at: "2026-11-10T10:00:00.1Z",
      error: { code: "benchmark_empty", message: "The benchmark has no cases." },
    });

    expect(screen.getByRole("status")).toHaveTextContent("Refused");
    expect(screen.getByText("The benchmark has no cases.")).toBeVisible();
    expect(screen.getByText("benchmark_empty")).toBeVisible();
    expect(screen.getByText("No generation ran.")).toBeVisible();
  });
});
