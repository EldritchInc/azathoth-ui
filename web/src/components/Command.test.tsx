import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EDITOR, SERVER } from "../test/instances";
import { renderAt } from "../test/render";
import { Command } from "./Command";

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("Command", () => {
  it("shows the command with the prefix that names the editor's database", async () => {
    renderAt(<Command command="azathoth workflow list" />);

    expect(await screen.findByText(EDITOR.command_prefix.trim())).toBeVisible();
    expect(screen.getByText("azathoth workflow list")).toBeVisible();
  });

  it("copies the prefix and the command together", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderAt(<Command command="azathoth workflow list" />);
    await screen.findByText(EDITOR.command_prefix.trim());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy command" }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(`${EDITOR.command_prefix}azathoth workflow list`);
  });

  it("shows the command alone until the editor says how to name its database", () => {
    const { container } = renderAt(<Command command="azathoth tool list" />, {
      answers: { ...SERVER, "/api/editor": [503, { error: { code: "x", message: "x" } }] },
    });

    expect(container.querySelector("code")).toHaveTextContent(/^azathoth tool list$/);
  });
});
