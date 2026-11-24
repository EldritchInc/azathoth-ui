import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { THEME_KEY } from "./theme";
import { JUDGES } from "./test/evidence";
import { REVIEW_WORKFLOW, SERVER, WORKFLOW } from "./test/instances";
import { ORIGIN_ANSWERS, ORIGIN_SERVICE } from "./test/remotes";
import { FINISHED_RUN, LIVE_RUN } from "./test/runs";
import { renderAt } from "./test/render";

describe("App", () => {
  it("shows the instance its server serves, and that it is connected", async () => {
    renderAt(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "ui.db" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Connection" })).toHaveTextContent("Connected");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  it("offers each kind in the local instance, with how many it holds", async () => {
    renderAt(<App />);
    const navigation = screen.getByRole("navigation", { name: "Editor" });
    const workflows = within(navigation).getByRole("link", { name: /^Workflows/ });

    expect(workflows).toHaveAttribute("href", "/workflows");
    expect(await within(workflows).findByText("2")).toBeVisible();
    expect(within(navigation).getByRole("link", { name: /^Tools/ })).toHaveAttribute(
      "href",
      "/tools",
    );
    expect(within(navigation).getByRole("link", { name: /^Benchmarks/ })).toHaveAttribute(
      "href",
      "/benchmarks",
    );
    expect(within(navigation).getByText("Local instance")).toBeVisible();
  });

  it("offers the models, with how many the local portfolio holds", async () => {
    renderAt(<App />);
    const models = within(screen.getByRole("navigation", { name: "Editor" })).getByRole("link", {
      name: /^Models/,
    });

    expect(models).toHaveAttribute("href", "/models");
    expect(await within(models).findByText("1")).toBeVisible();

    fireEvent.click(models);

    expect(await screen.findByRole("heading", { level: 1, name: "Models" })).toBeVisible();
  });

  it("offers the judges, with how many the rotation holds", async () => {
    renderAt(<App />, {
      answers: { ...SERVER, "/api/judges": [200, { items: JUDGES }] },
    });
    const judges = within(screen.getByRole("navigation", { name: "Editor" })).getByRole("link", {
      name: /^Judges/,
    });

    expect(judges).toHaveAttribute("href", "/judges");
    expect(await within(judges).findByText("2")).toBeVisible();

    fireEvent.click(judges);

    expect(await screen.findByRole("heading", { level: 1, name: "Judges" })).toBeVisible();
  });

  it("opens the page its address names, and marks it in the rail", async () => {
    renderAt(<App />, { path: "/tools" });

    expect(await screen.findByRole("heading", { level: 1, name: "Tools" })).toBeVisible();
    expect(screen.getByRole("link", { name: /^Tools/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("goes to a kind's list from the rail", async () => {
    renderAt(<App />);

    fireEvent.click(screen.getByRole("link", { name: /^Benchmarks/ }));

    expect(await screen.findByRole("heading", { level: 1, name: "Benchmarks" })).toBeVisible();
  });

  it("says when there is nothing at an address", () => {
    renderAt(<App />, { path: "/nowhere" });

    expect(
      screen.getByRole("heading", { level: 1, name: "Nothing at this address" }),
    ).toBeVisible();
    expect(screen.getByText("/nowhere")).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to the overview" })).toHaveAttribute("href", "/");
  });

  it("says when the server reports a problem", async () => {
    renderAt(<App />, { answers: {} });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The editor's server reported a problem",
    );
  });

  it("says when this browser has the key of another launch", async () => {
    const refusal = {
      error: {
        code: "unauthenticated",
        message: "Open the address azathoth-ui printed when it started.",
      },
    };
    renderAt(<App />, { answers: { "/api/instance": [401, refusal] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't signed in");
    expect(screen.getByRole("status", { name: "Connection" })).toHaveTextContent("Signed out");
  });

  it("starts with the theme chosen before, and remembers a new choice", () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    renderAt(<App />);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");

    fireEvent.click(screen.getByRole("radio", { name: "Match system" }));

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it("keeps the instance's answers for everyone who asks", async () => {
    renderAt(<App />, { answers: SERVER, path: "/workflows" });

    expect(await screen.findByRole("link", { name: "summarize" })).toBeVisible();
  });

  it("points to the runs that are running, the newest first, and to none once they end", async () => {
    renderAt(<App />, {
      answers: {
        ...SERVER,
        "/api/live": [
          200,
          {
            items: [
              { ...LIVE_RUN, handle: "n3west" },
              LIVE_RUN,
              { ...FINISHED_RUN, handle: "d0ne" },
            ],
          },
        ],
      },
    });
    const navigation = screen.getByRole("navigation", { name: "Editor" });

    expect(await within(navigation).findByRole("link", { name: "2 runs running" })).toHaveAttribute(
      "href",
      "/live/n3west",
    );
  });

  it("shows no runs while none is running", async () => {
    renderAt(<App />, {
      answers: { ...SERVER, "/api/live": [200, { items: [FINISHED_RUN] }] },
    });

    expect(await screen.findByRole("heading", { level: 1, name: "ui.db" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /running/ })).not.toBeInTheDocument();
  });
});

describe("App on a remote", () => {
  it("shows a remote's pages under its name, from the remote, with the rail on it", async () => {
    renderAt(<App />, { path: "/remotes/origin/workflows", answers: ORIGIN_ANSWERS });

    expect(await screen.findByRole("heading", { level: 1, name: "Workflows" })).toBeVisible();
    expect(await screen.findByRole("link", { name: REVIEW_WORKFLOW.name })).toHaveAttribute(
      "href",
      `/remotes/origin/workflows/${REVIEW_WORKFLOW.id}`,
    );
    expect(screen.queryByRole("link", { name: WORKFLOW.name })).toBeNull();

    const navigation = screen.getByRole("navigation", { name: "Editor" });
    const workflows = within(navigation).getByRole("link", { name: /^Workflows/ });

    expect(workflows).toHaveAttribute("href", "/remotes/origin/workflows");
    expect(workflows).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/remotes/origin",
    );
    expect(within(navigation).getByText("origin")).toBeVisible();
    expect(screen.getByTestId("instance-switcher")).toHaveAttribute("data-instance", "origin");
  });

  it("opens a remote on its overview: the instance there, its edition and its jobs", async () => {
    renderAt(<App />, { path: "/remotes/origin", answers: ORIGIN_ANSWERS });

    expect(await screen.findByRole("heading", { level: 1, name: "origin" })).toBeVisible();

    const there = await screen.findByRole("region", { name: "The instance there" });

    expect(await within(there).findByText("studio")).toBeVisible();
    expect(within(there).getByText(ORIGIN_SERVICE.edition_detail ?? "")).toBeVisible();
    expect(await within(there).findByText(/azathoth@db\.example\.com/)).toBeVisible();
    expect(within(there).getByText("2 waiting, 1 running")).toBeVisible();
    expect(await screen.findByRole("region", { name: "Ahead here" })).toBeVisible();

    const navigation = screen.getByRole("navigation", { name: "Editor" });

    expect(within(navigation).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).getByRole("link", { name: /^Remotes/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the editor's own pages for the remotes it names", async () => {
    renderAt(<App />, { path: "/remotes", answers: ORIGIN_ANSWERS });

    expect(await screen.findByRole("heading", { level: 1, name: "Remotes" })).toBeVisible();
    expect(screen.getByTestId("instance-switcher")).toHaveAttribute("data-instance", "local");
    expect(
      within(screen.getByRole("navigation", { name: "Editor" })).getByRole("link", {
        name: /^Remotes/,
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("says when there is nothing at an address on a remote, and leads to its overview", () => {
    renderAt(<App />, { path: "/remotes/origin/nowhere", answers: ORIGIN_ANSWERS });

    expect(
      screen.getByRole("heading", { level: 1, name: "Nothing at this address" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to the overview" })).toHaveAttribute(
      "href",
      "/remotes/origin",
    );
  });
});
