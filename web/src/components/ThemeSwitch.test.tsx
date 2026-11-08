import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeSwitch } from "./ThemeSwitch";

describe("ThemeSwitch", () => {
  it("offers the system's theme, light and dark, with the current one chosen", () => {
    render(<ThemeSwitch choice="dark" onChoose={vi.fn()} />);

    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Match system" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("reports the theme chosen", () => {
    const onChoose = vi.fn();
    render(<ThemeSwitch choice="system" onChoose={onChoose} />);

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));

    expect(onChoose).toHaveBeenCalledWith("light");
  });
});
