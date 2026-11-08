import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./CopyButton";

function clipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

async function click(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    for (let tick = 0; tick < 5; tick += 1) {
      await Promise.resolve();
    }
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
  vi.useRealTimers();
});

describe("CopyButton", () => {
  it("copies its text and says so, then goes back", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    clipboard(writeText);
    render(<CopyButton text="/data/ui.db" label="Copy location" />);

    await click("Copy location");

    expect(writeText).toHaveBeenCalledWith("/data/ui.db");
    expect(screen.getByRole("button")).toHaveTextContent("Copied");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("button")).toHaveTextContent("Copy");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("says when the browser would not copy", async () => {
    clipboard(() => Promise.reject(new DOMException("Denied", "NotAllowedError")));
    render(<CopyButton text="/data/ui.db" label="Copy location" />);

    await click("Copy location");

    expect(screen.getByRole("status")).toHaveTextContent("Couldn't copy");
  });

  it("says so in a browser with no clipboard", async () => {
    render(<CopyButton text="/data/ui.db" label="Copy location" />);

    await click("Copy location");

    expect(screen.getByRole("status")).toHaveTextContent("Couldn't copy");
  });
});
