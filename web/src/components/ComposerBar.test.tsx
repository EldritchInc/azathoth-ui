import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { describeWorkflow } from "../documents";
import { buildGraph, INPUT_NODE, RESULT_NODE, stepNode, type WorkflowGraph } from "../graph";
import { uuid, VALID_DOCUMENT } from "../test/documents";
import { ComposerBar } from "./ComposerBar";
import type { Offer } from "./composing";

const PICK = stepNode(uuid(11));
const SUMMARIZE = stepNode(uuid(12));

function graph(): WorkflowGraph {
  const built = buildGraph(describeWorkflow(VALID_DOCUMENT));

  if (built === null) {
    throw new Error("no graph");
  }
  return built;
}

function bar(
  chosen: string | null,
  offer: Offer | null = null,
  edge: { source: string; target: string; names: readonly string[] } | null = null,
) {
  const calls = {
    onAdd: vi.fn(),
    onRemoveStep: vi.fn(),
    onRemoveEdge: vi.fn(),
    onPass: vi.fn(),
    onResult: vi.fn(),
    onDismiss: vi.fn(),
  };

  render(
    <ComposerBar
      graph={graph()}
      chosen={chosen}
      edge={
        edge === null
          ? null
          : {
              ...edge,
              id: "edge",
              kind: "data",
              conditions: [],
              label: edge.names.join(", "),
              points: [],
            }
      }
      offer={offer}
      {...calls}
    />,
  );
  return calls;
}

describe("ComposerBar", () => {
  it("adds a step at the start when none is chosen", () => {
    const calls = bar(null);

    expect(screen.getByRole("group", { name: "Compose" })).toHaveTextContent("Add a step");
    fireEvent.click(screen.getByRole("button", { name: "+ Prompt step" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Tool step" }));

    expect(calls.onAdd.mock.calls).toEqual([["prompt"], ["tool"]]);
    expect(screen.queryByRole("button", { name: "Remove step" })).toBeNull();
  });

  it("adds a step after the chosen one, and removes it", () => {
    const calls = bar(SUMMARIZE);

    expect(screen.getByRole("group", { name: "Compose" })).toHaveTextContent("After Summarize:");
    fireEvent.click(screen.getByRole("button", { name: "Remove step" }));

    expect(calls.onRemoveStep).toHaveBeenCalledOnce();
  });

  it("offers each output the first step writes to pass to the second", () => {
    const calls = bar(null, { kind: "pass", from: PICK, to: SUMMARIZE });
    const group = screen.getByRole("group", { name: "Pass a value" });

    expect(group).toHaveTextContent("Summarize now runs after json_select.");
    fireEvent.click(screen.getByRole("button", { name: "length" }));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(calls.onPass.mock.calls).toEqual([["length"]]);
    expect(calls.onDismiss).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "text" })).toBeInTheDocument();
  });

  it("offers each output a step writes as the result", () => {
    const calls = bar(null, { kind: "result", from: SUMMARIZE });

    expect(screen.getByRole("group", { name: "Pass a value" })).toHaveTextContent(
      "Which of Summarize's outputs is the result?",
    );
    fireEvent.click(screen.getByRole("button", { name: "summary" }));

    expect(calls.onResult.mock.calls).toEqual([["summary"]]);
  });

  it("says when a step writes nothing to pass", () => {
    bar(null, { kind: "pass", from: INPUT_NODE, to: SUMMARIZE });

    expect(screen.getByText("It writes nothing to pass.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("removes a chosen link, but leaves the result's to the step's details", () => {
    const calls = bar(null, null, { source: PICK, target: SUMMARIZE, names: ["text"] });

    expect(screen.getByRole("group", { name: "The chosen link" })).toHaveTextContent(
      "json_select → Summarize",
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));
    expect(calls.onRemoveEdge).toHaveBeenCalledOnce();
  });

  it("does not remove the link to the result", () => {
    bar(null, null, { source: SUMMARIZE, target: RESULT_NODE, names: ["summary"] });

    expect(screen.getByRole("group", { name: "The chosen link" })).toHaveTextContent(
      "Summarize → the result",
    );
    expect(screen.queryByRole("button", { name: "Remove link" })).toBeNull();
  });
});
