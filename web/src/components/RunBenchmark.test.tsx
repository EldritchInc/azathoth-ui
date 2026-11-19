import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../App";
import { CASES, LIVE_BENCHMARK, LIVE_COMPARISON } from "../test/benchmarks";
import { BENCHMARK_DETAIL } from "../test/documents";
import { stubEventSource } from "../test/eventSource";
import { REVIEW_WORKFLOW, SERVER, WORKFLOW, type Answers } from "../test/instances";
import { recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";

const BENCHMARK_PATH = `/api/benchmarks/${BENCHMARK_DETAIL.id}`;
const PAGE = `/benchmarks/${BENCHMARK_DETAIL.id}`;

const ANSWERS: Answers = {
  ...SERVER,
  [BENCHMARK_PATH]: [200, BENCHMARK_DETAIL],
  [`${BENCHMARK_PATH}/history?limit=100`]: [200, { items: [BENCHMARK_DETAIL] }],
  [`${BENCHMARK_PATH}/cases`]: [200, { items: CASES }],
  [`/api/live/${LIVE_BENCHMARK.handle}`]: [200, LIVE_BENCHMARK],
  [`/api/live/${LIVE_COMPARISON.handle}`]: [200, LIVE_COMPARISON],
};

function posted(sent: readonly Sent[]): Sent[] {
  return sent.filter((each) => each.method === "POST");
}

describe("running a benchmark", () => {
  beforeEach(() => {
    stubEventSource();
  });

  it("is offered on its page, as Run and Compare", async () => {
    renderAt(<App />, { path: PAGE, answers: ANSWERS });

    expect(await screen.findByRole("link", { name: "Run" })).toHaveAttribute("href", `${PAGE}/run`);
    expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute(
      "href",
      `${PAGE}/compare`,
    );
  });

  it("starts one workflow against it, and opens the live run", async () => {
    const sent: Sent[] = [];

    renderAt(<App />, {
      path: `${PAGE}/run`,
      fetcher: recording(ANSWERS, { "/api/live/benchmarks": [201, LIVE_BENCHMARK] }, sent),
    });

    await screen.findByRole("option", { name: REVIEW_WORKFLOW.name });
    fireEvent.change(screen.getByLabelText("Workflow"), { target: { value: REVIEW_WORKFLOW.id } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(await screen.findByText("Benchmark run", { selector: "p" })).toBeVisible();
    expect(posted(sent)).toEqual([
      {
        method: "POST",
        path: "/api/live/benchmarks",
        body: { benchmark_id: BENCHMARK_DETAIL.id, workflow_id: REVIEW_WORKFLOW.id },
      },
    ]);
  });

  it("compares two workflows or more against targets", async () => {
    const sent: Sent[] = [];

    renderAt(<App />, {
      path: `${PAGE}/compare`,
      fetcher: recording(ANSWERS, { "/api/live/comparisons": [201, LIVE_COMPARISON] }, sent),
    });

    const compare = await screen.findByRole("button", { name: "Compare" });

    fireEvent.click(await screen.findByRole("checkbox", { name: REVIEW_WORKFLOW.name }));
    fireEvent.change(screen.getByLabelText("Target latency, in seconds"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Target cost, in US dollars"), {
      target: { value: "0" },
    });

    expect(compare).toBeDisabled();
    expect(screen.getByText("Give a number above zero.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Target cost, in US dollars"), {
      target: { value: "0.01" },
    });
    expect(compare).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: WORKFLOW.name }));
    fireEvent.click(compare);

    expect(await screen.findByText("Comparison", { selector: "p" })).toBeVisible();
    expect(posted(sent)).toEqual([
      {
        method: "POST",
        path: "/api/live/comparisons",
        body: {
          benchmark_id: BENCHMARK_DETAIL.id,
          workflow_ids: [WORKFLOW.id, REVIEW_WORKFLOW.id],
          target_latency_seconds: 5,
          target_cost_usd: 0.01,
        },
      },
    ]);
  });

  it("can't start a benchmark with no cases", async () => {
    renderAt(<App />, {
      path: `${PAGE}/run`,
      answers: { ...ANSWERS, [BENCHMARK_PATH]: [200, { ...BENCHMARK_DETAIL, case_count: 0 }] },
    });

    expect(await screen.findByText("It has no cases yet")).toBeVisible();
    await screen.findByRole("option", { name: WORKFLOW.name });

    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("passes on what refuses it before it starts", async () => {
    renderAt(<App />, {
      path: `${PAGE}/run`,
      fetcher: recording(
        ANSWERS,
        {
          "/api/live/benchmarks": [
            429,
            { error: { code: "too_many_runs", message: "Too many runs are running." } },
          ],
        },
        [],
      ),
    });

    await screen.findByRole("option", { name: WORKFLOW.name });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(screen.getByText("Too many runs are running.")).toBeVisible();
    });
  });
});
