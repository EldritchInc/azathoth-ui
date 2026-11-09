import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { REVIEW_DOCUMENT } from "../test/documents";
import { WorkflowSteps } from "./WorkflowSteps";

function step(name: string): HTMLElement {
  const item = screen.getByRole("heading", { level: 3, name }).closest("li");

  if (item === null) {
    throw new Error(`no step ${name}`);
  }
  return item;
}

describe("WorkflowSteps", () => {
  it("counts the steps and names the result", () => {
    render(<WorkflowSteps document={REVIEW_DOCUMENT} />);

    expect(screen.getByText(/^3 steps, with/)).toHaveTextContent(
      "3 steps, with summary as the result",
    );
  });

  it("shows a prompt step's inputs, outputs, needs and prompt", () => {
    render(<WorkflowSteps document={REVIEW_DOCUMENT} />);
    const review = step("Review security");

    expect(review).toHaveTextContent("Prompt");
    expect(review).toHaveTextContent("changefrom the workflow's input");
    expect(review).toHaveTextContent("At least 128,000 tokens of context");
    expect(review).toHaveTextContent("Answers inJSON");
    expect(review).toHaveTextContent("tries up to 2 times, then fails the workflow");
    expect(within(review).getByText("Prompt", { selector: "summary" })).toBeVisible();
  });

  it("shows a tool step by its tool, and what it runs after", () => {
    render(<WorkflowSteps document={REVIEW_DOCUMENT} />);
    const merge = step("merge_reviews");

    expect(merge).toHaveTextContent("Tool merge_reviews 1.0.0 (python)");
    expect(merge).toHaveTextContent("Runs afterReview security");
    expect(merge).toHaveTextContent("continue workflow");
    expect(within(merge).queryByText("Prompt", { selector: "summary" })).toBeNull();
  });

  it("shows when a step runs only on a condition, and marks the result", () => {
    render(<WorkflowSteps document={REVIEW_DOCUMENT} />);
    const summary = step("Summarize review");

    expect(summary).toHaveTextContent("Runs only whenmerge_reviews: has_findings is true");
    expect(summary).toHaveTextContent("summaryresult");
  });

  it("says when it can read no steps", () => {
    render(<WorkflowSteps document={{}} />);

    expect(screen.getByText("This workflow has no steps the editor can read.")).toBeVisible();
  });
});
