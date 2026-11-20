import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../App";
import { BENCHMARK_DETAIL, WORKFLOW_DETAIL, WORKFLOW_HISTORY } from "../test/documents";
import { stubEventSource } from "../test/eventSource";
import { BENCHMARK, SERVER, type Answers } from "../test/instances";
import { LIVE_OPTIMIZATION } from "../test/optimization";
import { recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";

const WORKFLOW_PATH = `/api/workflows/${WORKFLOW_DETAIL.id}`;
const PAGE = `/workflows/${WORKFLOW_DETAIL.id}`;

const ANSWERS: Answers = {
  ...SERVER,
  [WORKFLOW_PATH]: [200, WORKFLOW_DETAIL],
  [`${WORKFLOW_PATH}/history?limit=100`]: [200, { items: WORKFLOW_HISTORY }],
  [`/api/benchmarks/${BENCHMARK_DETAIL.id}`]: [200, BENCHMARK_DETAIL],
  [`/api/live/${LIVE_OPTIMIZATION.handle}`]: [200, LIVE_OPTIMIZATION],
};

const STARTED: Answers = { "/api/live/optimizations": [201, LIVE_OPTIMIZATION] };

function posted(sent: readonly Sent[]): Sent[] {
  return sent.filter((each) => each.method === "POST");
}

async function targeted() {
  await screen.findByRole("option", { name: BENCHMARK.name });
  fireEvent.change(screen.getByLabelText("Target latency, in seconds"), {
    target: { value: "5" },
  });
  fireEvent.change(screen.getByLabelText("Target cost, in US dollars"), {
    target: { value: "0.01" },
  });
}

describe("optimizing a workflow", () => {
  beforeEach(() => {
    stubEventSource();
  });

  it("is offered on its page, beside Run", async () => {
    renderAt(<App />, { path: PAGE, answers: ANSWERS });

    expect(await screen.findByRole("link", { name: "Optimize" })).toHaveAttribute(
      "href",
      `${PAGE}/optimize`,
    );
  });

  it("starts against a benchmark and targets, for one generation, and opens it live", async () => {
    const sent: Sent[] = [];

    renderAt(<App />, { path: `${PAGE}/optimize`, fetcher: recording(ANSWERS, STARTED, sent) });

    expect(
      await screen.findByRole("heading", { level: 1, name: `Optimize ${WORKFLOW_DETAIL.name}` }),
    ).toBeVisible();

    const optimize = screen.getByRole("button", { name: "Optimize" });

    expect(optimize).toBeDisabled();
    expect(screen.getByLabelText("Generations")).toHaveValue("1");

    await targeted();
    fireEvent.click(optimize);

    expect(await screen.findByText("Optimization", { selector: "p" })).toBeVisible();
    expect(posted(sent)).toEqual([
      {
        method: "POST",
        path: "/api/live/optimizations",
        body: {
          workflow_id: WORKFLOW_DETAIL.id,
          benchmark_id: BENCHMARK.id,
          target_latency_seconds: 5,
          target_cost_usd: 0.01,
          generations: 1,
        },
      },
    ]);
  });

  it("runs as many generations as asked, a whole number", async () => {
    const sent: Sent[] = [];

    renderAt(<App />, { path: `${PAGE}/optimize`, fetcher: recording(ANSWERS, STARTED, sent) });

    await targeted();

    const optimize = screen.getByRole("button", { name: "Optimize" });

    fireEvent.change(screen.getByLabelText("Generations"), { target: { value: "0" } });

    expect(optimize).toBeDisabled();
    expect(screen.getByText("Give a whole number, 1 or more.")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Generations"), { target: { value: "3" } });
    fireEvent.click(optimize);

    await waitFor(() => {
      expect(
        posted(sent).map((each) => (each.body as { generations: number }).generations),
      ).toEqual([3]);
    });
  });

  it("can't optimize against a benchmark with no cases", async () => {
    renderAt(<App />, {
      path: `${PAGE}/optimize`,
      answers: {
        ...ANSWERS,
        "/api/benchmarks": [200, { items: [{ ...BENCHMARK, case_count: 0 }] }],
      },
    });

    await targeted();

    expect(screen.getByText("That benchmark has no cases yet")).toBeVisible();
    expect(screen.getByRole("button", { name: "Optimize" })).toBeDisabled();
  });

  it("says when there's no benchmark to optimize against", async () => {
    renderAt(<App />, {
      path: `${PAGE}/optimize`,
      answers: { ...ANSWERS, "/api/benchmarks": [200, { items: [] }] },
    });

    expect(await screen.findByText("There's no benchmark to optimize against")).toBeVisible();
    expect(screen.getByRole("button", { name: "Optimize" })).toBeDisabled();
  });

  it("passes on what refuses it before it starts", async () => {
    renderAt(<App />, {
      path: `${PAGE}/optimize`,
      fetcher: recording(
        ANSWERS,
        {
          "/api/live/optimizations": [
            429,
            { error: { code: "too_many_runs", message: "Too many runs are running." } },
          ],
        },
        [],
      ),
    });

    await targeted();
    fireEvent.click(screen.getByRole("button", { name: "Optimize" }));

    await waitFor(() => {
      expect(screen.getByText("Too many runs are running.")).toBeVisible();
    });
  });
});
