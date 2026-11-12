import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EDITOR, SERVER } from "../test/instances";
import { ORIGIN, REMOTES, STAGING, recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";
import { RemoteList } from "./RemoteList";

describe("RemoteList", () => {
  it("lists each remote with its URL and whether its token is set", async () => {
    renderAt(<RemoteList />, { answers: REMOTES });

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    const [first, second] = rows;

    if (first === undefined || second === undefined) {
      throw new Error("Two rows were expected.");
    }

    expect(rows).toHaveLength(2);
    expect(within(first).getByRole("link", { name: "origin" })).toHaveAttribute(
      "href",
      "/remotes/origin",
    );
    expect(first).toHaveTextContent(ORIGIN.url);
    expect(first).not.toHaveTextContent("not set");
    expect(second).toHaveTextContent("AZATHOTH_STAGING_TOKEN");
    expect(second).toHaveTextContent("not set");
    expect(
      within(second).getByRole("button", {
        name: "Copy: export AZATHOTH_STAGING_TOKEN=<TOKEN>",
      }),
    ).toBeVisible();
    expect(screen.getByRole("note")).toHaveTextContent("A token isn't set");
  });

  it("writes the token line for PowerShell on Windows", async () => {
    renderAt(<RemoteList />, {
      answers: { ...REMOTES, "/api/editor": [200, { ...EDITOR, shell: "powershell" }] },
    });

    expect(
      await screen.findByRole("button", {
        name: 'Copy: $env:AZATHOTH_STAGING_TOKEN = "<TOKEN>"',
      }),
    ).toBeVisible();
  });

  it("says when no remote is named yet", async () => {
    renderAt(<RemoteList />, { answers: SERVER });

    expect(await screen.findByText("No remote is named yet")).toBeVisible();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("names a remote from the form, and lists the remotes again", async () => {
    const sent: Sent[] = [];
    renderAt(<RemoteList />, {
      fetcher: recording(SERVER, { "/api/remotes": [201, ORIGIN] }, sent),
    });

    const form = await screen.findByRole("form", { name: "Name a remote" });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: " origin " } });
    fireEvent.change(within(form).getByLabelText("URL"), { target: { value: ORIGIN.url } });
    fireEvent.click(within(form).getByRole("button", { name: "Name remote" }));

    await waitFor(() => {
      expect(sent.some((request) => request.method === "POST")).toBe(true);
    });
    expect(sent.find((request) => request.method === "POST")).toEqual({
      method: "POST",
      path: "/api/remotes",
      body: { name: "origin", url: ORIGIN.url },
    });
    await waitFor(() => {
      expect(within(form).getByLabelText("Name")).toHaveValue("");
    });
    expect(
      sent.filter((request) => request.method === "GET" && request.path === "/api/remotes"),
    ).toHaveLength(2);
  });

  it("sends another token variable when one is given", async () => {
    const sent: Sent[] = [];
    renderAt(<RemoteList />, {
      fetcher: recording(SERVER, { "/api/remotes": [201, STAGING] }, sent),
    });

    const form = await screen.findByRole("form", { name: "Name a remote" });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "staging" } });
    fireEvent.change(within(form).getByLabelText("URL"), { target: { value: STAGING.url } });
    fireEvent.change(within(form).getByLabelText("Token variable"), {
      target: { value: "AZATHOTH_STAGING_TOKEN" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Name remote" }));

    await waitFor(() => {
      expect(sent.find((request) => request.method === "POST")?.body).toEqual({
        name: "staging",
        url: STAGING.url,
        token_variable: "AZATHOTH_STAGING_TOKEN",
      });
    });
  });

  it("says why Azathoth would not name a remote, and keeps what was typed", async () => {
    const sent: Sent[] = [];
    const message =
      "Remote origin is already named, for https://azathoth.example.com; remove it first, or " +
      "choose another name.";
    renderAt(<RemoteList />, {
      fetcher: recording(
        REMOTES,
        { "/api/remotes": [409, { error: { code: "conflict", message } }] },
        sent,
      ),
    });

    const form = await screen.findByRole("form", { name: "Name a remote" });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "origin" } });
    fireEvent.change(within(form).getByLabelText("URL"), {
      target: { value: "https://other.example.com" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Name remote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(within(form).getByLabelText("Name")).toHaveValue("origin");
  });

  it("forgets a remote's name", async () => {
    const sent: Sent[] = [];
    renderAt(<RemoteList />, {
      fetcher: recording(REMOTES, { "/api/remotes/remove": [200, STAGING] }, sent),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Forget staging" }));

    await waitFor(() => {
      expect(sent.find((request) => request.method === "POST")).toEqual({
        method: "POST",
        path: "/api/remotes/remove",
        body: { name: "staging" },
      });
    });
  });
});
