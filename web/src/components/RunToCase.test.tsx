import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { ADDED, RUN_CASE } from "../test/benchmarks";
import { BAD_JUDGMENT, GOOD_JUDGMENT } from "../test/evidence";
import { BENCHMARK, SERVER, WORKFLOW, type Answers } from "../test/instances";
import { recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";
import { RUN_DETAIL, RUN_WORKFLOW } from "../test/runs";
import { RunPage } from "./RunPage";

const RUN_PATH = `/api/runs/${RUN_DETAIL.run_id}`;
const CASES_PATH = `/api/benchmarks/${BENCHMARK.id}/cases`;

/** A second benchmark, to choose between. */
const OTHER = { ...BENCHMARK, id: "b1000000-0000-4000-8000-000000000002", name: "summaries" };

const ANSWERS: Answers = {
  ...SERVER,
  "/api/benchmarks": [200, { items: [BENCHMARK, OTHER] }],
  [RUN_PATH]: [200, RUN_DETAIL],
  [`${RUN_PATH}/feedback`]: [200, { items: [BAD_JUDGMENT, GOOD_JUDGMENT] }],
  [`/api/workflows/${WORKFLOW.id}?revision=3`]: [200, RUN_WORKFLOW],
};

function open(answers: Answers, posts: Answers = {}, sent: Sent[] = []) {
  renderAt(
    <Routes>
      <Route path="/runs/:runId" element={<RunPage />} />
    </Routes>,
    { path: `/runs/${RUN_DETAIL.run_id}`, fetcher: recording(answers, posts, sent) },
  );
}

async function section(): Promise<HTMLElement> {
  const found = await screen.findByRole("region", { name: "Add to a benchmark" });

  await within(found).findByRole("form", { name: "Add this run to a benchmark" });

  return found;
}

function posted(sent: readonly Sent[]): Sent[] {
  return sent.filter((request) => request.method === "POST");
}

describe("a run made a case", () => {
  it("expects the run's latest correction unless a value is given", async () => {
    const sent: Sent[] = [];

    open(ANSWERS, { [CASES_PATH]: [201, ADDED] }, sent);
    const add = within(await section());

    expect(add.getByRole("radio", { name: "Its latest correction" })).toBeChecked();
    expect(add.queryByLabelText("Expected")).toBeNull();
    expect(add.getByText(/keeps the run’s label/)).toHaveTextContent("Internal");

    fireEvent.change(add.getByLabelText("Comparison"), { target: { value: "semantic" } });
    fireEvent.click(add.getByRole("button", { name: "Add to benchmark" }));

    expect(await add.findByRole("link", { name: "Open the case" })).toHaveAttribute(
      "href",
      `/benchmarks/${BENCHMARK.id}/cases/${RUN_CASE.case_id}`,
    );
    expect(add.getByText(/Added to word count/)).toBeVisible();
    expect(posted(sent)).toEqual([
      {
        method: "POST",
        path: CASES_PATH,
        body: { run_id: RUN_DETAIL.run_id, comparison: "semantic" },
      },
    ]);
  });

  it("sends a value given instead, and a description, to the benchmark chosen", async () => {
    const sent: Sent[] = [];
    const otherCases = `/api/benchmarks/${OTHER.id}/cases`;

    open(ANSWERS, { [otherCases]: [201, ADDED] }, sent);
    const add = within(await section());

    fireEvent.change(add.getByLabelText("Benchmark"), { target: { value: OTHER.id } });
    fireEvent.click(add.getByRole("radio", { name: "A value I give" }));
    fireEvent.change(add.getByLabelText("Expected"), { target: { value: "nope" } });

    expect(add.getByRole("button", { name: "Add to benchmark" })).toBeDisabled();

    fireEvent.change(add.getByLabelText("Expected"), { target: { value: '"A fire."' } });
    fireEvent.change(add.getByLabelText("Description"), { target: { value: "Says fire." } });
    fireEvent.click(add.getByRole("button", { name: "Add to benchmark" }));

    await waitFor(() => {
      expect(posted(sent)).toEqual([
        {
          method: "POST",
          path: otherCases,
          body: {
            run_id: RUN_DETAIL.run_id,
            comparison: "exact",
            expected: "A fire.",
            description: "Says fire.",
          },
        },
      ]);
    });
  });

  it("asks for a value when the run has no correction", async () => {
    open({ ...ANSWERS, [`${RUN_PATH}/feedback`]: [200, { items: [GOOD_JUDGMENT] }] });
    const add = within(await section());

    expect(add.queryByRole("radio", { name: "Its latest correction" })).toBeNull();
    expect(
      add.getByText("It has no correction to expect, so give the value it should."),
    ).toBeVisible();
    expect(add.getByLabelText("Expected")).toBeVisible();
    expect(add.getByRole("button", { name: "Add to benchmark" })).toBeDisabled();
  });

  it("offers to create a benchmark when there is none", async () => {
    open({ ...ANSWERS, "/api/benchmarks": [200, { items: [] }] });

    const found = within(await screen.findByRole("region", { name: "Add to a benchmark" }));

    expect(await found.findByRole("link", { name: "Create a benchmark" })).toHaveAttribute(
      "href",
      "/benchmarks/new",
    );
    expect(found.queryByRole("form")).toBeNull();
  });

  it("passes on what Azathoth refuses", async () => {
    open(ANSWERS, {
      [CASES_PATH]: [
        409,
        { error: { code: "conflict", message: "The benchmark already holds this case." } },
      ],
    });
    const add = within(await section());

    fireEvent.click(add.getByRole("button", { name: "Add to benchmark" }));

    expect(await add.findByText("The benchmark already holds this case.")).toBeVisible();
  });
});
