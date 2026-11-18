import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import type { InvocationDetail } from "../api/types";
import type { Permissions } from "../permissions";
import { SERVER, WORKFLOW, urlOf, type Answers } from "../test/instances";
import { INCOMPLETE_DETAIL, LIVE_INVOCATION, SUCCEEDED_DETAIL } from "../test/production";
import { renderAt } from "../test/render";
import { RUN_WORKFLOW } from "../test/runs";
import { InvocationPage } from "./InvocationPage";

const RESUMED = [
  201,
  { ...LIVE_INVOCATION, invocation_id: INCOMPLETE_DETAIL.invocation_id },
] as const;

/**
 * Opens one invocation's page, its server answering with `detail`, and a
 * resume with `resumed`; returns the path of every resume it was sent.
 */
function open({
  detail = SUCCEEDED_DETAIL,
  answer,
  resumed = RESUMED,
  permissions,
}: {
  readonly detail?: InvocationDetail;
  readonly answer?: readonly [number, unknown];
  readonly resumed?: readonly [number, unknown];
  readonly permissions?: Permissions;
} = {}): string[] {
  const answers: Answers = {
    ...SERVER,
    [`/api/invocations/${detail.invocation_id}`]: answer ?? [200, detail],
    [`/api/workflows/${WORKFLOW.id}`]: [200, RUN_WORKFLOW],
  };
  const sent: string[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const path = urlOf(input).pathname;
    const resuming = init?.method === "POST";

    if (resuming) {
      sent.push(path);
    }

    const [status, body] = resuming ? resumed : (answers[path] ?? [404, {}]);

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  renderAt(
    <Routes>
      <Route path="/invocations/:invocationId" element={<InvocationPage />} />
      <Route path="/live/:handle" element={<p>The live resume</p>} />
    </Routes>,
    {
      path: `/invocations/${detail.invocation_id}`,
      fetcher,
      ...(permissions === undefined ? {} : { permissions }),
    },
  );

  return sent;
}

describe("InvocationPage", () => {
  it("shows how it ended, who made it, its key, its input, its result and its run", async () => {
    open();

    expect(await screen.findByRole("heading", { level: 1, name: "summarize" })).toBeVisible();
    expect(screen.getByText("Succeeded", { selector: "[data-state]" })).toBeVisible();

    const facts = within(screen.getByRole("list", { name: "About this invocation" }));

    expect(facts.getByText("api-1")).toBeVisible();
    expect(facts.getByText("The editor")).toBeVisible();
    expect(facts.getByText("Internal")).toBeVisible();
    expect(screen.getByLabelText("The invocation's input, as JSON")).toHaveTextContent(
      '"A long ticket."',
    );
    expect(screen.getByLabelText("The invocation's result, as JSON")).toHaveTextContent(
      '"result": "A ticket, summarized."',
    );
    expect(
      screen.getByRole("link", { name: `run ${String(SUCCEEDED_DETAIL.run?.run_id)}` }),
    ).toHaveAttribute("href", `/runs/${String(SUCCEEDED_DETAIL.run?.run_id)}`);
    expect(screen.getByText(/revision 1 · 1 step/)).toBeVisible();
    expect(screen.getByText(SUCCEEDED_DETAIL.command)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Invoke again" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW.id}/invoke`,
    );
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(
      within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", {
        name: "Production",
      }),
    ).toHaveAttribute("href", `/workflows/${WORKFLOW.id}/production`);
  });

  it("says an incomplete invocation's run hasn't finished, and resumes it", async () => {
    const sent = open({ detail: INCOMPLETE_DETAIL });

    expect(await screen.findByText("Incomplete", { selector: "[data-state]" })).toBeVisible();

    const facts = within(screen.getByRole("list", { name: "About this invocation" }));

    expect(facts.getByText("user=billing-agent")).toBeVisible();
    expect(facts.getByText("Restricted")).toBeVisible();
    expect(screen.getByText(/Its run hasn’t finished; it was resumed once\./)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(await screen.findByText("The live resume")).toBeVisible();
    expect(sent).toEqual([`/api/live/invocations/${INCOMPLETE_DETAIL.invocation_id}/resume`]);
  });

  it("hides a restricted invocation's input and result until they are shown", async () => {
    open({ detail: { ...SUCCEEDED_DETAIL, sensitivity: "restricted" } });

    const hidden = await screen.findByRole("group", {
      name: "Restricted: the invocation's input and result",
    });

    expect(screen.queryByLabelText("The invocation's input, as JSON")).toBeNull();
    expect(screen.getByRole("list", { name: "About this invocation" })).toHaveTextContent(
      "Restricted",
    );

    fireEvent.click(within(hidden).getByRole("button", { name: "Show it" }));

    expect(screen.getByLabelText("The invocation's input, as JSON")).toHaveTextContent(
      '"A long ticket."',
    );
  });

  it("says why it failed, with production's code, and that no key was named", async () => {
    open({
      detail: {
        ...SUCCEEDED_DETAIL,
        status: "failed",
        result: null,
        idempotency_key: null,
        error: {
          code: "workflow_result_missing",
          message: "The run declared no result.",
          metadata: {},
        },
      },
    });

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("The run declared no result.");
    expect(alert).toHaveTextContent("workflow_result_missing");
    expect(
      within(screen.getByRole("list", { name: "About this invocation" })).getByText("None named"),
    ).toBeVisible();
    expect(screen.getByText("It produced none.")).toBeVisible();
  });

  it("won't resume where it may not, and says why", async () => {
    open({
      detail: INCOMPLETE_DETAIL,
      permissions: (_instance, action) =>
        action === "invoke"
          ? { allowed: false, reason: "Only callers invoke." }
          : { allowed: true },
    });

    const resume = await screen.findByRole("button", { name: "Resume" });

    expect(resume).toBeDisabled();
    expect(resume).toHaveAccessibleDescription("Only callers invoke.");
  });

  it("says why a resume was refused", async () => {
    open({
      detail: INCOMPLETE_DETAIL,
      resumed: [
        409,
        { error: { code: "conflict", message: "The invocation has already completed." } },
      ],
    });

    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The invocation didn't resume");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("The invocation has already completed.");
  });

  it("says when there is no invocation at its address", async () => {
    open({
      answer: [404, { error: { code: "not_found", message: "No such invocation." } }],
    });

    expect(await screen.findByText("No invocation at this address")).toBeVisible();
    expect(screen.getByText("No such invocation.")).toBeVisible();
  });
});
