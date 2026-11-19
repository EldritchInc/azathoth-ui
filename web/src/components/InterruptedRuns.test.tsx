import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import type { Permissions } from "../permissions";
import { INTERRUPTED, INTERRUPTED_INVOCATION, INTERRUPTED_RUNS, RESUMING } from "../test/evidence";
import { SERVER, WORKFLOW, type Answers } from "../test/instances";
import { recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";
import { LIVE_INVOCATION } from "../test/production";
import { InterruptedRuns } from "./InterruptedRuns";

const LIST_PATH = `/api/workflows/${WORKFLOW.id}/interrupted?limit=20`;
const RESUME_PATH = `/api/live/runs/${INTERRUPTED.run_id}/resume`;
const INVOCATION_RESUME_PATH = `/api/live/invocations/${
  INTERRUPTED_INVOCATION.invocation_id ?? ""
}/resume`;

const ANSWERS: Answers = { ...SERVER, [LIST_PATH]: [200, { items: INTERRUPTED_RUNS }] };

function open({
  answers = ANSWERS,
  posts = {},
  sent = [],
  permissions,
}: {
  readonly answers?: Answers;
  readonly posts?: Answers;
  readonly sent?: Sent[];
  readonly permissions?: Permissions;
} = {}) {
  renderAt(
    <Routes>
      <Route path="/workflows/:id/runs" element={<InterruptedRuns workflowId={WORKFLOW.id} />} />
      <Route path="/live/:handle" element={<p>The live resume</p>} />
    </Routes>,
    {
      path: `/workflows/${WORKFLOW.id}/runs`,
      fetcher: recording(answers, posts, sent),
      ...(permissions === undefined ? {} : { permissions }),
    },
  );
}

async function rows(): Promise<HTMLElement[]> {
  const list = await screen.findByRole("list", { name: "Interrupted runs" });

  return within(list).getAllByRole("listitem");
}

describe("InterruptedRuns", () => {
  it("lists each run that stopped part way: when it started, how far it got, how often resumed", async () => {
    open();

    const [run, invocation] = await rows();

    if (run === undefined || invocation === undefined) {
      throw new Error("Two interrupted runs were expected.");
    }

    expect(screen.getByRole("heading", { name: "Interrupted runs" })).toBeVisible();
    expect(within(run).getByText("Interrupted")).toHaveAttribute("data-state", "interrupted");
    expect(run).toHaveTextContent("revision 3");
    expect(run).toHaveTextContent("last recorded");
    expect(run).toHaveTextContent("never resumed");
    expect(within(run).queryByText("Production")).toBeNull();
    expect(invocation).toHaveTextContent("resumed once");
    expect(within(invocation).getByText("Production")).toBeVisible();
    expect(within(invocation).getByRole("link", { name: "Its invocation" })).toHaveAttribute(
      "href",
      `/invocations/${INTERRUPTED_INVOCATION.invocation_id ?? ""}`,
    );
  });

  it("shows nothing while no run is interrupted", async () => {
    const sent: Sent[] = [];
    open({ answers: { ...SERVER, [LIST_PATH]: [200, { items: [] }] }, sent });

    await waitFor(() => {
      expect(sent.some((request) => request.path.endsWith("/interrupted"))).toBe(true);
    });
    expect(screen.queryByRole("heading", { name: "Interrupted runs" })).toBeNull();
  });

  it("says quietly when they can't be listed", async () => {
    open({
      answers: {
        ...SERVER,
        [LIST_PATH]: [503, { error: { code: "unavailable", message: "Down." } }],
      },
    });

    expect(await screen.findByText("Couldn’t list its interrupted runs: Down.")).toBeVisible();
  });

  it("resumes a run as a live run naming its workflow, and opens it", async () => {
    const sent: Sent[] = [];
    open({ posts: { [RESUME_PATH]: [201, RESUMING] }, sent });

    const [run] = await rows();

    if (run === undefined) {
      throw new Error("An interrupted run was expected.");
    }

    fireEvent.click(within(run).getByRole("button", { name: /^Resume/ }));

    expect(await screen.findByText("The live resume")).toBeVisible();
    expect(sent.filter((request) => request.method === "POST")).toEqual([
      { method: "POST", path: RESUME_PATH, body: { workflow_id: WORKFLOW.id } },
    ]);
  });

  it("resumes an invocation's run as its invocation", async () => {
    const sent: Sent[] = [];
    open({ posts: { [INVOCATION_RESUME_PATH]: [201, LIVE_INVOCATION] }, sent });

    const [, invocation] = await rows();

    if (invocation === undefined) {
      throw new Error("An interrupted invocation was expected.");
    }

    fireEvent.click(within(invocation).getByRole("button", { name: /^Resume/ }));

    expect(await screen.findByText("The live resume")).toBeVisible();
    expect(sent.filter((request) => request.method === "POST")).toEqual([
      { method: "POST", path: INVOCATION_RESUME_PATH, body: {} },
    ]);
  });

  it("says why a resume was refused, and lists the runs again", async () => {
    const sent: Sent[] = [];
    open({
      posts: {
        [RESUME_PATH]: [
          409,
          {
            error: {
              code: "run_not_resumable",
              message: `Run ${INTERRUPTED.run_id} has already finished.`,
            },
          },
        ],
      },
      sent,
    });

    const [run] = await rows();

    if (run === undefined) {
      throw new Error("An interrupted run was expected.");
    }

    fireEvent.click(within(run).getByRole("button", { name: /^Resume/ }));

    expect(await screen.findByText("Couldn't resume the run")).toBeVisible();
    expect(screen.getByText(`Run ${INTERRUPTED.run_id} has already finished.`)).toBeVisible();
    await waitFor(() => {
      expect(
        sent.filter((request) => request.method === "GET" && request.path.endsWith("/interrupted")),
      ).toHaveLength(2);
    });
  });

  it("disables resuming where it may not be done, saying why", async () => {
    open({
      permissions: (_instance, action) =>
        action === "run_workflow"
          ? { allowed: false, reason: "Only operators run workflows." }
          : action === "invoke"
            ? { allowed: false, reason: "Only callers invoke." }
            : { allowed: true },
    });

    const [run, invocation] = await rows();

    if (run === undefined || invocation === undefined) {
      throw new Error("Two interrupted runs were expected.");
    }

    const resumeRun = within(run).getByRole("button", { name: /^Resume/ });
    const resumeInvocation = within(invocation).getByRole("button", { name: /^Resume/ });

    expect(resumeRun).toBeDisabled();
    expect(resumeRun).toHaveAccessibleDescription("Only operators run workflows.");
    expect(resumeInvocation).toBeDisabled();
    expect(resumeInvocation).toHaveAccessibleDescription("Only callers invoke.");
  });
});
