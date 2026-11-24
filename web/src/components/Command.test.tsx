import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { remoteScope } from "../scope";
import { COMMANDS, SERVER } from "../test/instances";
import { renderAt } from "../test/render";
import { Command } from "./Command";

const STAGING = remoteScope("staging");

const STAGING_ANSWERS = {
  ...SERVER,
  "/api/remotes/staging/commands": [
    200,
    { instance: "staging", prefix: "", suffix: " --remote staging" },
  ],
} as const;

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

  it("asks the instance the page acts on what goes around its commands", async () => {
    const { container } = renderAt(<Command command="azathoth workflow list" />, {
      scope: STAGING,
      answers: STAGING_ANSWERS,
    });

    expect(await screen.findByText("--remote staging")).toBeVisible();
    expect(screen.queryByText(COMMANDS.prefix.trim())).toBeNull();
    expect(container.querySelector("code")).toHaveTextContent(
      /^azathoth workflow list --remote staging$/,
    );
  });

  it("copies the command with what goes after it, for a remote", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderAt(<Command command="azathoth workflow list" />, {
      scope: STAGING,
      answers: STAGING_ANSWERS,
    });
    await screen.findByText("--remote staging");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy command" }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("azathoth workflow list --remote staging");
  });
});
