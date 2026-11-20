import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import { BENCHMARK_DETAIL, WORKFLOW_DETAIL, WORKFLOW_HISTORY } from "../test/documents";
import { SERVER, type Answers } from "../test/instances";
import {
  COMPARED,
  CONFIGURED,
  EARLIER_EXPERIMENT_ID,
  EXPERIMENT,
  EXPERIMENT_ID,
  EXPERIMENTS,
  NOTHING_COMPARED,
  PROMOTABLE,
  WINNER,
} from "../test/optimization";
import { renderAt } from "../test/render";

const WORKFLOW_PATH = `/api/workflows/${WORKFLOW_DETAIL.id}`;
const EXPERIMENT_PATH = `/api/experiments/${EXPERIMENT_ID}`;

const ANSWERS: Answers = {
  ...SERVER,
  [WORKFLOW_PATH]: [200, WORKFLOW_DETAIL],
  [`${WORKFLOW_PATH}/history?limit=100`]: [200, { items: WORKFLOW_HISTORY }],
  [`${WORKFLOW_PATH}/experiments?limit=20`]: [200, { items: EXPERIMENTS }],
  [`/api/benchmarks/${BENCHMARK_DETAIL.id}`]: [200, BENCHMARK_DETAIL],
  [EXPERIMENT_PATH]: [200, EXPERIMENT],
  [`${EXPERIMENT_PATH}/compare`]: [200, COMPARED],
  [`${EXPERIMENT_PATH}/promotable`]: [200, PROMOTABLE],
};

function entry<T>(entries: readonly T[], index: number): T {
  const found = entries[index];

  if (found === undefined) {
    throw new Error(`No entry ${String(index)}.`);
  }

  return found;
}

function rowsOf(table: HTMLElement): HTMLElement[] {
  return within(table).getAllByRole("row").slice(1);
}

describe("a workflow's Experiments tab", () => {
  it("lists its experiments, newest first, each with its benchmark and winner's score", async () => {
    renderAt(<App />, { path: `/workflows/${WORKFLOW_DETAIL.id}/experiments`, answers: ANSWERS });

    const section = await screen.findByRole("region", { name: "Experiments" });
    const [latest, earlier] = [
      entry(rowsOf(await within(section).findByRole("table")), 0),
      entry(rowsOf(within(section).getByRole("table")), 1),
    ];

    expect(within(latest).getByRole("link", { name: EXPERIMENT_ID.slice(0, 8) })).toHaveAttribute(
      "href",
      `/experiments/${EXPERIMENT_ID}`,
    );
    expect(within(latest).getByRole("link", { name: /revision 1/ })).toHaveAttribute(
      "href",
      `/benchmarks/${BENCHMARK_DETAIL.id}?revision=1`,
    );
    expect(latest).toHaveTextContent("2 candidates");
    expect(latest).toHaveTextContent("2 cases");
    expect(latest).toHaveTextContent("0.96");
    expect(within(latest).getByText("Internal")).toBeVisible();
    expect(
      within(earlier).getByRole("link", { name: EARLIER_EXPERIMENT_ID.slice(0, 8) }),
    ).toBeVisible();
    expect(earlier).toHaveTextContent("1 candidate");
  });

  it("is a tab of the workflow's page", async () => {
    renderAt(<App />, { path: `/workflows/${WORKFLOW_DETAIL.id}`, answers: ANSWERS });

    const tabs = within(await screen.findByRole("navigation", { name: "Workflow" }));

    fireEvent.click(tabs.getByRole("link", { name: "Experiments" }));

    expect(await screen.findByRole("region", { name: "Experiments" })).toBeVisible();
    expect(tabs.getByRole("link", { name: "Experiments" })).toHaveAttribute("aria-current", "page");
  });

  it("says when the workflow has never been optimized", async () => {
    renderAt(<App />, {
      path: `/workflows/${WORKFLOW_DETAIL.id}/experiments`,
      answers: { ...ANSWERS, [`${WORKFLOW_PATH}/experiments?limit=20`]: [200, { items: [] }] },
    });

    expect(
      await screen.findByText(
        "No experiments yet. Optimize the workflow, and each generation is kept here.",
      ),
    ).toBeVisible();
  });
});

