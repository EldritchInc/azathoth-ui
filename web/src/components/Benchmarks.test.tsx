import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import { ALLOWED, type Action, type Permissions } from "../permissions";
import {
  ADDED,
  CASES,
  JSON_CASE,
  JSON_CASE_DETAIL,
  RUN_CASE,
  RUN_CASE_DETAIL,
} from "../test/benchmarks";
import { BENCHMARK_DETAIL } from "../test/documents";
import { SERVER, type Answers } from "../test/instances";
import { recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";

const BENCHMARK_PATH = `/api/benchmarks/${BENCHMARK_DETAIL.id}`;
const PAGE = `/benchmarks/${BENCHMARK_DETAIL.id}`;

const ANSWERS: Answers = {
  ...SERVER,
  [BENCHMARK_PATH]: [200, BENCHMARK_DETAIL],
  [`${BENCHMARK_PATH}/history?limit=100`]: [200, { items: [BENCHMARK_DETAIL] }],
  [`${BENCHMARK_PATH}/cases`]: [200, { items: CASES }],
  [`${BENCHMARK_PATH}/cases/${JSON_CASE.case_id}`]: [200, JSON_CASE_DETAIL],
  [`${BENCHMARK_PATH}/cases/${RUN_CASE.case_id}`]: [200, RUN_CASE_DETAIL],
};

/** What adding or changing the JSON case answers. */
const JSON_CHANGE = { case: JSON_CASE_DETAIL, benchmark: ADDED.benchmark };

function rowsOf(region: HTMLElement): HTMLElement[] {
  return within(region).getAllByRole("row").slice(1);
}

function only<T>(entries: readonly T[], index: number): T {
  const found = entries[index];

  if (found === undefined) {
    throw new Error(`No entry ${String(index)}.`);
  }

  return found;
}

/** Permissions that refuse one action, and allow every other. */
function refusing(refused: Action): Permissions {
  return (_instance, action) =>
    action === refused ? { allowed: false, reason: "The policy doesn't allow it." } : ALLOWED;
}

describe("a benchmark's Cases tab", () => {
  it("lists each case with where it came from, how it is compared and its label", async () => {
    renderAt(<App />, { path: PAGE, answers: ANSWERS });

    const cases = await screen.findByRole("region", { name: "Cases" });

    await within(cases).findByText("2 cases");
    const [json, run] = [only(rowsOf(cases), 0), only(rowsOf(cases), 1)];

    expect(within(json).getByRole("link", { name: "Eight words." })).toHaveAttribute(
      "href",
      `${PAGE}/cases/${JSON_CASE.case_id}`,
    );
    expect(json).toHaveTextContent("JSON");
    expect(json).toHaveTextContent("exact");
    expect(json).toHaveTextContent("No");
    expect(within(run).getByRole("link", { name: "A run" })).toHaveAttribute(
      "href",
      `/runs/${RUN_CASE.source_run_id ?? ""}`,
    );
    expect(run).toHaveTextContent("semantic");
    expect(run).toHaveTextContent("Yes");
    expect(within(run).getByText("Restricted")).toBeVisible();
    expect(within(cases).getByRole("link", { name: "Add case" })).toHaveAttribute(
      "href",
      `${PAGE}/cases/new`,
    );
    expect(screen.getByRole("navigation", { name: "Benchmark" })).toBeVisible();
  });

  it("says a benchmark with no cases can't be run yet", async () => {
    renderAt(<App />, {
      path: PAGE,
      answers: { ...ANSWERS, [`${BENCHMARK_PATH}/cases`]: [200, { items: [] }] },
    });

    expect(
      await screen.findByText("No cases yet. A benchmark can’t be run until it has one."),
    ).toBeVisible();
  });

  it("moves to the document, with its revisions, on its own tab", async () => {
    renderAt(<App />, { path: PAGE, answers: ANSWERS });

    await screen.findByText("2 cases");
    fireEvent.click(screen.getByRole("link", { name: "Document" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Cases" })).toHaveTextContent(
        "that is not dead which can eternal lie",
      );
    });
  });
});

describe("a new benchmark", () => {
  it("is offered on the Benchmarks list", async () => {
    renderAt(<App />, { path: "/benchmarks", answers: ANSWERS });

    expect(await screen.findByRole("link", { name: "New benchmark" })).toHaveAttribute(
      "href",
      "/benchmarks/new",
    );
  });

  it("is created from a name and a description, and opens", async () => {
    const sent: Sent[] = [];

    renderAt(<App />, {
      path: "/benchmarks/new",
      fetcher: recording(
        ANSWERS,
        { "/api/benchmarks": [201, { created: true, benchmark: BENCHMARK_DETAIL }] },
        sent,
      ),
    });

    const create = await screen.findByRole("button", { name: "Create benchmark" });

    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " word count " } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Count the words." },
    });
    fireEvent.click(create);

    expect(await screen.findByRole("region", { name: "Cases" })).toBeVisible();
    expect(sent.filter((each) => each.method === "POST")).toEqual([
      {
        method: "POST",
        path: "/api/benchmarks",
        body: { name: "word count", description: "Count the words." },
      },
    ]);
  });

  it("can't be created where the policy refuses edit_benchmark", async () => {
    renderAt(<App />, {
      path: "/benchmarks/new",
      answers: ANSWERS,
      permissions: refusing("edit_benchmark"),
    });

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "word count" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Count." } });

    expect(screen.getByRole("button", { name: "Create benchmark" })).toBeDisabled();
  });
});

