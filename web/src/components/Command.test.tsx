import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COMMANDS, SERVER } from "../test/instances";
import { renderAt } from "../test/render";
import { Command } from "./Command";

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("Command", () => {
  it("shows the command with the prefix the server writes for the instance", async () => {
    renderAt(<Command command="azathoth workflow list" />);

    expect(await screen.findByText(COMMANDS.prefix.trim())).toBeVisible();
    expect(screen.getByText("azathoth workflow list")).toBeVisible();
  });

  it("copies the prefix and the command together", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderAt(<Command command="azathoth workflow list" />);
    await screen.findByText(COMMANDS.prefix.trim());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy command" }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(`${COMMANDS.prefix}azathoth workflow list`);
  });

  it("shows the command alone until the server says what goes before it", () => {
    const { container } = renderAt(<Command command="azathoth tool list" />, {
      answers: { ...SERVER, "/api/commands": [503, { error: { code: "x", message: "x" } }] },
    });

    expect(container.querySelector("code")).toHaveTextContent(/^azathoth tool list$/);
  });

  it("asks the instance the page acts on what goes before its commands", async () => {
    renderAt(<Command command="azathoth workflow list" />, {
      scope: { name: "staging", api: "/api/remotes/staging", pages: "/remotes/staging" },
      answers: {
        ...SERVER,
        "/api/remotes/staging/commands": [
          200,
          { instance: "staging", prefix: "--remote staging " },
        ],
      },
    });

    expect(await screen.findByText("--remote staging")).toBeVisible();
    expect(screen.queryByText(COMMANDS.prefix.trim())).toBeNull();
  });
});