describe("an experiment's page", () => {
  it("names what it ran: the workflow, the benchmark's revision and its command", async () => {
    renderAt(<App />, { path: `/experiments/${EXPERIMENT_ID}`, answers: ANSWERS });

    expect(
      await screen.findByRole("heading", { level: 1, name: EXPERIMENT.workflow_name }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: EXPERIMENT.workflow_name })).toHaveAttribute(
      "href",
      `/workflows/${EXPERIMENT.workflow_id}/experiments`,
    );
    await waitFor(() => {
      expect(screen.getByText("Benchmark").nextElementSibling).toHaveTextContent(
        `${BENCHMARK_DETAIL.name}, revision 1`,
      );
    });
    expect(screen.getByText(EXPERIMENT.command)).toBeVisible();
  });

  it("ranks its candidates, each with its step's model, scorecard and cases", async () => {
    renderAt(<App />, { path: `/experiments/${EXPERIMENT_ID}`, answers: ANSWERS });

    const candidates = within(await screen.findByRole("region", { name: "Candidates" }));
    const winner = within(candidates.getByRole("region", { name: "Rank 1" }));
    const second = within(candidates.getByRole("region", { name: "Rank 2" }));

    expect(winner.getByText("openrouter/acme/small")).toBeVisible();
    expect(winner.getByText(/2 of 2 passed/)).toBeVisible();
    expect(winner.getByText("Overall").nextElementSibling).toHaveTextContent("0.96");
    expect(winner.getByText("Latency").nextElementSibling).toHaveTextContent("0.90");
    expect(winner.getByText("Citations").nextElementSibling).toHaveTextContent("—");
    expect(
      within(entry(rowsOf(winner.getByRole("table")), 0)).getByRole("link", { name: "Open" }),
    ).toHaveAttribute("href", `/runs/${entry(WINNER.cases, 0).run_id}`);
    expect(second.getByText("openrouter/acme/large")).toBeVisible();
    expect(second.getByText(/1 of 2 passed/)).toBeVisible();
    expect(rowsOf(second.getByRole("table")).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Passed"),
      expect.stringContaining("Failed"),
    ]);
  });

  it("hides a restricted experiment's cases until they are shown", async () => {
    renderAt(<App />, {
      path: `/experiments/${EXPERIMENT_ID}`,
      answers: {
        ...ANSWERS,
        [EXPERIMENT_PATH]: [200, { ...EXPERIMENT, sensitivity: "restricted" }],
      },
    });

    const winner = within(await screen.findByRole("region", { name: "Rank 1" }));

    expect(winner.queryByRole("table")).toBeNull();
    expect(winner.getByText("openrouter/acme/small")).toBeVisible();

    fireEvent.click(winner.getByRole("button", { name: "Show it" }));

    expect(winner.getByRole("table")).toBeVisible();
  });

  it("says when a candidate's runs are no longer kept", async () => {
    renderAt(<App />, {
      path: `/experiments/${EXPERIMENT_ID}`,
      answers: {
        ...ANSWERS,
        [EXPERIMENT_PATH]: [200, { ...EXPERIMENT, candidates: [{ ...WINNER, steps: [] }] }],
      },
    });

    const winner = within(await screen.findByRole("region", { name: "Rank 1" }));

    expect(
      winner.getByText("Its runs are no longer kept, so the models it ran on can’t be told."),
    ).toBeVisible();
  });

  it("says when there is no experiment at its address", async () => {
    renderAt(<App />, {
      path: "/experiments/e9000000-0000-4000-8000-000000000009",
      answers: ANSWERS,
    });

    expect(await screen.findByText("No experiment at this address")).toBeVisible();
  });
});

