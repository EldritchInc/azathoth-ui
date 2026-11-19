import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import { CASES, COMPARISON, EXECUTIONS, RUN_EXECUTION } from "../test/benchmarks";
import { BENCHMARK_DETAIL } from "../test/documents";
import { REVIEW_WORKFLOW, SERVER, WORKFLOW, type Answers } from "../test/instances";
import { renderAt } from "../test/render";

const BENCHMARK_PATH = `/api/benchmarks/${BENCHMARK_DETAIL.id}`;
const PAGE = `/benchmarks/${BENCHMARK_DETAIL.id}`;

const ANSWERS: Answers = {
  ...SERVER,
  [BENCHMARK_PATH]: [200, BENCHMARK_DETAIL],
  [`${BENCHMARK_PATH}/history?limit=100`]: [200, { items: [BENCHMARK_DETAIL] }],
  [`${BENCHMARK_PATH}/cases`]: [200, { items: CASES }],
  [`${BENCHMARK_PATH}/executions?limit=20`]: [200, { items: EXECUTIONS }],
  [`/api/benchmark-executions/${COMPARISON.execution_id}`]: [200, COMPARISON],
  [`/api/benchmark-executions/${RUN_EXECUTION.execution_id}`]: [200, RUN_EXECUTION],
};

function rowsOf(table: HTMLElement): HTMLElement[] {
  return within(table).getAllByRole("row").slice(1);
}

function entry<T>(entries: readonly T[], index: number): T {
  const found = entries[index];

  if (found === undefined) {
    throw new Error(`No entry ${String(index)}.`);
  }

  return found;
}

describe("a benchmark's Executions tab", () => {
  it("lists its runs and comparisons, newest first, each workflow's passes", async () => {
    renderAt(<App />, { path: `${PAGE}/executions`, answers: ANSWERS });

    const section = await screen.findByRole("region", { name: "Executions" });
    const table = await within(section).findByRole("table");
    const [comparison, run] = [entry(rowsOf(table), 0), entry(rowsOf(table), 1)];

    expect(within(comparison).getByRole("link", { name: "Comparison" })).toHaveAttribute(
      "href",
      `/benchmark-executions/${COMPARISON.execution_id}`,
    );
    expect(comparison).toHaveTextContent(`${REVIEW_WORKFLOW.name}: 2 of 2 passed, scoring 0.91`);
    expect(comparison).toHaveTextContent(`${WORKFLOW.name}: 1 of 2 passed, scoring 0.55`);
    expect(within(run).getByRole("link", { name: "Benchmark run" })).toBeVisible();
    expect(run).toHaveTextContent(`${WORKFLOW.name}: 1 of 2 passed`);
    expect(run).not.toHaveTextContent("scoring");
    expect(within(run).getByText("Restricted")).toBeVisible();
  });

  it("says when there is none yet", async () => {
    renderAt(<App />, {
      path: `${PAGE}/executions`,
      answers: { ...ANSWERS, [`${BENCHMARK_PATH}/executions?limit=20`]: [200, { items: [] }] },
    });

    expect(
      await screen.findByText(
        "No executions yet. Run or compare workflows against it, and each is kept here.",
      ),
    ).toBeVisible();
  });

  it("is a tab of the benchmark's page", async () => {
    renderAt(<App />, { path: PAGE, answers: ANSWERS });

    fireEvent.click(await screen.findByRole("link", { name: "Executions" }));

    expect(await screen.findByRole("link", { name: "Comparison" })).toBeVisible();
  });
});

