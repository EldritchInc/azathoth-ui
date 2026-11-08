import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { THEME_KEY } from "./theme";
import { SQLITE_INSTANCE, answering } from "./test/instances";

describe("App", () => {
  it("shows the instance its server serves, and that it is connected", async () => {
    vi.stubGlobal("fetch", answering(200, SQLITE_INSTANCE));
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "ui.db" })).toBeVisible();
    expect(screen.getByRole("status", { name: "Connection" })).toHaveTextContent("Connected");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  it("says when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The editor's server isn't answering",
    );
    expect(screen.getByRole("status", { name: "Connection" })).toHaveTextContent("Not answering");
  });

  it("says when this browser has the key of another launch", async () => {
    vi.stubGlobal(
      "fetch",
      answering(401, {
        error: {
          code: "unauthenticated",
          message: "Open the address azathoth-ui printed when it started.",
        },
      }),
    );
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't signed in");
    expect(screen.getByRole("status", { name: "Connection" })).toHaveTextContent("Signed out");
  });

  it("starts with the theme chosen before, and remembers a new choice", () => {
    vi.stubGlobal("fetch", answering(200, SQLITE_INSTANCE));
    window.localStorage.setItem(THEME_KEY, "dark");
    render(<App />);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");

    fireEvent.click(screen.getByRole("radio", { name: "Match system" }));

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
  });
});
