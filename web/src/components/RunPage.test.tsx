import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { SERVER, WORKFLOW, type Answers } from "../test/instances";
import { renderAt } from "../test/render";
import { RUN_DETAIL, RUN_WORKFLOW, SUMMARIZE } from "../test/runs";
import { RunPage } from "./RunPage";

const ANSWERS: Answers = {
  ...SERVER,
  [`/api/runs/${RUN_DETAIL.run_id}`]: [200, RUN_DETAIL],
  [`/api/workflows/${WORKFLOW.id}?revision=3`]: [200, RUN_WORKFLOW],
};

function open(answers: Answers = ANSWERS) {
  renderAt(
    <Routes>
      <Route path="/runs/:runId" element={<RunPage />} />
    </Routes>,
    { path: `/runs/${RUN_DETAIL.run_id}`, answers },
  );
}

describe("RunPage", () => {
  it("shows a kept run: how it ended, its input, its result and its command", async () => {
    open();

    expect(await screen.findByRole("heading", { level: 1, name: "summarize" })).toBeVisible();
    expect(screen.getByText("Succeeded", { selector: "[data-state]" })).toBeVisible();
    expect(screen.getByText(/2\.5 s · revision 3/)).toBeVisible();
    expect(screen.getByLabelText("The run's input, as JSON")).toHaveTextContent(
      '"text": "My printer is on fire."',
    );
    expect(screen.getByLabelText("The run's result, as JSON")).toHaveTextContent(
      '"A short summary."',
    );
    expect(screen.getByText(RUN_DETAIL.command)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run again" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW.id}/run`,
    );
    expect(
      within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", {
        name: "summarize",
      }),
    ).toHaveAttribute("href", `/workflows/${WORKFLOW.id}`);
  });

  it("draws the revision it ran, with where each step got to", async () => {
    open();

    expect(await screen.findByText("Steps")).toBeVisible();
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Skipped").length).toBeGreaterThan(0);
  });

  it("says which step a failed run failed on, and that it produced nothing", async () => {
    open({
      ...ANSWERS,
      [`/api/runs/${RUN_DETAIL.run_id}`]: [
        200,
        {
          ...RUN_DETAIL,
          succeeded: false,
          has_result: false,
          result: null,
          error: {
            code: "workflow_execution_failed",
            step_id: SUMMARIZE,
            exception_type: "ModelError",
            message: "The model refused.",
          },
        },
      ],
    });

    expect(await screen.findByText("Summarize failed")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("The model refused.");
    expect(screen.getByText("Failed", { selector: "[data-state]" })).toBeVisible();
    expect(screen.getByText("It produced none.")).toBeVisible();
  });

  it("names a production run, and a run given nothing", async () => {
    open({
      ...ANSWERS,
      [`/api/runs/${RUN_DETAIL.run_id}`]: [
        200,
        {
          ...RUN_DETAIL,
          invocation_id: "f1000000-0000-4000-8000-000000000001",
          has_input: false,
          input: null,
        },
      ],
    });

    expect(await screen.findByText("Production run")).toBeVisible();
    expect(screen.getByText("It was given no input.")).toBeVisible();
  });

  it("says when there is no run at its address", async () => {
    open({
      ...ANSWERS,
      [`/api/runs/${RUN_DETAIL.run_id}`]: [
        404,
        { error: { code: "not_found", message: `Run ${RUN_DETAIL.run_id} was not found.` } },
      ],
    });

    expect(await screen.findByText("No run at this address")).toBeVisible();
    expect(screen.getByText(`Run ${RUN_DETAIL.run_id} was not found.`)).toBeVisible();
  });
});
