import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import type { RevisionComparison } from "../api/types";
import {
  BENCHMARK_DETAIL,
  TOOL_DETAIL,
  WORKFLOW_DETAIL,
  WORKFLOW_HISTORY,
} from "../test/documents";
import { SERVER, type Answers } from "../test/instances";
import { renderAt } from "../test/render";

const WORKFLOW_PATH = `/api/workflows/${WORKFLOW_DETAIL.id}`;

function revision(number: number): RevisionComparison["before"] {
  const found = WORKFLOW_HISTORY.find((entry) => entry.revision.number === number);

  if (found === undefined) {
    throw new Error(`The history has no revision ${String(number)}.`);
  }

  return found.revision;
}

const CHANGED: RevisionComparison = {
  before: revision(2),
  after: revision(3),
  identical: false,
  changes: [
    {
      kind: "changed",
      pointer: "/metadata/description",
      before: "Review a text.",
      after: "Review a text closely.",
      withheld: false,
    },
    { kind: "added", pointer: "/steps/1", before: null, after: { id: "step" }, withheld: false },
    {
      kind: "removed",
      pointer: "/result",
      before: { name: "review" },
      after: null,
      withheld: false,
    },
  ],
};

const IDENTICAL: RevisionComparison = {
  before: revision(1),
  after: revision(2),
  identical: true,
  changes: [],
};

const ANSWERS: Answers = {
  ...SERVER,
  [WORKFLOW_PATH]: [200, WORKFLOW_DETAIL],
  [`${WORKFLOW_PATH}/history?limit=100`]: [200, { items: WORKFLOW_HISTORY }],
  [`${WORKFLOW_PATH}/diff?before=2&after=3`]: [200, CHANGED],
  [`${WORKFLOW_PATH}/diff?before=1&after=2`]: [200, IDENTICAL],
};

/** Returns one entry of a list, failing the test if there is none at that place. */
function entryOf(entries: readonly HTMLElement[], index: number): HTMLElement {
  const found = entries[index];

  if (found === undefined) {
    throw new Error(`The list has no entry ${String(index)}.`);
  }

  return found;
}

function comparing(search = "", answers: Answers = ANSWERS): void {
  renderAt(<App />, { path: `/workflows/${WORKFLOW_DETAIL.id}/diff${search}`, answers });
}

describe("comparing two revisions", () => {
  it("compares the latest revision with the one before it, a line for each change", async () => {
    comparing();

    const changes = await screen.findByRole("region", { name: "Changes" });
    const items = within(changes).getAllByRole("listitem");

    expect(changes).toHaveTextContent("3 values differ");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(
      '/metadata/description"Review a text." → "Review a text closely."',
    );
    expect(within(entryOf(items, 0)).getByRole("img", { name: "Changed" })).toHaveTextContent("~");
    expect(within(entryOf(items, 1)).getByRole("img", { name: "Added" })).toHaveTextContent("+");
    expect(items[1]).toHaveTextContent('/steps/1{"id":"step"}');
    expect(within(entryOf(items, 2)).getByRole("img", { name: "Removed" })).toHaveTextContent("-");
    expect(items[2]).toHaveTextContent('/result{"name":"review"}');
  });

  it("names both revisions, and shows the command that prints the same comparison", async () => {
    comparing();

    expect(await screen.findByLabelText("From revision")).toHaveValue("2");
    expect(screen.getByLabelText("To revision")).toHaveValue("3");
    expect(
      screen.getByText(`azathoth workflow diff ${WORKFLOW_DETAIL.id} 2 3`),
    ).toBeInTheDocument();
  });

  it("says two revisions with the same content are identical", async () => {
    comparing("?before=1&after=2");

    expect(await screen.findByText("Revisions 1 and 2 are identical.")).toBeVisible();
  });

  it("compares the revisions chosen, keeping them in the address", async () => {
    comparing();

    fireEvent.change(await screen.findByLabelText("From revision"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("To revision"), { target: { value: "2" } });

    expect(await screen.findByText("Revisions 1 and 2 are identical.")).toBeVisible();
    expect(screen.getByLabelText("From revision")).toHaveValue("1");
  });

  it("says where a restricted case's values are withheld", async () => {
    comparing("", {
      ...ANSWERS,
      [`${WORKFLOW_PATH}/diff?before=2&after=3`]: [
        200,
        {
          ...CHANGED,
          changes: [
            {
              kind: "changed",
              pointer: "/cases/0/input",
              before: null,
              after: null,
              withheld: true,
            },
          ],
        },
      ],
    });

    expect(await screen.findByText("Some values are withheld")).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Changes" })).getByRole("listitem"),
    ).toHaveTextContent("withheld, restricted → withheld, restricted");
  });

  it("says why it couldn't compare", async () => {
    comparing("?before=1&after=9", {
      ...ANSWERS,
      [`${WORKFLOW_PATH}/diff?before=1&after=9`]: [
        404,
        {
          error: {
            code: "revision_not_found",
            message: `Workflow ${WORKFLOW_DETAIL.id} has no revision 9.`,
          },
        },
      ],
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("has no revision 9.");
  });

  it("compares one exact version of a tool, and a benchmark", async () => {
    const toolPath = `/api/tools/${TOOL_DETAIL.id}/versions/1.0.0`;
    const benchmarkPath = `/api/benchmarks/${BENCHMARK_DETAIL.id}`;
    const answers: Answers = {
      ...SERVER,
      [toolPath]: [200, TOOL_DETAIL],
      [`${toolPath}/diff?before=1&after=1`]: [
        200,
        { ...IDENTICAL, before: revision(1), after: revision(1) },
      ],
      [benchmarkPath]: [200, BENCHMARK_DETAIL],
      [`${benchmarkPath}/diff?before=1&after=1`]: [
        200,
        { ...IDENTICAL, before: revision(1), after: revision(1) },
      ],
    };

    const tool = renderAt(<App />, {
      path: `/tools/${TOOL_DETAIL.id}/versions/1.0.0/diff`,
      answers,
    });

    expect(await screen.findByText("Revisions 1 and 1 are identical.")).toBeVisible();
    expect(
      screen.getByText(`azathoth tool diff ${TOOL_DETAIL.id} 1 1 --version 1.0.0`),
    ).toBeInTheDocument();

    tool.unmount();
    renderAt(<App />, { path: `/benchmarks/${BENCHMARK_DETAIL.id}/diff`, answers });

    expect(
      await screen.findByText(`azathoth benchmark diff ${BENCHMARK_DETAIL.id} 1 1`),
    ).toBeInTheDocument();
  });
});

describe("a revision's page", () => {
  it("links to a comparison with the revision before it", async () => {
    renderAt(<App />, { path: `/workflows/${WORKFLOW_DETAIL.id}`, answers: ANSWERS });

    expect(await screen.findByRole("link", { name: "Compare with revision 2" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW_DETAIL.id}/diff?before=2&after=3`,
    );
  });

  it("has nothing to compare a first revision with", async () => {
    renderAt(<App />, {
      path: `/benchmarks/${BENCHMARK_DETAIL.id}/document`,
      answers: {
        ...SERVER,
        [`/api/benchmarks/${BENCHMARK_DETAIL.id}`]: [200, BENCHMARK_DETAIL],
        [`/api/benchmarks/${BENCHMARK_DETAIL.id}/history?limit=100`]: [
          200,
          { items: [BENCHMARK_DETAIL] },
        ],
      },
    });

    expect(await screen.findByRole("link", { name: "Download" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Compare with revision/ })).toBeNull();
  });
});
