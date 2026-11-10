import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { SERVER, WORKFLOW, urlOf, type Answers } from "../test/instances";
import { renderAt } from "../test/render";
import { LIVE_RUN, NOT_READY, READY, RUN_WORKFLOW } from "../test/runs";
import { RunWorkflow } from "./RunWorkflow";

const ANSWERS: Answers = {
  ...SERVER,
  [`/api/workflows/${WORKFLOW.id}`]: [200, RUN_WORKFLOW],
  "/api/workflows/readiness": [200, READY],
};

/** Opens the run page with a server that starts every run, keeping what each start sent. */
function open(answers: Answers = ANSWERS) {
  const sent: unknown[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const path = urlOf(input).pathname;

    if (path === "/api/live/runs" && typeof init?.body === "string") {
      sent.push(JSON.parse(init.body));
    }

    const [status, body] =
      path === "/api/live/runs" ? [201, LIVE_RUN] : (answers[path] ?? [404, {}]);

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  renderAt(
    <Routes>
      <Route path="/workflows/:id/run" element={<RunWorkflow />} />
      <Route path="/live/:handle" element={<p>The live run</p>} />
    </Routes>,
    { path: `/workflows/${WORKFLOW.id}/run`, fetcher },
  );

  return sent;
}

/** Runs it, once Azathoth has said it could run here. */
async function run() {
  const button = screen.getByRole("button", { name: "Run" });

  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  fireEvent.click(button);
}

describe("RunWorkflow", () => {
  it("runs a workflow on text, and opens the live run", async () => {
    const sent = open();

    expect(await screen.findByRole("heading", { level: 1, name: "Run summarize" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Text" })).toBeChecked();

    fireEvent.change(screen.getByLabelText("The run's input, as text"), {
      target: { value: "My printer is on fire." },
    });
    await run();

    expect(await screen.findByText("The live run")).toBeVisible();
    expect(sent).toEqual([{ workflow_id: WORKFLOW.id, input: "My printer is on fire." }]);
  });

  it("runs on JSON once it reads as JSON", async () => {
    const sent = open();
    await screen.findByRole("heading", { level: 1, name: "Run summarize" });

    fireEvent.click(screen.getByRole("radio", { name: "JSON" }));

    const json = screen.getByLabelText("The run's input, as JSON");

    fireEvent.change(json, { target: { value: '{"text": ' } });

    expect(screen.getByText(/^This isn't JSON yet: /)).toBeVisible();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();

    fireEvent.change(json, { target: { value: '{"text": "Hello"}' } });

    expect(screen.getByText("Reads as JSON.")).toBeVisible();

    await run();

    await screen.findByText("The live run");

    expect(sent).toEqual([{ workflow_id: WORKFLOW.id, input: { text: "Hello" } }]);
  });

  it("runs on nothing at all", async () => {
    const sent = open();
    await screen.findByRole("heading", { level: 1, name: "Run summarize" });

    fireEvent.click(screen.getByRole("radio", { name: "Nothing" }));
    await run();

    await screen.findByText("The live run");

    expect(sent).toEqual([{ workflow_id: WORKFLOW.id }]);
  });

  it("runs on a file, sent in base64", async () => {
    const sent = open();
    await screen.findByRole("heading", { level: 1, name: "Run summarize" });

    fireEvent.click(screen.getByRole("radio", { name: "File" }));

    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Choose the run's file"), {
      target: { files: [new File(["one two"], "notes.txt", { type: "text/plain" })] },
    });

    expect(await screen.findByText("notes.txt")).toBeVisible();
    expect(screen.getByText("text/plain · 1 KB")).toBeVisible();

    await run();

    await screen.findByText("The live run");

    expect(sent).toEqual([
      { workflow_id: WORKFLOW.id, file: { media_type: "text/plain", content: "b25lIHR3bw==" } },
    ]);
  });

  it("refuses a file Azathoth would not take, before sending it", async () => {
    open();
    await screen.findByRole("heading", { level: 1, name: "Run summarize" });

    fireEvent.click(screen.getByRole("radio", { name: "File" }));
    fireEvent.change(screen.getByLabelText("Choose the run's file"), {
      target: { files: [new File(["GIF89a"], "cat.gif", { type: "image/gif" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Azathoth takes JSON, text, PDF, PNG, JPEG and WebP files; cat.gif isn't one.",
    );
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("removes a chosen file", async () => {
    open();
    await screen.findByRole("heading", { level: 1, name: "Run summarize" });

    fireEvent.click(screen.getByRole("radio", { name: "File" }));
    fireEvent.change(screen.getByLabelText("Choose the run's file"), {
      target: { files: [new File(["x"], "a.json", { type: "application/json" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    expect(screen.getByText("Drop a file here, or choose one")).toBeVisible();
  });

  it("says on what each step would run, once Azathoth has said it could", async () => {
    open();

    expect(await screen.findByRole("heading", { name: "Ready to run here" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Each step" })).toHaveTextContent(
      "Runs on openai/gpt-large, or 1 more if it fails.",
    );
  });

  it("waits while Azathoth is asked, and won't run what couldn't run here", async () => {
    open({ ...ANSWERS, "/api/workflows/readiness": [200, NOT_READY] });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Asking Azathoth whether each step could run here…",
    );
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(await screen.findByRole("heading", { name: "It can’t run here now" })).toBeVisible();
    expect(screen.getByText("No model in the portfolio meets this step's needs.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("leaves the run to try when Azathoth couldn't be asked", async () => {
    const sent = open({
      ...ANSWERS,
      "/api/workflows/readiness": [
        502,
        { error: { code: "azathoth_unavailable", message: "Azathoth isn't answering." } },
      ],
    });

    expect(await screen.findByRole("note")).toHaveTextContent("Azathoth isn't answering.");

    await run();

    await screen.findByText("The live run");

    expect(sent).toEqual([{ workflow_id: WORKFLOW.id, input: "" }]);
  });

  it("says why a run didn't start", async () => {
    const refusing: typeof fetch = (input) => {
      const path = urlOf(input).pathname;
      const [status, body] =
        path === "/api/live/runs"
          ? [
              429,
              {
                error: {
                  code: "too_many_runs",
                  message: "4 runs are already running.",
                },
              },
            ]
          : (ANSWERS[path] ?? [404, {}]);

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    };

    renderAt(
      <Routes>
        <Route path="/workflows/:id/run" element={<RunWorkflow />} />
      </Routes>,
      { path: `/workflows/${WORKFLOW.id}/run`, fetcher: refusing },
    );
    await screen.findByRole("heading", { level: 1, name: "Run summarize" });

    await run();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The run didn't start");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("4 runs are already running.");
  });
});
