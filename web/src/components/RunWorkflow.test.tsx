import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { SERVER, WORKFLOW, urlOf, type Answers } from "../test/instances";
import { renderAt } from "../test/render";
import { LIVE_RUN, RUN_WORKFLOW } from "../test/runs";
import { RunWorkflow } from "./RunWorkflow";

const ANSWERS: Answers = {
  ...SERVER,
  [`/api/workflows/${WORKFLOW.id}`]: [200, RUN_WORKFLOW],
};

/** Opens the run page with a server that starts every run, keeping what each start sent. */
function open(answers: Answers = ANSWERS) {
  const sent: unknown[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const path = urlOf(input).pathname;

    if (init?.method === "POST" && typeof init.body === "string") {
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

function run() {
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
}

describe("RunWorkflow", () => {
  it("runs a workflow on text, and opens the live run", async () => {
    const sent = open();

    expect(await screen.findByRole("heading", { level: 1, name: "Run summarize" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Text" })).toBeChecked();

    fireEvent.change(screen.getByLabelText("The run's input, as text"), {
      target: { value: "My printer is on fire." },
    });
    run();

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

    run();

    await screen.findByText("The live run");

    expect(sent).toEqual([{ workflow_id: WORKFLOW.id, input: { text: "Hello" } }]);
  });

  it("runs on nothing at all", async () => {
    const sent = open();
    await screen.findByRole("heading", { level: 1, name: "Run summarize" });

    fireEvent.click(screen.getByRole("radio", { name: "Nothing" }));
    run();

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

    run();

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

  it("says why a run didn't start", async () => {
    const refusing: typeof fetch = (input, init) => {
      const path = urlOf(input).pathname;
      const [status, body] =
        init?.method === "POST"
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

    run();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The run didn't start");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("4 runs are already running.");
  });
});
