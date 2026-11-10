import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import type { LiveRun } from "../api/types";
import { lastStream, stubEventSource } from "../test/eventSource";
import { SERVER, WORKFLOW, urlOf, type Answers } from "../test/instances";
import { renderAt } from "../test/render";
import {
  FINISHED_RUN,
  LIVE_RUN,
  RUN_EVENTS,
  RUN_RESULT,
  RUN_WORKFLOW,
  SELECT,
  SUMMARIZE,
} from "../test/runs";
import { LiveRunPage } from "./LiveRun";

const ANSWERS: Answers = {
  ...SERVER,
  "/api/live/h4ndle": [200, LIVE_RUN],
  [`/api/workflows/${WORKFLOW.id}`]: [200, RUN_WORKFLOW],
};

function open(answers: Answers = ANSWERS, fetcher?: typeof fetch) {
  renderAt(
    <Routes>
      <Route path="/live/:handle" element={<LiveRunPage />} />
    </Routes>,
    { path: "/live/h4ndle", answers, fetcher },
  );
}

/** Sends the run's events, numbered from 1, as its server would. */
function send(count = RUN_EVENTS.length) {
  act(() => {
    RUN_EVENTS.slice(0, count).forEach((event, index) => {
      lastStream().emit("run_event", event, String(index + 1));
    });
  });
}

function end(live: LiveRun) {
  act(() => {
    lastStream().emit("end", live);
  });
}

function timeline() {
  return within(screen.getByRole("region", { name: "As it ran" }));
}

describe("LiveRunPage", () => {
  beforeEach(() => {
    stubEventSource();
  });

  it("follows a run's events as they come, then shows its result", async () => {
    open();

    expect(await screen.findByRole("heading", { level: 1, name: "summarize" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Running");
    expect(lastStream().url).toBe("/api/live/h4ndle/events");
    expect(timeline().getByText("Waiting for the run’s first event…")).toBeVisible();

    send(3);

    expect(
      timeline()
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["The run started.", "json_select started.", "json_select finished."]);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();

    send();
    end(FINISHED_RUN);

    expect(screen.getByRole("status")).toHaveTextContent("Succeeded");
    expect(screen.getByRole("heading", { name: "Result" })).toBeVisible();
    expect(screen.getByLabelText("The run's result, as JSON")).toHaveTextContent(
      '"A short summary."',
    );
    expect(screen.getByText(RUN_RESULT.run_id)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run again" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW.id}/run`,
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(lastStream().readyState).toBe(2);
  });

  it("shows each event once, however often the stream sends it", async () => {
    open();
    await screen.findByRole("heading", { level: 1, name: "summarize" });

    send(2);
    send(3);

    expect(timeline().getAllByRole("listitem")).toHaveLength(3);
  });

  it("says which step a failed run failed on, and why", async () => {
    open();
    await screen.findByRole("heading", { level: 1, name: "summarize" });

    end({
      ...FINISHED_RUN,
      result: {
        ...RUN_RESULT,
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
    });

    expect(screen.getByRole("status")).toHaveTextContent("Failed");
    expect(screen.getByRole("heading", { name: "Why it failed" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Summarize failed");
    expect(screen.getByRole("alert")).toHaveTextContent("The model refused.");
  });

  it("says a run with no declared result has none to show", async () => {
    open();
    await screen.findByRole("heading", { level: 1, name: "summarize" });

    end({ ...FINISHED_RUN, result: { ...RUN_RESULT, has_result: false, result: null } });

    expect(
      screen.getByText("The workflow declares no result, so there is none to show."),
    ).toBeVisible();
  });

  it("cancels a run, and says it was cancelled once it stops", async () => {
    const asked: string[] = [];
    const fetcher: typeof fetch = (input, init) => {
      const path = urlOf(input).pathname;

      if (init?.method === "POST") {
        asked.push(path);
      }
      const [status, body] = ANSWERS[path] ?? [200, { ...LIVE_RUN }];

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    };

    open(ANSWERS, fetcher);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(asked).toEqual(["/api/live/h4ndle/cancel"]);
    });

    end({ ...LIVE_RUN, state: "cancelled", finished_at: "2026-11-10T10:00:01Z" });

    expect(screen.getByRole("status")).toHaveTextContent("Cancelled");
    expect(screen.getByText("The run was cancelled")).toBeVisible();
  });

  it("says why Azathoth refused a run", async () => {
    open();
    await screen.findByRole("heading", { level: 1, name: "summarize" });

    end({
      ...LIVE_RUN,
      state: "refused",
      finished_at: "2026-11-10T10:00:00.1Z",
      error: { code: "run_not_started", message: "No tool definition satisfies 'json_select'." },
    });

    expect(screen.getByRole("status")).toHaveTextContent("Refused");
    expect(screen.getByRole("alert")).toHaveTextContent("Azathoth refused the run");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No tool definition satisfies 'json_select'.",
    );
  });

  it("says when the run's events stopped coming", async () => {
    open();
    await screen.findByRole("heading", { level: 1, name: "summarize" });

    act(() => {
      lastStream().fail();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("The run's events stopped coming");
  });

  it("says when there is no run at its address", async () => {
    open({
      ...ANSWERS,
      "/api/live/h4ndle": [
        404,
        { error: { code: "not_found", message: "No live run h4ndle is known." } },
      ],
    });

    expect(await screen.findByText("No run at this address")).toBeVisible();
    expect(screen.getByText("No live run h4ndle is known.")).toBeVisible();
  });

  it("names the step a tried step is, and shows what it added", async () => {
    open({
      ...ANSWERS,
      "/api/live/h4ndle": [200, { ...LIVE_RUN, kind: "step", step_id: SELECT }],
    });

    expect(await screen.findByText("Trying json_select")).toBeVisible();

    end({
      ...LIVE_RUN,
      kind: "step",
      step_id: SELECT,
      state: "finished",
      finished_at: "2026-11-10T10:00:01Z",
      result: { step: { status: "executed", values: { text: "A ticket." } }, warnings: [] },
    });

    expect(screen.getByRole("status")).toHaveTextContent("Succeeded");
    expect(screen.getByLabelText("The values the step added, as JSON")).toHaveTextContent(
      '"text": "A ticket."',
    );
    expect(screen.queryByRole("link", { name: "Run again" })).not.toBeInTheDocument();
  });
});
