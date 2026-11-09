import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { describeWorkflow, type WorkflowView } from "../documents";
import { TRIAGE_DOCUMENT } from "../test/documents";
import { StepsGraph } from "./StepsGraph";

function triage(): WorkflowView {
  return describeWorkflow(TRIAGE_DOCUMENT);
}

function node(title: string): HTMLElement {
  const element = screen.getByText(title, { selector: "p" }).closest("[data-kind]");

  if (!(element instanceof HTMLElement)) {
    throw new Error(`no node ${title}`);
  }
  return element;
}

describe("StepsGraph", () => {
  it("draws a node for every step, and the input and the result", () => {
    render(<StepsGraph view={triage()} />);

    expect(screen.getByLabelText("The workflow's steps as a graph")).toBeInTheDocument();
    for (const title of [
      "Classify ticket",
      "Record triage",
      "Draft bug reply",
      "Draft feature reply",
      "Draft question reply",
      "merge_replies",
      "Polish answer",
    ]) {
      expect(node(title)).toBeInTheDocument();
    }
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();
  });

  it("shows what a step is, what it writes, and the constants it reads", () => {
    render(<StepsGraph view={triage()} />);
    const merge = node("merge_replies");

    expect(merge).toHaveAttribute("data-kind", "tool");
    expect(merge).toHaveTextContent("Tool · python");
    expect(within(merge).getByText("limit = 3")).toHaveAttribute("data-kind", "constant");
    expect(within(merge).getByText("answer")).toHaveAttribute("data-kind", "result");
    expect(within(node("Classify ticket")).getByText("category")).toHaveAttribute(
      "data-kind",
      "output",
    );
    expect(node("Classify ticket")).toHaveTextContent("Prompt");
  });

  it("marks a step that runs only on a condition", () => {
    render(<StepsGraph view={triage()} />);

    expect(
      within(node("Draft bug reply")).getByText("Runs only on a condition"),
    ).toBeInTheDocument();
    expect(within(node("Classify ticket")).queryByText("Runs only on a condition")).toBeNull();
  });

  it("shows a few of a step's values, and counts the rest", () => {
    const view = describeWorkflow({
      steps: [{ id: "a", outputs: ["w", "x", "y", "z", "v"].map((name) => ({ name })) }],
    });

    render(<StepsGraph view={view} />);

    expect(
      within(node("Unnamed step"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["w", "x", "y", "+2"]);
  });

  it("names each kind of edge in its legend", () => {
    render(<StepsGraph view={triage()} />);

    expect(screen.getByText("passes a value")).toBeInTheDocument();
    expect(screen.getByText("decides whether it runs")).toBeInTheDocument();
    expect(screen.getByText("runs after")).toBeInTheDocument();
  });
});

function wrapper(title: string): HTMLElement {
  const element = node(title).closest(".react-flow__node");

  if (!(element instanceof HTMLElement)) {
    throw new Error(`no node ${title}`);
  }
  return element;
}

function inspector(): HTMLElement {
  return screen.getByRole("complementary");
}

describe("StepsGraph with a chosen step", () => {
  it("shows the chosen step's details: what it comes from, and what it leads to", () => {
    render(<StepsGraph view={triage()} selected="draft-bug" />);
    const details = inspector();

    expect(details).toHaveAccessibleName("Step: Draft bug reply");
    expect(within(details).getByRole("heading", { level: 3 })).toHaveTextContent("Draft bug reply");
    expect(within(details).getByText("The workflow's input")).toBeInTheDocument();
    expect(within(details).getByText("only when category is bug")).toBeInTheDocument();
    expect(within(details).getByRole("button", { name: "merge_replies" })).toBeInTheDocument();
  });

  it("says which writers of a name it reads it never reads from", () => {
    render(<StepsGraph view={triage()} selected="draft-bug" />);

    expect(within(inspector()).getByText(/is also written by/)).toHaveTextContent(
      "notes is also written by Draft question reply, which it does not depend on, " +
        "so it never reads it from there.",
    );
  });

  it("names the constants a step reads, and the steps that only wait for one another", () => {
    render(<StepsGraph view={triage()} selected="merge" />);
    const details = inspector();

    expect(within(details).getByText("limit = 3")).toBeInTheDocument();
    expect(within(details).getByText("this step waits for it")).toBeInTheDocument();
  });

  it("dims what is not on a path through the chosen step, and marks the step", () => {
    render(<StepsGraph view={triage()} selected="draft-bug" />);

    expect(wrapper("Record triage").className).toMatch(/dimmed/);
    expect(wrapper("Draft feature reply").className).toMatch(/dimmed/);
    expect(wrapper("Classify ticket").className).not.toMatch(/dimmed/);
    expect(wrapper("Polish answer").className).not.toMatch(/dimmed/);
    expect(node("Draft bug reply")).toHaveAttribute("data-selected", "true");
  });

  it("dims nothing and shows no details when no step is chosen", () => {
    render(<StepsGraph view={triage()} selected="gone" />);

    expect(screen.queryByRole("complementary")).toBeNull();
    expect(wrapper("Record triage").className).not.toMatch(/dimmed/);
  });

  it("moves to a step the details name, and lets the step go", () => {
    const onSelect = vi.fn();

    render(<StepsGraph view={triage()} selected="draft-bug" onSelect={onSelect} />);
    fireEvent.click(within(inspector()).getByRole("button", { name: "Classify ticket" }));
    fireEvent.click(within(inspector()).getByRole("button", { name: "Close the step" }));

    expect(onSelect.mock.calls).toEqual([["classify"], [null]]);
  });

  it("chooses a step that is clicked, and not the input or the result", () => {
    const onSelect = vi.fn();

    render(<StepsGraph view={triage()} onSelect={onSelect} />);
    fireEvent.click(wrapper("Polish answer"));
    fireEvent.click(screen.getByText("Input"));

    expect(onSelect.mock.calls).toEqual([["polish"]]);
  });

  it("moves between steps with the arrow keys, and lets go with Escape", () => {
    const onSelect = vi.fn();

    render(<StepsGraph view={triage()} selected="draft-bug" onSelect={onSelect} />);
    const graph = screen.getByLabelText("The workflow's steps as a graph");

    fireEvent.keyDown(graph, { key: "ArrowLeft" });
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    fireEvent.keyDown(graph, { key: "ArrowUp" });
    fireEvent.keyDown(graph, { key: "ArrowDown" });
    fireEvent.keyDown(graph, { key: "Escape" });

    expect(onSelect.mock.calls).toEqual([
      ["classify"],
      ["merge"],
      ["log"],
      ["draft-feature"],
      [null],
    ]);
  });

  it("chooses the step in focus with Enter, and starts at the first step without one", () => {
    const onSelect = vi.fn();

    render(<StepsGraph view={triage()} onSelect={onSelect} />);
    fireEvent.keyDown(wrapper("merge_replies"), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("The workflow's steps as a graph"), {
      key: "ArrowRight",
    });
    fireEvent.keyDown(screen.getByLabelText("The workflow's steps as a graph"), { key: "Escape" });

    expect(onSelect.mock.calls).toEqual([["merge"], ["classify"]]);
  });

  it("leaves the keys alone when there is nowhere to go", () => {
    const onSelect = vi.fn();

    render(<StepsGraph view={triage()} selected="classify" onSelect={onSelect} />);
    const graph = screen.getByLabelText("The workflow's steps as a graph");

    fireEvent.keyDown(graph, { key: "ArrowLeft" });
    fireEvent.keyDown(graph, { key: "ArrowUp" });
    fireEvent.keyDown(graph, { key: "a" });

    expect(onSelect).not.toHaveBeenCalled();
  });
});

/** A workflow that starts one step, branches into eight at once, and joins them. */
const WIDE = describeWorkflow({
  steps: [
    { id: "start", specification: { metadata: { name: "Start" } } },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `branch-${String(index)}`,
      specification: { metadata: { name: `Branch ${String(index)}` } },
      depends_on: ["start"],
    })),
    {
      id: "join",
      specification: { metadata: { name: "Join" } },
      depends_on: Array.from({ length: 8 }, (_, index) => `branch-${String(index)}`),
    },
  ],
});

