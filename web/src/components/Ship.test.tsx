import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import type { PullReport, PushReport, RemoteStatus } from "../api/types";
import { firstRemote } from "../remotes";
import { TOOL_DETAIL, WORKFLOW_DETAIL, WORKFLOW_HISTORY } from "../test/documents";
import { SERVER, type Answers } from "../test/instances";
import { AHEAD, ORIGIN, STAGING, recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";

const WORKFLOW_PATH = `/api/workflows/${WORKFLOW_DETAIL.id}`;

const LINEAGE = { kind: "workflow" as const, id: WORKFLOW_DETAIL.id, version: null };

const STANDING: RemoteStatus = {
  remote: ORIGIN.url,
  reachable: true,
  components: [{ ...AHEAD, lineage: LINEAGE }],
  models: [],
  portfolio_synced_at: "2026-11-12T15:30:00Z",
};

const WARNING =
  `Step 5a700000-0000-4000-8000-000000000041 of workflow ${WORKFLOW_DETAIL.id} uses model ` +
  "openrouter/acme/large, which the remote has not authorized; it cannot run there until the " +
  "remote's portfolio holds it.";

const PUSHED: PushReport = {
  remote: ORIGIN.url,
  received: [{ lineage: LINEAGE, revision_digest: "b".repeat(64), number: 2 }],
  already_held: 1,
  content_sent: 0,
  unresolved: [],
  warnings: [WARNING],
};

const PULLED: PullReport = {
  remote: ORIGIN.url,
  received: [{ lineage: LINEAGE, revision_digest: "c".repeat(64), number: 4 }],
  already_held: 1,
  content_fetched: 0,
  forked: [LINEAGE],
  withheld: [],
  unresolved: [],
};

const ANSWERS: Answers = {
  ...SERVER,
  [WORKFLOW_PATH]: [200, WORKFLOW_DETAIL],
  [`${WORKFLOW_PATH}/history?limit=100`]: [200, { items: WORKFLOW_HISTORY }],
  [`${WORKFLOW_PATH}/runs?limit=20`]: [200, { items: [] }],
  [`/api/tools/${TOOL_DETAIL.id}/versions/1.0.0`]: [200, TOOL_DETAIL],
  [`/api/tools/${TOOL_DETAIL.id}/history?limit=100&version=1.0.0`]: [200, { items: [TOOL_DETAIL] }],
  "/api/remotes": [200, { items: [ORIGIN, STAGING] }],
  "/api/remotes/origin/status": [200, STANDING],
};

/** Opens a workflow's page, and its Ship panel. */
async function ship(posts: Answers = {}, answers: Answers = ANSWERS): Promise<Sent[]> {
  const sent: Sent[] = [];
  renderAt(<App />, {
    path: `/workflows/${WORKFLOW_DETAIL.id}`,
    fetcher: recording(answers, posts, sent),
  });

  fireEvent.click(await screen.findByRole("button", { name: "Ship" }));

  return sent;
}

describe("Ship", () => {
  it("asks the remote where this one workflow stands", async () => {
    const sent = await ship();
    const panel = await screen.findByRole("region", { name: "Ship" });

    expect(await within(panel).findByText("Ahead here")).toBeVisible();
    expect(within(panel).getByText(/revision 2/)).toBeVisible();
    expect(within(panel).getByLabelText("Ship to")).toHaveValue("origin");
    expect(within(panel).getByRole("link", { name: "Everything at origin" })).toHaveAttribute(
      "href",
      "/remotes/origin",
    );
    expect(sent.find((request) => request.path === "/api/remotes/origin/status")?.body).toEqual({
      workflows: [WORKFLOW_DETAIL.id],
    });
  });

  it("asks before pushing, then shows what the remote received and each warning", async () => {
    const sent = await ship({ "/api/remotes/origin/push": [200, PUSHED] });
    const panel = await screen.findByRole("region", { name: "Ship" });

    fireEvent.click(await within(panel).findByRole("button", { name: "Push…" }));

    const confirm = within(panel).getByRole("group", { name: "Confirm the push" });

    expect(confirm).toHaveTextContent("Each revision it receives stays there");
    expect(sent.some((request) => request.path.endsWith("/push"))).toBe(false);

    fireEvent.click(within(confirm).getByRole("button", { name: "Push to origin" }));

    const report = await within(panel).findByRole("status", { name: "Push report" });

    expect(report).toHaveTextContent("origin received 1 revision.");
    expect(report).toHaveTextContent("1 was already held.");
    expect(within(report).getByRole("list", { name: "Received by origin" })).toHaveTextContent(
      "summarize as revision 2",
    );
    expect(within(report).getByRole("list", { name: "Warnings" })).toHaveTextContent(WARNING);
    expect(sent.find((request) => request.path === "/api/remotes/origin/push")?.body).toEqual({
      workflows: [WORKFLOW_DETAIL.id],
    });
    await waitFor(() => {
      expect(
        sent.filter((request) => request.path === "/api/remotes/origin/status").length,
      ).toBeGreaterThan(1);
    });
  });

  it("pushes nothing when the push is cancelled", async () => {
    const sent = await ship({ "/api/remotes/origin/push": [200, PUSHED] });
    const panel = await screen.findByRole("region", { name: "Ship" });

    fireEvent.click(await within(panel).findByRole("button", { name: "Push…" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));

    expect(within(panel).queryByRole("group", { name: "Confirm the push" })).toBeNull();
    expect(sent.some((request) => request.path.endsWith("/push"))).toBe(false);
  });

  it("offers no push when the remote holds the same revision", async () => {
    await ship(
      {},
      {
        ...ANSWERS,
        "/api/remotes/origin/status": [
          200,
          { ...STANDING, components: [{ ...AHEAD, lineage: LINEAGE, relation: "in_sync" }] },
        ],
      },
    );
    const panel = await screen.findByRole("region", { name: "Ship" });

    expect(await within(panel).findByText("In sync")).toBeVisible();
    expect(within(panel).queryByRole("button", { name: "Push…" })).toBeNull();
  });

  it("offers a pull when the push has diverged, and says what the pull forked", async () => {
    const message =
      `Workflow ${WORKFLOW_DETAIL.id} has diverged: its latest revision here, ${"b".repeat(64)}, ` +
      "is not the one revision builds on. Pull first, then push again.";
    const sent = await ship({
      "/api/remotes/origin/push": [409, { error: { code: "remote_diverged", message } }],
      "/api/remotes/origin/pull": [200, PULLED],
    });
    const panel = await screen.findByRole("region", { name: "Ship" });

    fireEvent.click(await within(panel).findByRole("button", { name: "Push…" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Push to origin" }));

    expect(await within(panel).findByRole("alert")).toHaveTextContent(message);

    fireEvent.click(within(panel).getByRole("button", { name: "Pull from origin" }));

    const report = await within(panel).findByRole("status", { name: "Pull report" });

    expect(report).toHaveTextContent("Saved 1 revision from origin.");
    expect(within(report).getByRole("list", { name: "Forked" })).toHaveTextContent("summarize");
    expect(sent.find((request) => request.path === "/api/remotes/origin/pull")?.body).toEqual({
      workflows: [WORKFLOW_DETAIL.id],
    });
    await waitFor(() => {
      expect(sent.filter((request) => request.path === WORKFLOW_PATH).length).toBeGreaterThan(1);
    });
  });

  it("offers a pull, not a push, when the status says it has diverged", async () => {
    await ship(
      {},
      {
        ...ANSWERS,
        "/api/remotes/origin/status": [
          200,
          { ...STANDING, components: [{ ...AHEAD, lineage: LINEAGE, relation: "diverged" }] },
        ],
      },
    );
    const panel = await screen.findByRole("region", { name: "Ship" });

    expect(await within(panel).findByRole("button", { name: "Pull from origin" })).toBeVisible();
    expect(within(panel).queryByRole("button", { name: "Push…" })).toBeNull();
  });

  it("asks nothing of a remote whose token isn't set, and says which variable to set", async () => {
    const sent = await ship();
    const panel = await screen.findByRole("region", { name: "Ship" });

    fireEvent.change(await within(panel).findByLabelText("Ship to"), {
      target: { value: "staging" },
    });

    expect(within(panel).getByRole("note")).toHaveTextContent("AZATHOTH_STAGING_TOKEN isn't set");
    expect(within(panel).queryByRole("button", { name: "Push…" })).toBeNull();
    expect(sent.some((request) => request.path.startsWith("/api/remotes/staging"))).toBe(false);
  });

  it("says when the remote isn't answering, and still offers the push", async () => {
    await ship(
      {},
      {
        ...ANSWERS,
        "/api/remotes/origin/status": [
          200,
          {
            ...STANDING,
            reachable: false,
            components: [{ ...AHEAD, lineage: LINEAGE, relation: null }],
          },
        ],
      },
    );
    const panel = await screen.findByRole("region", { name: "Ship" });

    expect(await within(panel).findByText(/isn't answering/)).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Push…" })).toBeVisible();
  });

  it("says to name a remote when none is", async () => {
    await ship({}, { ...ANSWERS, "/api/remotes": [200, { items: [] }] });

    expect(await screen.findByRole("link", { name: "Name your team's remote" })).toHaveAttribute(
      "href",
      "/remotes",
    );
  });

  it("ships a tool version by its id and version", async () => {
    const sent: Sent[] = [];
    renderAt(<App />, {
      path: `/tools/${TOOL_DETAIL.id}/versions/1.0.0`,
      fetcher: recording(ANSWERS, {}, sent),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Ship" }));

    await waitFor(() => {
      expect(sent.find((request) => request.path === "/api/remotes/origin/status")?.body).toEqual({
        tools: [{ id: TOOL_DETAIL.id, version: "1.0.0" }],
      });
    });
  });
});

describe("firstRemote", () => {
  it("starts on the first remote whose token is set, or else the first", () => {
    expect(firstRemote([STAGING, ORIGIN])).toBe(ORIGIN);
    expect(firstRemote([STAGING])).toBe(STAGING);
    expect(firstRemote([])).toBeUndefined();
  });
});
