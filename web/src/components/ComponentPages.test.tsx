import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import { saveDraft } from "../drafts";
import {
  BENCHMARK_DETAIL,
  TOOL_DETAIL,
  WORKFLOW_DETAIL,
  WORKFLOW_HISTORY,
} from "../test/documents";
import { EDITOR, SERVER, type Answers } from "../test/instances";
import { renderAt } from "../test/render";

const WORKFLOW_PATH = `/api/workflows/${WORKFLOW_DETAIL.id}`;

const FIRST_REVISION = {
  ...WORKFLOW_DETAIL,
  revision: WORKFLOW_HISTORY[2]?.revision ?? WORKFLOW_DETAIL.revision,
  command: `azathoth workflow show ${WORKFLOW_DETAIL.id} --revision 1`,
};

const ANSWERS: Answers = {
  ...SERVER,
  [WORKFLOW_PATH]: [200, WORKFLOW_DETAIL],
  [`${WORKFLOW_PATH}?revision=1`]: [200, FIRST_REVISION],
  [`${WORKFLOW_PATH}/history?limit=100`]: [200, { items: WORKFLOW_HISTORY }],
  [`/api/tools/${TOOL_DETAIL.id}/versions/1.0.0`]: [200, TOOL_DETAIL],
  [`/api/tools/${TOOL_DETAIL.id}/history?limit=100&version=1.0.0`]: [200, { items: [TOOL_DETAIL] }],
  [`/api/benchmarks/${BENCHMARK_DETAIL.id}`]: [200, BENCHMARK_DETAIL],
  [`/api/benchmarks/${BENCHMARK_DETAIL.id}/history?limit=100`]: [
    200,
    { items: [BENCHMARK_DETAIL] },
  ],
};

function workflowPage(search = ""): void {
  renderAt(<App />, { path: `/workflows/${WORKFLOW_DETAIL.id}${search}`, answers: ANSWERS });
}

describe("a workflow's page", () => {
  it("offers to run it", async () => {
    workflowPage();

    expect(await screen.findByRole("link", { name: "Run" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW_DETAIL.id}/run`,
    );
  });

  it("offers to edit it", async () => {
    workflowPage();

    expect(await screen.findByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW_DETAIL.id}/edit`,
    );
    expect(screen.queryByText("Your unsaved edits are kept.")).toBeNull();
  });

  it("offers to go on editing it when its edits are kept", async () => {
    saveDraft(window.localStorage, WORKFLOW_DETAIL.id, { document: {}, base: 3 });
    workflowPage();

    expect(await screen.findByRole("link", { name: "Continue editing" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW_DETAIL.id}/edit`,
    );
    expect(screen.getByText("Your unsaved edits are kept.")).toBeVisible();
  });

  it("shows its name, description, version, revision and digest", async () => {
    workflowPage();

    expect(await screen.findByRole("heading", { level: 1, name: "summarize" })).toBeVisible();
    expect(screen.getByText("Summarize a text in one sentence.")).toBeVisible();
    expect(screen.getByText("3 of 3")).toBeVisible();
    const digest = WORKFLOW_DETAIL.revision.content_digest;

    expect(screen.getByText(digest.slice(0, 12))).toHaveAttribute("title", digest);
    expect(screen.queryByText("This is revision 3")).toBeNull();
  });

  it("links back to the list it belongs to", async () => {
    workflowPage();
    const crumbs = await screen.findByRole("navigation", { name: "Breadcrumb" });

    expect(within(crumbs).getByRole("link", { name: "Workflows" })).toHaveAttribute(
      "href",
      "/workflows",
    );
  });

  it("shows the command for exactly this revision, on the editor's database", async () => {
    workflowPage();
    await screen.findByRole("heading", { level: 1, name: "summarize" });

    expect(await screen.findByText(EDITOR.command_prefix.trim())).toBeVisible();
    expect(screen.getByText(WORKFLOW_DETAIL.command)).toBeVisible();
  });

  it("shows its steps and its document", async () => {
    workflowPage();

    expect(await screen.findByRole("heading", { level: 2, name: "Steps" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Review security" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Document" })).toBeVisible();
  });

  it("lists every revision, marking the one shown and the latest", async () => {
    workflowPage();
    const history = await screen.findByRole("navigation", { name: "Revisions" });
    const links = await within(history).findAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Revision 3latest"),
      expect.stringContaining("same as 1"),
      expect.stringContaining("Revision 1"),
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[0]).toHaveAttribute("href", `/workflows/${WORKFLOW_DETAIL.id}`);
    expect(links[2]).toHaveAttribute("href", `/workflows/${WORKFLOW_DETAIL.id}?revision=1`);
  });

  it("opens an earlier revision from its address, and says how to get to the latest", async () => {
    workflowPage("?revision=1");

    expect(await screen.findByText("This is revision 1")).toBeVisible();
    expect(screen.getByText("1 of 3")).toBeVisible();
    expect(screen.getByText(FIRST_REVISION.command)).toBeVisible();

    fireEvent.click(screen.getByRole("link", { name: "Show the latest" }));

    expect(await screen.findByText("3 of 3")).toBeVisible();
  });

  it("says when there is no such workflow", async () => {
    renderAt(<App />, {
      path: "/workflows/nope",
      answers: {
        ...SERVER,
        "/api/workflows/nope": [
          422,
          { error: { code: "invalid_argument", message: "'nope' is not a workflow id." } },
        ],
      },
    });

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("No workflow at this address");
    expect(alert).toHaveTextContent("'nope' is not a workflow id.");
    expect(within(alert).getByRole("link", { name: "Back to workflows" })).toHaveAttribute(
      "href",
      "/workflows",
    );
  });

  it("says when the server could not load it", async () => {
    renderAt(<App />, {
      path: `/workflows/${WORKFLOW_DETAIL.id}`,
      answers: {
        ...SERVER,
        [WORKFLOW_PATH]: [503, { error: { code: "instance_closed", message: "Closed." } }],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this workflow");
  });
});

describe("a tool version's page", () => {
  it("shows its fields, implementation and tests", async () => {
    renderAt(<App />, {
      path: `/tools/${TOOL_DETAIL.id}/versions/1.0.0`,
      answers: ANSWERS,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "count_words" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Inputs" })).toHaveTextContent("textrequired");
    expect(screen.getByRole("region", { name: "Outputs" })).toHaveTextContent(
      "Its output schema names no fields.",
    );
    expect(screen.getByRole("region", { name: "Implementations" })).toHaveTextContent(
      "Version 1.0.0, python, starts at run",
    );
    expect(screen.getByRole("region", { name: "Tests" })).toHaveTextContent("counts two words");
  });
});

describe("a benchmark's page", () => {
  it("shows its cases", async () => {
    renderAt(<App />, { path: `/benchmarks/${BENCHMARK_DETAIL.id}`, answers: ANSWERS });

    const cases = await screen.findByRole("region", { name: "Cases" });

    expect(cases).toHaveTextContent("2 cases");
    expect(cases).toHaveTextContent("that is not dead which can eternal lie");
    expect(cases).toHaveTextContent("semantic");
  });
});
