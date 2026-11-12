import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { TOOL, WORKFLOW } from "../test/instances";
import { AHEAD, REACHED, REMOTES, UNREACHED, recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";
import { RemotePage } from "./RemotePage";

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
    expect(within(theirs).getByText(REACHED.components[2]?.lineage.id ?? "")).toBeVisible();
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
});