describe("StepsGraph with a wide layer", () => {
  it("offers to fold a wide layer, and folds none until asked", () => {
    render(<StepsGraph view={WIDE} />);

    expect(screen.getByRole("button", { name: "Fold layer 2" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(node("Branch 0")).toBeInTheDocument();
    expect(screen.queryByText("8 steps at once")).toBeNull();
  });

  it("folds the layer into one node naming a few of its steps, and unfolds it", () => {
    render(<StepsGraph view={WIDE} />);

    fireEvent.click(screen.getByRole("button", { name: "Fold layer 2" }));

    const fold = screen.getByText("8 steps at once").closest("[data-detail]");

    expect(fold).toHaveTextContent("Layer 2 · folded");
    expect(fold).toHaveTextContent("Branch 0, Branch 1, Branch 2, +5");
    expect(screen.queryByText("Branch 0", { selector: "p" })).toBeNull();
    expect(screen.getByRole("button", { name: "Unfold layer 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Unfold layer 2" }));

    expect(node("Branch 0")).toBeInTheDocument();
  });

  it("unfolds a layer when its node is clicked", () => {
    render(<StepsGraph view={WIDE} />);

    fireEvent.click(screen.getByRole("button", { name: "Fold layer 2" }));
    fireEvent.click(screen.getByText("8 steps at once"));

    expect(node("Branch 3")).toBeInTheDocument();
  });

  it("keeps the layer of the chosen step open", () => {
    render(<StepsGraph view={WIDE} selected="branch-4" />);

    const button = screen.getByRole("button", { name: "Fold layer 2" });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(node("Branch 4")).toBeInTheDocument();
  });

  it("offers no folding when no layer is wide", () => {
    render(<StepsGraph view={triage()} />);

    expect(screen.queryByText("Wide layers")).toBeNull();
  });
});
