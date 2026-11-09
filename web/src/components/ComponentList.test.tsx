import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { saveDraft } from "../drafts";
import { BENCHMARK, REVIEW_WORKFLOW, SERVER, TOOL, WORKFLOW } from "../test/instances";
import { renderAt } from "../test/render";
import { ComponentList } from "./ComponentList";

function rows(): HTMLElement[] {
  return screen.getAllByRole("row").slice(1);
}

describe("ComponentList", () => {
  it("says it is loading until the list arrives", async () => {
    renderAt(<ComponentList kind="workflows" />);

    expect(screen.getByRole("status", { name: "Loading workflows" })).toBeVisible();
    expect(await screen.findByRole("table")).toBeVisible();
    expect(screen.queryByRole("status", { name: "Loading workflows" })).toBeNull();
  });

  it("lists every workflow, each linking to its page", async () => {
    renderAt(<ComponentList kind="workflows" />);

    expect(await screen.findByRole("table")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Workflows" })).toBeVisible();
    expect(
      screen.getByText("Workflows in your local instance, each at its latest revision."),
    ).toBeVisible();
    expect(rows()).toHaveLength(2);

    const first = rows()[0];
    if (first === undefined) {
      throw new Error("no first row");
    }
    expect(within(first).getByRole("link", { name: "summarize" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW.id}`,
    );
    expect(first).toHaveTextContent("Summarize a text in one sentence.");
    expect(first).toHaveTextContent("1.0.0");
    expect(first).toHaveTextContent("same as 1");
    expect(screen.getByText("2 workflows")).toBeVisible();
  });

  it("narrows the list to what is typed, and says how many match", async () => {
    renderAt(<ComponentList kind="workflows" />);
    const filter = await screen.findByRole("searchbox", { name: "Filter workflows" });

    fireEvent.change(filter, { target: { value: "review" } });

    expect(rows()).toHaveLength(1);
    expect(screen.getByRole("link", { name: REVIEW_WORKFLOW.name })).toBeVisible();
    expect(screen.getByText("1 of 2")).toBeVisible();
  });

  it("says when nothing matches, and clears the filter on request", async () => {
    renderAt(<ComponentList kind="workflows" />);
    const filter = await screen.findByRole("searchbox", { name: "Filter workflows" });

    fireEvent.change(filter, { target: { value: "nothing like it" } });

    expect(screen.getByText("No workflows match “nothing like it”")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear the filter" }));

    expect(filter).toHaveValue("");
    expect(rows()).toHaveLength(2);
  });

  it("shows each tool's version, implementations and tests, linking to that version", async () => {
    renderAt(<ComponentList kind="tools" />);

    const link = await screen.findByRole("link", { name: TOOL.name });
    const row = link.closest("tr");
    if (row === null) {
      throw new Error("no row");
    }

    expect(link).toHaveAttribute("href", `/tools/${TOOL.id}/versions/1.0.0`);
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(expect.arrayContaining(["1", "3"]));
    expect(screen.getByRole("columnheader", { name: "Implementations" })).toBeVisible();
    expect(screen.getByText("1 tool")).toBeVisible();
  });

  it("shows each benchmark's cases", async () => {
    renderAt(<ComponentList kind="benchmarks" />);

    expect(await screen.findByRole("link", { name: BENCHMARK.name })).toHaveAttribute(
      "href",
      `/benchmarks/${BENCHMARK.id}`,
    );
    expect(screen.getByRole("columnheader", { name: "Cases" })).toBeVisible();
  });

  it("says how to import the first one into an empty instance", async () => {
    renderAt(<ComponentList kind="benchmarks" />, {
      answers: { ...SERVER, "/api/benchmarks": [200, { items: [] }] },
    });

    expect(await screen.findByText("No benchmarks yet")).toBeVisible();
    expect(screen.getByText("azathoth benchmark import <file>")).toBeVisible();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("says when the list could not be loaded, and why", async () => {
    renderAt(<ComponentList kind="tools" />, {
      answers: {
        ...SERVER,
        "/api/tools": [503, { error: { code: "instance_closed", message: "It is closed." } }],
      },
    });

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("Couldn't load tools");
    expect(alert).toHaveTextContent("It is closed.");
  });
});

describe("ComponentList of workflows", () => {
  it("offers a new workflow, and nothing new of other kinds", async () => {
    renderAt(<ComponentList kind="workflows" />);

    expect(await screen.findByRole("link", { name: "New workflow" })).toHaveAttribute(
      "href",
      "/workflows/new",
    );

    renderAt(<ComponentList kind="tools" />);

    expect(await screen.findAllByRole("link", { name: "New workflow" })).toHaveLength(1);
  });

  it("lists the drafts kept in this browser, new or editing a workflow", async () => {
    saveDraft(window.localStorage, WORKFLOW.id, {
      document: { metadata: { name: "summarize, edited" } },
      base: 2,
    });
    saveDraft(window.localStorage, "fresh", { document: { metadata: { name: "" } }, base: null });
    renderAt(<ComponentList kind="workflows" />);

    const drafts = await screen.findByRole("region", { name: "Unsaved drafts" });

    expect(within(drafts).getByRole("link", { name: "summarize, edited" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW.id}/edit`,
    );
    expect(await within(drafts).findByText("edits to revision 2")).toBeVisible();
    expect(within(drafts).getByRole("link", { name: "Untitled workflow" })).toHaveAttribute(
      "href",
      "/workflows/fresh/edit",
    );
    expect(within(drafts).getByText("new")).toBeVisible();
  });

  it("lists no drafts when none are kept", async () => {
    renderAt(<ComponentList kind="workflows" />);

    expect(await screen.findByRole("table")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Unsaved drafts" })).toBeNull();
  });
});