describe("adding a case", () => {
  it("sends its input, comparison and expected value, and opens it", async () => {
    const sent: Sent[] = [];

    renderAt(<App />, {
      path: `${PAGE}/cases/new`,
      fetcher: recording(ANSWERS, { [`${BENCHMARK_PATH}/cases`]: [201, JSON_CHANGE] }, sent),
    });

    const add = await screen.findByRole("button", { name: "Add case" });

    fireEvent.change(screen.getByLabelText("The case's input, as text"), {
      target: { value: "that is not dead which can eternal lie" },
    });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Comparison"), { target: { value: "normalized" } });
    expect(
      screen.getByText("Its output must equal what is expected once both are normalized."),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Expected"), { target: { value: "eight" } });
    expect(add).toBeDisabled();
    expect(screen.getByText(/^This isn’t JSON yet/)).toBeVisible();

    fireEvent.change(screen.getByLabelText("Expected"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Eight words." } });
    fireEvent.click(add);

    expect(await screen.findByRole("heading", { level: 1, name: "Eight words." })).toBeVisible();
    expect(sent.filter((each) => each.method === "POST")).toEqual([
      {
        method: "POST",
        path: `${BENCHMARK_PATH}/cases`,
        body: {
          input: "that is not dead which can eternal lie",
          comparison: "normalized",
          expected: 8,
          description: "Eight words.",
        },
      },
    ]);
  });

  it("passes on what Azathoth refuses", async () => {
    renderAt(<App />, {
      path: `${PAGE}/cases/new`,
      fetcher: recording(
        ANSWERS,
        {
          [`${BENCHMARK_PATH}/cases`]: [
            409,
            { error: { code: "conflict", message: "The benchmark already holds this case." } },
          ],
        },
        [],
      ),
    });

    fireEvent.change(await screen.findByLabelText("The case's input, as text"), {
      target: { value: "one" },
    });
    fireEvent.change(screen.getByLabelText("Expected"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add case" }));

    expect(await screen.findByText("The benchmark already holds this case.")).toBeVisible();
  });
});

describe("a case's page", () => {
  it("shows its input, what it expects, and its command", async () => {
    renderAt(<App />, { path: `${PAGE}/cases/${JSON_CASE.case_id}`, answers: ANSWERS });

    expect(await screen.findByRole("heading", { level: 1, name: "Eight words." })).toBeVisible();
    expect(screen.getByRole("region", { name: "Input" })).toHaveTextContent(
      "that is not dead which can eternal lie",
    );
    expect(screen.getByRole("region", { name: "Expected" })).toHaveTextContent("8");
    expect(screen.getByText("Its run need not cite anything.")).toBeVisible();
    expect(screen.getByText(JSON_CASE.command)).toBeVisible();
    expect(screen.getByRole("link", { name: "word count" })).toHaveAttribute("href", PAGE);
  });

  it("hides a restricted case until it is shown, and lists what its run must cite", async () => {
    renderAt(<App />, { path: `${PAGE}/cases/${RUN_CASE.case_id}`, answers: ANSWERS });

    const input = await screen.findByRole("region", { name: "Input" });

    expect(input).not.toHaveTextContent("east wing");
    expect(screen.getByRole("link", { name: "A run" })).toHaveAttribute(
      "href",
      `/runs/${RUN_CASE.source_run_id ?? ""}`,
    );
    expect(screen.getByRole("list", { name: "Required citations" })).toHaveTextContent(
      "report · p1",
    );
    expect(screen.getByText("A citation that doesn’t verify fails the case.")).toBeVisible();

    fireEvent.click(within(input).getByRole("button", { name: "Show it" }));

    expect(input).toHaveTextContent("east wing");
    expect(screen.getByRole("region", { name: "Expected" })).toHaveTextContent(
      "A fire spread east.",
    );
  });

  it("is edited by sending only what changed, its label only raised", async () => {
    const sent: Sent[] = [];
    const path = `${BENCHMARK_PATH}/cases/${JSON_CASE.case_id}`;

    renderAt(<App />, {
      path: `${PAGE}/cases/${JSON_CASE.case_id}`,
      fetcher: recording(ANSWERS, { [path]: [200, JSON_CHANGE] }, sent),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    const form = within(screen.getByRole("form", { name: "Edit case" }));
    const labels = within(form.getByRole("radiogroup", { name: "The case's label" }));

    expect(labels.queryByRole("radio", { name: "Public" })).toBeNull();
    expect(labels.getByRole("radio", { name: "Internal" })).toBeChecked();
    expect(form.getByRole("button", { name: "Save changes" })).toBeDisabled();

    fireEvent.change(form.getByLabelText("Comparison"), { target: { value: "semantic" } });
    fireEvent.click(labels.getByRole("radio", { name: "Restricted" }));
    fireEvent.click(form.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.queryByRole("form", { name: "Edit case" })).toBeNull();
    });
    expect(sent.filter((each) => each.method === "POST")).toEqual([
      { method: "POST", path, body: { comparison: "semantic", sensitivity: "restricted" } },
    ]);
  });

  it("stops requiring citations once they are emptied", async () => {
    const sent: Sent[] = [];
    const path = `${BENCHMARK_PATH}/cases/${RUN_CASE.case_id}`;

    renderAt(<App />, {
      path: `${PAGE}/cases/${RUN_CASE.case_id}`,
      fetcher: recording(ANSWERS, { [path]: [200, ADDED] }, sent),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(only(screen.getAllByRole("button", { name: "Show it" }), 0));

    const form = within(screen.getByRole("form", { name: "Edit case" }));

    fireEvent.change(form.getByLabelText("Citations"), { target: { value: "" } });
    fireEvent.click(form.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(sent.filter((each) => each.method === "POST")).toEqual([
        { method: "POST", path, body: { citations: null } },
      ]);
    });
  });

  it("is removed once it is confirmed, naming the instance", async () => {
    const sent: Sent[] = [];
    const path = `${BENCHMARK_PATH}/cases/${JSON_CASE.case_id}/remove`;

    renderAt(<App />, {
      path: `${PAGE}/cases/${JSON_CASE.case_id}`,
      fetcher: recording(ANSWERS, { [path]: [200, JSON_CHANGE] }, sent),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    const confirm = within(screen.getByRole("group", { name: "Remove case" }));

    expect(
      confirm.getByText("Remove this case from word count on your local instance?"),
    ).toBeVisible();
    expect(sent.some((each) => each.method === "POST")).toBe(false);

    fireEvent.click(confirm.getByRole("button", { name: "Remove it" }));

    expect(await screen.findByRole("region", { name: "Cases" })).toBeVisible();
    expect(sent.filter((each) => each.method === "POST")).toEqual([
      { method: "POST", path, body: {} },
    ]);
  });

  it("can't be changed at an earlier revision", async () => {
    renderAt(<App />, {
      path: `${PAGE}/cases/${JSON_CASE.case_id}?revision=1`,
      answers: {
        ...ANSWERS,
        [`${BENCHMARK_PATH}/cases/${JSON_CASE.case_id}?revision=1`]: [
          200,
          { ...JSON_CASE_DETAIL, revision: 1 },
        ],
      },
    });

    expect(await screen.findByText("This is the case at revision 1")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("says when there is no case at its address", async () => {
    renderAt(<App />, {
      path: `${PAGE}/cases/c9000000-0000-4000-8000-000000000009`,
      answers: ANSWERS,
    });

    expect(await screen.findByText("No case at this address")).toBeVisible();
  });
});
