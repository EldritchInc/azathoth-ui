import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import type { Permissions } from "../permissions";
import { SERVER, WORKFLOW, urlOf, type Answers } from "../test/instances";
import { LIVE_INVOCATION, PRODUCTION } from "../test/production";
import { renderAt } from "../test/render";
import { RUN_WORKFLOW } from "../test/runs";
import { InvokeWorkflow } from "./InvokeWorkflow";

const ANSWERS: Answers = {
  ...SERVER,
  [`/api/workflows/${WORKFLOW.id}`]: [200, RUN_WORKFLOW],
  [`/api/workflows/${WORKFLOW.id}/production`]: [200, { production: PRODUCTION }],
};

const STARTED = [201, LIVE_INVOCATION] as const;

/**
 * Opens the invoke page with a server that answers each invocation's start
 * with `started`, keeping what each start sent.
 */
function open({
  answers = ANSWERS,
  started = STARTED,
  permissions,
}: {
  readonly answers?: Answers;
  readonly started?: readonly [number, unknown];
  readonly permissions?: Permissions;
} = {}) {
  const sent: unknown[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const path = urlOf(input).pathname;
    const starting = path === "/api/live/invocations";

    if (starting && typeof init?.body === "string") {
      sent.push(JSON.parse(init.body));
    }

    const [status, body] = starting ? started : (answers[path] ?? [404, {}]);

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  renderAt(
    <Routes>
      <Route path="/workflows/:id/invoke" element={<InvokeWorkflow />} />
      <Route path="/live/:handle" element={<p>The live invocation</p>} />
    </Routes>,
    {
      path: `/workflows/${WORKFLOW.id}/invoke`,
      fetcher,
      ...(permissions === undefined ? {} : { permissions }),
    },
  );

  return sent;
}

/** Invokes it, once production has said what it runs. */
async function invoke() {
  const button = screen.getByRole("button", { name: "Invoke" });

  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  fireEvent.click(button);
}

describe("InvokeWorkflow", () => {
  it("invokes production on the input given, and opens the live invocation", async () => {
    const sent = open();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Invoke summarize" }),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("The run's input, as text"), {
      target: { value: "My printer is on fire." },
    });
    await invoke();

    expect(await screen.findByText("The live invocation")).toBeVisible();
    expect(sent).toEqual([{ workflow_id: WORKFLOW.id, input: "My printer is on fire." }]);
  });

  it("sends the idempotency key when one is named", async () => {
    const sent = open();
    await screen.findByRole("heading", { level: 1, name: "Invoke summarize" });

    fireEvent.change(screen.getByLabelText("Idempotency key"), {
      target: { value: "  order-7 " },
    });

    expect(screen.getByLabelText("Idempotency key")).toHaveAccessibleDescription(
      /production answers with the first invocation’s outcome/,
    );

    await invoke();
    await screen.findByText("The live invocation");

    expect(sent).toEqual([{ workflow_id: WORKFLOW.id, input: "", idempotency_key: "order-7" }]);
  });

  it("labels the invocation's input with the label chosen", async () => {
    const sent = open();
    await screen.findByRole("heading", { level: 1, name: "Invoke summarize" });

    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "The input's label" })).getByRole("radio", {
        name: "Restricted",
      }),
    );
    await invoke();
    await screen.findByText("The live invocation");

    expect(sent).toEqual([{ workflow_id: WORKFLOW.id, input: "", sensitivity: "restricted" }]);
  });

  it("says what production runs, and on which instance", async () => {
    open();

    expect(
      await screen.findByText(/Production runs revision 1 of summarize on your local instance\./),
    ).toBeVisible();
  });

  it("won't invoke what isn't in production, and says where to promote it", async () => {
    open({
      answers: {
        ...ANSWERS,
        [`/api/workflows/${WORKFLOW.id}/production`]: [200, { production: null }],
      },
    });

    expect(
      await screen.findByText(/summarize isn’t in production on your local instance/),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "its Production tab" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW.id}/production`,
    );
    expect(screen.getByRole("button", { name: "Invoke" })).toBeDisabled();
  });

  it("won't invoke where it may not, and says why", async () => {
    open({
      permissions: (_instance, action) =>
        action === "invoke"
          ? { allowed: false, reason: "Only callers invoke." }
          : { allowed: true },
    });
    await screen.findByText(/Production runs revision 1/);

    const button = screen.getByRole("button", { name: "Invoke" });

    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Only callers invoke.");
  });

  it("says why an invocation didn't start", async () => {
    open({
      started: [429, { error: { code: "too_many_runs", message: "4 runs are already running." } }],
    });
    await screen.findByRole("heading", { level: 1, name: "Invoke summarize" });

    await invoke();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The invocation didn't start");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("4 runs are already running.");
  });
});
