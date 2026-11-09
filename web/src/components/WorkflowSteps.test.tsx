import { fireEvent, render, screen, within, type RenderResult } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NARROW_QUERY, STEPS_VIEW_KEY } from "../stepsView";
import { LAYERED_DOCUMENT, REVIEW_DOCUMENT, TRIAGE_DOCUMENT } from "../test/documents";
import { WorkflowSteps } from "./WorkflowSteps";

const GRAPH = "The workflow's steps as a graph";

function Address() {
  const { search } = useLocation();

  return <output aria-label="Address">{search}</output>;
}

function show(document: Record<string, unknown>, path = "/"): RenderResult {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkflowSteps document={document} />
      <Address />
    </MemoryRouter>,
  );
}

function step(name: string): HTMLElement {
  const item = screen.getByRole("heading", { level: 3, name }).closest("li");

  if (item === null) {
    throw new Error(`no step ${name}`);
  }
  return item;
}

describe("WorkflowSteps", () => {
  it("counts the steps and names the result", () => {
    show(REVIEW_DOCUMENT);

    expect(screen.getByText(/^3 steps, with/)).toHaveTextContent(
      "3 steps, with summary as the result",
    );
  });

  it("shows a prompt step's inputs, outputs, needs and prompt", () => {
    show(REVIEW_DOCUMENT);
    const review = step("Review security");

    expect(review).toHaveTextContent("Prompt");
    expect(review).toHaveTextContent("changefrom the workflow's input");
    expect(review).toHaveTextContent("At least 128,000 tokens of context");
    expect(review).toHaveTextContent("Answers inJSON");
    expect(review).toHaveTextContent("tries up to 2 times, then fails the workflow");
    expect(within(review).getByText("Prompt", { selector: "summary" })).toBeVisible();
  });

  it("shows a tool step by its tool, and what it runs after", () => {
    show(REVIEW_DOCUMENT);
    const merge = step("merge_reviews");

    expect(merge).toHaveTextContent("Tool merge_reviews 1.0.0 (python)");
    expect(merge).toHaveTextContent("Runs afterReview security");
    expect(merge).toHaveTextContent("continue workflow");
    expect(within(merge).queryByText("Prompt", { selector: "summary" })).toBeNull();
  });

  it("shows when a step runs only on a condition, and marks the result", () => {
    show(REVIEW_DOCUMENT);
    const summary = step("Summarize review");

    expect(summary).toHaveTextContent("Runs only whenmerge_reviews: has_findings is true");
    expect(summary).toHaveTextContent("summaryresult");
  });

  it("says when it can read no steps", () => {
    show({});

    expect(screen.getByText("This workflow has no steps the editor can read.")).toBeVisible();
  });
});

describe("WorkflowSteps in layers", () => {
  beforeEach(() => {
    window.localStorage.setItem(STEPS_VIEW_KEY, "outline");
  });

  function layer(name: string): HTMLElement {
    return screen.getByRole("listitem", { name });
  }

  function titles(element: HTMLElement): string[] {
    return within(element)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
  }

  it("sets the steps that can run at once side by side, layer after layer", () => {
    show(LAYERED_DOCUMENT);

    expect(titles(layer("Layer 1: 3 steps that can run at once"))).toEqual([
      "Security",
      "Correctness",
      "Readability",
    ]);
    expect(titles(layer("Layer 2"))).toEqual(["merge_reviews"]);
    expect(titles(layer("Layer 3"))).toEqual(["Summary"]);
  });

  it("says how many layers there are", () => {
    show(LAYERED_DOCUMENT);

    expect(screen.getByText(/^5 steps in 3 layers/)).toHaveTextContent(
      "5 steps in 3 layers, with summary as the result",
    );
  });

  it("still names what each step runs after", () => {
    show(LAYERED_DOCUMENT);

    expect(step("merge_reviews")).toHaveTextContent("Runs afterSecurityCorrectnessReadability");
  });

  it("lists the steps in order when they cannot be layered", () => {
    show(REVIEW_DOCUMENT);

    expect(screen.queryByRole("listitem", { name: /^Layer/ })).toBeNull();
    expect(screen.getByText(/^3 steps, with/)).toBeVisible();
    expect(screen.getByText(/can’t be drawn as a graph or set out in layers/)).toBeVisible();
  });
});

describe("WorkflowSteps and the chosen step", () => {
  it("opens the graph on the step its address names", () => {
    show(TRIAGE_DOCUMENT, "/?revision=2&step=merge");

    expect(screen.getByRole("complementary", { name: "Step: merge_replies" })).toBeInTheDocument();
  });

  it("names the step chosen on the graph in its address, beside what was there", () => {
    show(TRIAGE_DOCUMENT, "/?revision=2&step=merge");

    fireEvent.click(screen.getByRole("button", { name: "Polish answer" }));

    expect(screen.getByRole("complementary", { name: "Step: Polish answer" })).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toHaveTextContent("?revision=2&step=polish");

    fireEvent.click(screen.getByRole("button", { name: "Close the step" }));

    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByLabelText("Address")).toHaveTextContent(/^\?revision=2$/);
  });

  it("ignores a step its workflow does not have", () => {
    show(TRIAGE_DOCUMENT, "/?step=gone");

    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("marks the chosen step in the outline", () => {
    window.localStorage.setItem(STEPS_VIEW_KEY, "outline");
    show(TRIAGE_DOCUMENT, "/?step=draft-bug");

    expect(step("Draft bug reply")).toHaveAttribute("aria-current", "step");
    expect(step("Draft feature reply")).not.toHaveAttribute("aria-current");
  });
});

describe("WorkflowSteps as a graph or an outline", () => {
  it("draws the steps as a graph on a wide window", () => {
    show(TRIAGE_DOCUMENT);

    expect(screen.getByLabelText(GRAPH)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Graph" })).toBeChecked();
    expect(screen.queryByRole("listitem", { name: /^Layer/ })).toBeNull();
  });

  it("sets the steps out as an outline on a phone-narrow window", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === NARROW_QUERY }));
    show(TRIAGE_DOCUMENT);

    expect(screen.queryByLabelText(GRAPH)).toBeNull();
    expect(screen.getByRole("radio", { name: "Outline" })).toBeChecked();
    expect(screen.getByRole("listitem", { name: /^Layer 2: 4 steps/ })).toBeInTheDocument();
  });

  it("switches between the two, and remembers the choice", () => {
    const { unmount } = show(TRIAGE_DOCUMENT);

    fireEvent.click(screen.getByRole("radio", { name: "Outline" }));

    expect(screen.queryByLabelText(GRAPH)).toBeNull();
    expect(screen.getByRole("listitem", { name: /^Layer 1/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(STEPS_VIEW_KEY)).toBe("outline");

    unmount();
    show(TRIAGE_DOCUMENT);

    expect(screen.getByRole("radio", { name: "Outline" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Graph" }));
    expect(screen.getByLabelText(GRAPH)).toBeInTheDocument();
    expect(window.localStorage.getItem(STEPS_VIEW_KEY)).toBe("graph");
  });

  it("offers no graph for steps it cannot layer", () => {
    window.localStorage.setItem(STEPS_VIEW_KEY, "graph");
    show(REVIEW_DOCUMENT);

    expect(screen.queryByLabelText(GRAPH)).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Show the steps as" })).toBeNull();
  });

  it("offers no choice for a workflow without steps", () => {
    show({});

    expect(screen.queryByRole("radiogroup", { name: "Show the steps as" })).toBeNull();
  });
});
