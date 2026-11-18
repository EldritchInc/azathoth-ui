import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import type { Permissions } from "../permissions";
import type { InstanceScope } from "../scope";
import { WORKFLOW_DETAIL, WORKFLOW_HISTORY } from "../test/documents";
import { SERVER, urlOf, type Answers } from "../test/instances";
import {
  FIRST_PROMOTION,
  PRODUCTION,
  PRODUCTION_REVISIONS,
  ROLLBACK,
  SECOND_PROMOTION,
} from "../test/production";
import { renderAt } from "../test/render";
import { WorkflowPage } from "./ComponentPages";

const ID = WORKFLOW_DETAIL.id;

const STAGING: InstanceScope = {
  name: "staging",
  api: "/api/remotes/staging",
  pages: "/remotes/staging",
};

/** The answers of an editor whose workflow is in production, at `base`, its rollback active. */
function inProduction(base = "/api", production: unknown = PRODUCTION): Answers {
  return {
    ...SERVER,
    [`${base}/commands`]: [200, { instance: "x", prefix: "" }],
    [`${base}/workflows/${ID}`]: [200, WORKFLOW_DETAIL],
    [`${base}/workflows/${ID}/history?limit=100`]: [200, { items: WORKFLOW_HISTORY }],
    [`${base}/workflows/${ID}/production`]: [200, { production }],
    [`${base}/workflows/${ID}/production/revisions?limit=20`]: [
      200,
      { items: production === null ? [] : PRODUCTION_REVISIONS },
    ],
    [`${base}/workflows/${ID}/invocations?limit=20`]: [200, { items: [] }],
  };
}

/** Returns one entry of a list, failing the test if there is none at that place. */
function entry(entries: readonly HTMLElement[], index: number): HTMLElement {
  const found = entries[index];

  if (found === undefined) {
    throw new Error(`The list has no entry ${String(index)}.`);
  }

  return found;
}

interface Sent {
  readonly path: string;
  readonly body: unknown;
}

/**
 * Opens the Production tab with a server answering as `answers` says, and a
 * change with `changed`; returns every change it was sent.
 */