describe("an execution's page", () => {
  it("ranks a comparison's workflows with their scorecards and targets", async () => {
    renderAt(<App />, {
      path: `/benchmark-executions/${COMPARISON.execution_id}`,
      answers: ANSWERS,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "word count" })).toBeVisible();
    expect(screen.getByText("Comparison")).toBeVisible();
    expect(screen.getByText("Target latency").nextElementSibling).toHaveTextContent("5 s");
    expect(screen.getByText("Target cost").nextElementSibling).toHaveTextContent("$0.01");
    expect(screen.getByText(COMPARISON.command)).toBeVisible();

    const best = screen.getByRole("region", { name: REVIEW_WORKFLOW.name });

    expect(within(best).getByRole("heading", { level: 2 })).toHaveTextContent(
      `1. ${REVIEW_WORKFLOW.name}`,
    );
    expect(within(best).getByRole("link", { name: REVIEW_WORKFLOW.name })).toHaveAttribute(
      "href",
      `/workflows/${REVIEW_WORKFLOW.id}`,
    );
    expect(best).toHaveTextContent("2 of 2 passed (100%)");
    expect(best).toHaveTextContent("1 judge call, $0.0004");
    expect(best).toHaveTextContent("exact: 1 of 1 · semantic: 0 of 1");

    const card = within(within(best).getByLabelText(`How ${REVIEW_WORKFLOW.name} scored`));

    expect(card.getByText("Latency").nextElementSibling).toHaveTextContent("0.80");
    expect(card.getByText("Citations").nextElementSibling).toHaveTextContent("—");
    expect(within(best).getByText("Every case passed, a little slowly.")).toBeVisible();
    expect(screen.getByRole("region", { name: WORKFLOW.name })).toHaveTextContent(
      `2. ${WORKFLOW.name}`,
    );
  });

  it("hides a restricted execution's results until shown, then each case's", async () => {
    renderAt(<App />, {
      path: `/benchmark-executions/${RUN_EXECUTION.execution_id}`,
      answers: ANSWERS,
    });

    const workflow = within(await screen.findByRole("region", { name: WORKFLOW.name }));

    expect(screen.getByText("Benchmark run")).toBeVisible();
    expect(workflow.queryByRole("table")).toBeNull();
    expect(workflow.getByRole("heading", { level: 2 })).toHaveTextContent(WORKFLOW.name);
    expect(workflow.getByRole("heading", { level: 2 })).not.toHaveTextContent("1.");

    fireEvent.click(workflow.getByRole("button", { name: "Show it" }));
    await workflow.findByText("Eight words.");

    const [first, second] = [
      entry(rowsOf(workflow.getByRole("table")), 0),
      entry(rowsOf(workflow.getByRole("table")), 1),
    ];

    expect(first).toHaveTextContent("Eight words.");
    expect(first).toHaveTextContent("Passed");
    expect(first).toHaveTextContent("1.00");
    expect(first).toHaveTextContent("It matched.");
    expect(within(first).getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/runs/a1000000-0000-4000-8000-000000000101",
    );
    expect(second).toHaveTextContent("The summary the run should have written.");
    expect(second).toHaveTextContent("Failed");
    expect(second).toHaveTextContent("No longer kept");
    expect(screen.getByRole("link", { name: "word count" })).toHaveAttribute(
      "href",
      `${PAGE}/executions`,
    );
  });

  it("shows a run's failure apart from a failed comparison", async () => {
    const failing = {
      ...COMPARISON,
      sensitivity: "internal",
      candidates: COMPARISON.candidates.map((candidate) => ({
        ...candidate,
        run_failures: 1,
        cases: candidate.cases.map((result) => ({ ...result, passed: false, run_failure: true })),
      })),
    };

    renderAt(<App />, {
      path: `/benchmark-executions/${COMPARISON.execution_id}`,
      answers: {
        ...ANSWERS,
        [`/api/benchmark-executions/${COMPARISON.execution_id}`]: [200, failing],
      },
    });

    const best = within(await screen.findByRole("region", { name: REVIEW_WORKFLOW.name }));

    expect(best.getAllByText("Run failed")).toHaveLength(2);
    expect(best.getByText(/1 run failed/)).toBeVisible();
  });

  it("says when there is no execution at its address", async () => {
    renderAt(<App />, {
      path: "/benchmark-executions/e9000000-0000-4000-8000-000000000009",
      answers: ANSWERS,
    });

    expect(await screen.findByText("No execution at this address")).toBeVisible();
  });
});
