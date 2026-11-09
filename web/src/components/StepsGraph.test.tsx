import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { describeWorkflow } from "../documents";
import { buildGraph, type WorkflowGraph } from "../graph";
import { TRIAGE_DOCUMENT } from "../test/documents";
import { StepsGraph } from "./StepsGraph";

function triage(): WorkflowGraph {
  const graph = buildGraph(describeWorkflow(TRIAGE_DOCUMENT));

  if (graph === null) {
    throw new Error("The triage workflow has no graph.");
  }
  return graph;
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
    render(<StepsGraph graph={triage()} />);

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
    render(<StepsGraph graph={triage()} />);
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
    render(<StepsGraph graph={triage()} />);

    expect(
      within(node("Draft bug reply")).getByText("Runs only on a condition"),
    ).toBeInTheDocument();
    expect(within(node("Classify ticket")).queryByText("Runs only on a condition")).toBeNull();
  });

  it("shows a few of a step's values, and counts the rest", () => {
    const graph = buildGraph(
      describeWorkflow({
        steps: [{ id: "a", outputs: ["w", "x", "y", "z", "v"].map((name) => ({ name })) }],
      }),
    );

    if (graph === null) {
      throw new Error("no graph");
    }
    render(<StepsGraph graph={graph} />);

    expect(
      within(node("Unnamed step"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["w", "x", "y", "+2"]);
  });

  it("names each kind of edge in its legend", () => {
    render(<StepsGraph graph={triage()} />);

    expect(screen.getByText("passes a value")).toBeInTheDocument();
    expect(screen.getByText("decides whether it runs")).toBeInTheDocument();
    expect(screen.getByText("runs after")).toBeInTheDocument();
  });
});
