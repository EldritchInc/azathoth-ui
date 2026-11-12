import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { TOOL, WORKFLOW } from "../test/instances";
import type { PullReport } from "../api/types";
import { AHEAD, REACHED, REMOTES, THEIRS, UNREACHED, recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";
import { RemotePage } from "./RemotePage";

const PULLED: PullReport = {
  remote: REACHED.remote,
  received: [{ lineage: THEIRS.lineage, revision_digest: "b".repeat(64), number: 1 }],
  already_held: 0,
  content_fetched: 0,
  forked: [],
  withheld: [],
  unresolved: [],
};

function open(path: string, fetcher: typeof fetch) {
  renderAt(
    <Routes>
      <Route path="/remotes/:name" element={<RemotePage />} />
    </Routes>,
    { path, fetcher },
  );
}

describe("RemotePage", () => {
  it("asks the remote for everything either side holds", async () => {
    const sent: Sent[] = [];
    open("/remotes/origin", recording(REMOTES, {}, sent));

    expect(await screen.findByRole("heading", { level: 1, name: "origin" })).toBeVisible();
    await screen.findByRole("region", { name: "Ahead here" });
    expect(sent.find((request) => request.path === "/api/remotes/origin/status")).toEqual({
      method: "POST",
      path: "/api/remotes/origin/status",
      body: {},
    });
  });

  it("groups components by relation, what needs a person first and what agrees folded last", async () => {
    open("/remotes/origin", recording(REMOTES, {}, []));

    const ahead = await screen.findByRole("region", { name: "Ahead here" });
    const theirs = screen.getByRole("region", { name: "Only there" });
    const groups = screen.getAllByRole("heading", { level: 2 }).map((each) => each.textContent);

    expect(groups).toEqual(["Ahead here 1", "Only there 1", "Models"]);
    expect(within(ahead).getByRole("link", { name: "summarize" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW.id}`,
    );
    expect(within(ahead).getByText("revision 2")).toBeVisible();
    expect(within(ahead).getByText("revision 1")).toBeVisible();
    expect(within(ahead).getAllByText("aaaaaaaaaaaa")).toHaveLength(2);
    expect(within(theirs).queryByRole("link")).toBeNull();
    expect(
      within(theirs).getByText(THEIRS.lineage.id, { selector: ":not(.visually-hidden)" }),
    ).toBeVisible();
    expect(within(theirs).getByText("none")).toBeVisible();
    expect(within(theirs).getByText("not in production")).toBeVisible();

    const inSync = screen.getByText(/^In sync/).closest("details");

    if (inSync === null) {
      throw new Error("In sync should fold into details.");
    }

    expect(inSync).not.toHaveAttribute("open");
    expect(within(inSync).getByRole("link", { name: "count_words 1.0.0" })).toHaveAttribute(
      "href",
      `/tools/${TOOL.id}/versions/1.0.0`,
    );
  });

  it("says where each model is authorized", async () => {
    open("/remotes/origin", recording(REMOTES, {}, []));

    const models = await screen.findByRole("region", { name: "Models" });
    const rows = within(models).getAllByRole("row").slice(1);

    expect(rows.map((row) => row.textContent)).toEqual([
      "openrouter/acme/largeyesno",
      "bedrock/zeta.mini-v1noyes",
    ]);
  });

  it("says when the remote isn't answering, and how old its models are", async () => {
    open(
      "/remotes/origin",
      recording({ ...REMOTES, "/api/remotes/origin/status": [200, UNREACHED] }, {}, []),
    );

    expect(await screen.findByRole("note")).toHaveTextContent("The remote isn't answering");
    expect(screen.getByRole("note")).toHaveTextContent("Its models are as it last said");

    const unknown = screen.getByRole("region", { name: "Unknown there" });

    expect(within(unknown).getAllByText("unknown")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Models" })).getByText("no")).toBeVisible();
  });

  it("says a remote's models were never read when it never answered", async () => {
    open(
      "/remotes/origin",
      recording(
        {
          ...REMOTES,
          "/api/remotes/origin/status": [200, { ...UNREACHED, portfolio_synced_at: null }],
        },
        {},
        [],
      ),
    );

    expect(await screen.findByRole("note")).toHaveTextContent("Its models were never read here.");
  });

  it("asks nothing of a remote whose token isn't set, and says how to set it", async () => {
    const sent: Sent[] = [];
    open("/remotes/staging", recording(REMOTES, {}, sent));

    expect(await screen.findByRole("note")).toHaveTextContent("AZATHOTH_STAGING_TOKEN isn't set");
    expect(sent.some((request) => request.path.startsWith("/api/remotes/staging"))).toBe(false);
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  it("says when no remote has the name", async () => {
    open("/remotes/elsewhere", recording(REMOTES, {}, []));

    expect(await screen.findByRole("alert")).toHaveTextContent("No remote is named elsewhere");
    expect(screen.getByRole("link", { name: "Name it on the Remotes page" })).toHaveAttribute(
      "href",
      "/remotes",
    );
  });

  it("asks again when Refresh is pressed", async () => {
    const sent: Sent[] = [];
    open("/remotes/origin", recording(REMOTES, {}, sent));

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(sent.filter((request) => request.path === "/api/remotes/origin/status")).toHaveLength(
        2,
      );
    });
  });

  it("passes on what the server says when it can't ask", async () => {
    open(
      "/remotes/origin",
      recording(
        {
          ...REMOTES,
          "/api/remotes/origin/status": [
            403,
            {
              error: {
                code: "remote_refused",
                message: "This remote does not know the token given.",
              },
            },
          ],
        },
        {},
        [],
      ),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This remote does not know the token given.",
    );
  });

  it("names a component this instance doesn't list by its id", async () => {
    open(
      "/remotes/origin",
      recording(
        {
          ...REMOTES,
          "/api/remotes/origin/status": [
            200,
            { ...REACHED, components: [{ ...AHEAD, lineage: { ...AHEAD.lineage, id: "x" } }] },
          ],
        },
        {},
        [],
      ),
    );

    const ahead = await screen.findByRole("region", { name: "Ahead here" });

    expect(within(ahead).getByRole("link", { name: "x" })).toHaveAttribute("href", "/workflows/x");
  });

  it("pulls one component the remote holds that this instance lacks, and says what it saved", async () => {
    const sent: Sent[] = [];
    open(
      "/remotes/origin",
      recording(REMOTES, { "/api/remotes/origin/pull": [200, PULLED] }, sent),
    );

    const theirs = await screen.findByRole("region", { name: "Only there" });

    fireEvent.click(within(theirs).getByRole("button", { name: `Pull ${THEIRS.lineage.id}` }));

    const report = await screen.findByRole("status", { name: "Pull report" });

    expect(report).toHaveTextContent("Saved 1 revision from origin.");
    expect(sent.find((request) => request.path === "/api/remotes/origin/pull")?.body).toEqual({
      workflows: [THEIRS.lineage.id],
    });
    await waitFor(() => {
      expect(sent.filter((request) => request.path === "/api/remotes/origin/status")).toHaveLength(
        2,
      );
    });
  });

  it("offers no pull for what is ahead here, or in sync", async () => {
    open("/remotes/origin", recording(REMOTES, {}, []));

    const ahead = await screen.findByRole("region", { name: "Ahead here" });
    const inSync = screen.getByText(/^In sync/).closest("details");

    expect(within(ahead).queryByRole("button", { name: /^Pull/ })).toBeNull();
    expect(inSync?.querySelector("button")).toBeNull();
  });

  it("pulls a whole group at once, each kind by how it is named", async () => {
    const tool = { ...THEIRS, lineage: { kind: "tool" as const, id: "t", version: "2.0.0" } };
    const sent: Sent[] = [];
    open(
      "/remotes/origin",
      recording(
        {
          ...REMOTES,
          "/api/remotes/origin/status": [200, { ...REACHED, components: [THEIRS, tool] }],
        },
        { "/api/remotes/origin/pull": [200, PULLED] },
        sent,
      ),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Pull all 2" }));

    await waitFor(() => {
      expect(sent.find((request) => request.path === "/api/remotes/origin/pull")?.body).toEqual({
        workflows: [THEIRS.lineage.id],
        tools: [{ id: "t", version: "2.0.0" }],
      });
    });
  });

  it("asks before pulling restricted benchmarks it withheld, then pulls only those", async () => {
    const benchmark = { kind: "benchmark" as const, id: "b-restricted", version: null };
    const sent: Sent[] = [];
    open(
      "/remotes/origin",
      recording(
        REMOTES,
        { "/api/remotes/origin/pull": [200, { ...PULLED, withheld: [benchmark] }] },
        sent,
      ),
    );

    const theirs = await screen.findByRole("region", { name: "Only there" });
    fireEvent.click(within(theirs).getByRole("button", { name: `Pull ${THEIRS.lineage.id}` }));

    const report = await screen.findByRole("status", { name: "Pull report" });

    expect(within(report).getByRole("list", { name: "Withheld" })).toHaveTextContent(
      "b-restricted",
    );

    fireEvent.click(within(report).getByRole("button", { name: "Pull the restricted ones too" }));

    const confirm = screen.getByRole("group", { name: "Confirm pulling restricted data" });

    expect(confirm).toHaveTextContent("kept in this editor's database on this computer");
    expect(sent.filter((request) => request.path.endsWith("/pull"))).toHaveLength(1);

    fireEvent.click(within(confirm).getByRole("button", { name: "Pull restricted data" }));

    await waitFor(() => {
      expect(sent.filter((request) => request.path.endsWith("/pull")).at(-1)?.body).toEqual({
        benchmarks: ["b-restricted"],
        include_restricted: true,
      });
    });
  });

  it("pulls nothing restricted when that is cancelled", async () => {
    const benchmark = { kind: "benchmark" as const, id: "b-restricted", version: null };
    const sent: Sent[] = [];
    open(
      "/remotes/origin",
      recording(
        REMOTES,
        { "/api/remotes/origin/pull": [200, { ...PULLED, withheld: [benchmark] }] },
        sent,
      ),
    );

    const theirs = await screen.findByRole("region", { name: "Only there" });
    fireEvent.click(within(theirs).getByRole("button", { name: `Pull ${THEIRS.lineage.id}` }));
    fireEvent.click(await screen.findByRole("button", { name: "Pull the restricted ones too" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("group", { name: "Confirm pulling restricted data" })).toBeNull();
    expect(sent.filter((request) => request.path.endsWith("/pull"))).toHaveLength(1);
  });

  it("says why a pull didn't go through", async () => {
    open(
      "/remotes/origin",
      recording(
        REMOTES,
        {
          "/api/remotes/origin/pull": [
            502,
            { error: { code: "remote_unreachable", message: "The remote could not be reached." } },
          ],
        },
        [],
      ),
    );

    const theirs = await screen.findByRole("region", { name: "Only there" });
    fireEvent.click(within(theirs).getByRole("button", { name: `Pull ${THEIRS.lineage.id}` }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The remote could not be reached.");
  });
});