describe("an experiment's winner, compared", () => {
  async function comparison() {
    return within(await screen.findByRole("region", { name: "Comparison" }));
  }

  function cells(row: HTMLElement): (string | null)[] {
    return within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
  }

  it("is compared with what production runs, step by step", async () => {
    renderAt(<App />, { path: `/experiments/${EXPERIMENT_ID}`, answers: ANSWERS });

    const compared = await comparison();

    expect(
      await compared.findByRole("heading", { name: "The winner against production" }),
    ).toBeVisible();

    const steps = compared.getByRole("table", { name: "Steps that changed" });

    expect(within(steps).getByRole("columnheader", { name: "Production" })).toBeVisible();
    expect(cells(entry(rowsOf(steps), 0))).toEqual([
      "d1000000",
      "openrouter/acme/large",
      "openrouter/acme/small",
    ]);
  });

  it("shows each case on both sides", async () => {
    renderAt(<App />, { path: `/experiments/${EXPERIMENT_ID}`, answers: ANSWERS });

    const compared = await comparison();
    const cases = rowsOf(await compared.findByRole("table", { name: "Cases on both sides" }));

    expect(cases.map(cells)).toEqual([
      ["c1000000", "Passed, scoring 1.00", "Passed, scoring 1.00"],
      ["c1000000", "Failed", "Passed, scoring 1.00"],
    ]);
  });

  it("shows what each side costs and takes per run, and what the winner saves", async () => {
    renderAt(<App />, { path: `/experiments/${EXPERIMENT_ID}`, answers: ANSWERS });

    const compared = await comparison();

    expect(
      await compared.findByText("Measured over 2 runs of the winner and 2 of production."),
    ).toBeVisible();

    const rows = rowsOf(compared.getByRole("table", { name: "Per run" }));

    expect(cells(entry(rows, 0))).toEqual(["$0.05", "$0.01", "Saves $0.04 (80%)"]);
    expect(cells(entry(rows, 1))).toEqual(["5.0 s", "2.5 s", "Saves 2.5 s (50%)"]);
  });

  it("says a winner that costs more costs more", async () => {
    renderAt(<App />, {
      path: `/experiments/${EXPERIMENT_ID}`,
      answers: {
        ...ANSWERS,
        [`${EXPERIMENT_PATH}/compare`]: [
          200,
          {
            ...COMPARED,
            winner_runs: { runs: 2, cost_usd: 0.06, latency_seconds: 5 },
            savings: { cost_usd: -0.01, cost_percent: -20, latency_seconds: 0, latency_percent: 0 },
          },
        ],
      },
    });

    const compared = await comparison();

    expect(await compared.findByText("Costs $0.01 more (20%)")).toBeVisible();
    expect(compared.getByText("Takes as long")).toBeVisible();
  });

  it("labels the 30-day saving as a projection", async () => {
    renderAt(<App />, { path: `/experiments/${EXPERIMENT_ID}`, answers: ANSWERS });

    const projection = within(
      await (await comparison()).findByRole("region", { name: "Projection" }),
    );

    expect(projection.getByText(/A projection from production’s recent invocations/)).toBeVisible();
    expect(
      projection.getByText(
        "Over production’s 120 invocations in the last 30 days, the winner would have saved $4.80 and 5 min of waiting.",
      ),
    ).toBeVisible();
  });

  it("is compared with the configured candidate when production runs none of its candidates", async () => {
    renderAt(<App />, {
      path: `/experiments/${EXPERIMENT_ID}`,
      answers: {
        ...ANSWERS,
        [`${EXPERIMENT_PATH}/compare`]: [
          200,
          { ...COMPARED, baseline: "configured", baseline_candidate: CONFIGURED, projection: null },
        ],
      },
    });

    const compared = await comparison();

    expect(
      await compared.findByRole("heading", {
        name: "The winner against the workflow as configured",
      }),
    ).toBeVisible();
    expect(
      within(compared.getByRole("table", { name: "Steps that changed" })).getByRole(
        "columnheader",
        { name: "Configured" },
      ),
    ).toBeVisible();
    expect(compared.queryByRole("region", { name: "Projection" })).toBeNull();
  });

  it("says why there is nothing to compare", async () => {
    renderAt(<App />, {
      path: `/experiments/${EXPERIMENT_ID}`,
      answers: { ...ANSWERS, [`${EXPERIMENT_PATH}/compare`]: [200, NOTHING_COMPARED] },
    });

    const compared = await comparison();

    expect(await compared.findByText("Production already runs the winner.")).toBeVisible();
    expect(compared.queryByRole("table")).toBeNull();
  });

  it("says when no step's model changed", async () => {
    renderAt(<App />, {
      path: `/experiments/${EXPERIMENT_ID}`,
      answers: {
        ...ANSWERS,
        [`${EXPERIMENT_PATH}/compare`]: [
          200,
          {
            ...COMPARED,
            steps: COMPARED.steps.map((step) => ({
              ...step,
              baseline_model: step.winner_model,
              differs: false,
            })),
          },
        ],
      },
    });

    const compared = await comparison();

    expect(await compared.findByText("No step’s model changed.")).toBeVisible();
    expect(compared.queryByRole("table", { name: "Steps that changed" })).toBeNull();
  });

  it("hides a restricted experiment's cases on both sides until they are shown", async () => {
    renderAt(<App />, {
      path: `/experiments/${EXPERIMENT_ID}`,
      answers: {
        ...ANSWERS,
        [EXPERIMENT_PATH]: [200, { ...EXPERIMENT, sensitivity: "restricted" }],
      },
    });

    const compared = await comparison();

    await compared.findByRole("table", { name: "Per run" });
    expect(compared.queryByRole("table", { name: "Cases on both sides" })).toBeNull();
  });

  it("says when the winner couldn't be compared", async () => {
    renderAt(<App />, {
      path: `/experiments/${EXPERIMENT_ID}`,
      answers: {
        ...ANSWERS,
        [`${EXPERIMENT_PATH}/compare`]: [
          500,
          { error: { code: "internal", message: "The store is unreachable." } },
        ],
      },
    });

    const compared = await comparison();

    expect(await compared.findByText("Couldn't compare the winner")).toBeVisible();
    expect(compared.getByText("The store is unreachable.")).toBeVisible();
  });
});