function open({
  answers = inProduction(),
  changed = [201, ROLLBACK] as const,
  scope,
  permissions,
  ui = <App />,
}: {
  readonly answers?: Answers;
  readonly changed?: readonly [number, unknown];
  readonly scope?: InstanceScope;
  readonly permissions?: Permissions;
  readonly ui?: ReactNode;
} = {}): Sent[] {
  const sent: Sent[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const url = urlOf(input);
    const key = `${url.pathname}${url.search}`;
    const change = init?.method === "POST";

    if (change) {
      sent.push({
        path: url.pathname,
        body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : null,
      });
    }

    const [status, body] = change ? changed : (answers[key] ?? answers[url.pathname] ?? [404, {}]);

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  renderAt(ui, {
    path: `${scope?.pages ?? ""}/workflows/${ID}/production`,
    fetcher,
    ...(scope === undefined ? {} : { scope }),
    ...(permissions === undefined ? {} : { permissions }),
  });

  return sent;
}

describe("a workflow's tabs", () => {
  it("are its revisions, its runs and its production, the one shown marked", async () => {
    open();

    const tabs = within(await screen.findByRole("navigation", { name: "Workflow" }));

    expect(tabs.getByRole("link", { name: "Revisions" })).toHaveAttribute(
      "href",
      `/workflows/${ID}`,
    );
    expect(tabs.getByRole("link", { name: "Runs" })).toHaveAttribute(
      "href",
      `/workflows/${ID}/runs`,
    );
    expect(tabs.getByRole("link", { name: "Production" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "Revisions" })).not.toHaveAttribute("aria-current");
  });
});

describe("the Production tab", () => {
  it("shows what runs now: the revision, who made it, and each step's models", async () => {
    open();

    const now = within(await screen.findByRole("region", { name: "In production" }));

    expect(await now.findByText("Revision 1")).toBeVisible();
    expect(now.getByText("Eris Discordia")).toBeVisible();
    expect(now.getByText(/Rolled back to/)).toBeVisible();
    expect(now.getByText("openrouter/acme/large")).toBeVisible();
    expect(now.getByText("then openrouter/acme/small:free")).toBeVisible();
  });

  it("lists every production revision, newest first, the active one marked", async () => {
    open();

    const history = within(await screen.findByRole("region", { name: "Production history" }));
    const entries = await history.findAllByRole("listitem");

    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveTextContent("Active");
    expect(entries[0]).toHaveTextContent("Rolled back");
    expect(entries[1]).toHaveTextContent("Promoted revision 2");
    expect(entries[2]).toHaveTextContent("by someone unknown");
    expect(within(entry(entries, 0)).queryByRole("button")).toBeNull();
    expect(
      within(entry(entries, 1)).getByRole("button", { name: "Roll back to this" }),
    ).toBeEnabled();
  });

  it("says when the workflow is not in production, and offers to promote it", async () => {
    open({ answers: inProduction("/api", null) });

    expect(await screen.findByText(/isn't in production on your local instance/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Promote…" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Roll back…" })).toBeNull();
  });

  it("promotes the latest revision once it is confirmed, naming the instance", async () => {
    const sent = open({ answers: inProduction("/api", null), changed: [201, SECOND_PROMOTION] });

    fireEvent.click(await screen.findByRole("button", { name: "Promote…" }));

    const confirm = within(screen.getByRole("group", { name: "Confirm" }));

    expect(
      confirm.getByText(/Promote revision 3 of summarize on your local instance\?/),
    ).toBeVisible();
    expect(sent).toEqual([]);

    fireEvent.click(confirm.getByRole("button", { name: "Promote" }));

    expect(await screen.findByText("Promoted revision 2.")).toBeVisible();
    expect(sent).toEqual([{ path: `/api/workflows/${ID}/promote`, body: {} }]);
  });

  it("rolls back to the revision chosen, saying which models it will run on", async () => {
    const sent = open({ changed: [201, { ...ROLLBACK, restores: SECOND_PROMOTION.revision_id }] });
    const history = within(await screen.findByRole("region", { name: "Production history" }));
    const entries = await history.findAllByRole("listitem");

    fireEvent.click(within(entry(entries, 1)).getByRole("button", { name: "Roll back to this" }));

    const confirm = within(screen.getByRole("group", { name: "Confirm" }));

    expect(
      confirm.getByText(/Roll summarize on your local instance back to revision 2\?/),
    ).toBeVisible();
    expect(confirm.getByText("openrouter/acme/large")).toBeVisible();

    fireEvent.click(confirm.getByRole("button", { name: "Roll back" }));

    await waitFor(() => {
      expect(sent).toEqual([
        { path: `/api/workflows/${ID}/rollback`, body: { to: SECOND_PROMOTION.revision_id } },
      ]);
    });
  });

  it("rolls back to the revision before, from the top", async () => {
    const sent = open();

    fireEvent.click(await screen.findByRole("button", { name: "Roll back…" }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", {
        name: "Roll back",
      }),
    );

    await waitFor(() => {
      expect(sent).toEqual([{ path: `/api/workflows/${ID}/rollback`, body: {} }]);
    });
  });

  it("says why a rollback was refused, linking to a model to authorize again", async () => {
    open({
      changed: [
        409,
        {
          error: {
            code: "model_not_authorized",
            message:
              `Step s of production revision ${FIRST_PROMOTION.revision_id} uses ` +
              "openrouter/acme/large, which the portfolio no longer authorizes; " +
              "authorize it again before rolling back to it.",
          },
        },
      ],
    });

    fireEvent.click(await screen.findByRole("button", { name: "Roll back…" }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", {
        name: "Roll back",
      }),
    );

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("no longer authorizes");
    expect(within(alert).getByRole("link", { name: "openrouter/acme/large" })).toHaveAttribute(
      "href",
      "/models/openrouter/acme/large",
    );
  });

  it("won't promote where it may not, and says why", async () => {
    open({
      permissions: (_instance, action) =>
        action === "promote"
          ? { allowed: false, reason: "Only releasers promote." }
          : { allowed: true },
    });

    const promote = await screen.findByRole("button", { name: "Promote…" });

    expect(promote).toBeDisabled();
    expect(promote).toHaveAccessibleDescription("Only releasers promote.");
  });

  it("acts on the instance the page is on, and names it", async () => {
    //
    // The editor routes a remote's pages from Azathoth 1.6; the page itself is ready now.
    //
    const sent = open({
      answers: inProduction(STAGING.api),
      scope: STAGING,
      ui: (
        <Routes>
          <Route
            path={`${STAGING.pages}/workflows/:id/production`}
            element={<WorkflowPage tab="production" />}
          />
        </Routes>
      ),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Promote…" }));

    const confirm = within(screen.getByRole("group", { name: "Confirm" }));

    expect(confirm.getByText(/on staging\?/)).toBeVisible();

    fireEvent.click(confirm.getByRole("button", { name: "Promote" }));

    await waitFor(() => {
      expect(sent).toEqual([{ path: `${STAGING.api}/workflows/${ID}/promote`, body: {} }]);
    });
  });
});
