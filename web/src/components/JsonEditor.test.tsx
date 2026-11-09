import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { JsonObject } from "../editing";
import { JsonEditor } from "./JsonEditor";

function field(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>("textbox", { name: "The step" });
}

function type(value: string): void {
  fireEvent.change(field(), { target: { value } });
}

describe("JsonEditor", () => {
  it("shows an object as indented JSON", () => {
    render(<JsonEditor label="The step" value={{ a: [1] }} onChange={vi.fn()} />);

    expect(field()).toHaveValue('{\n  "a": [\n    1\n  ]\n}');
    expect(field()).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByText("Changes as you type, while it reads as JSON.")).toBeInTheDocument();
  });

  it("changes the object as each change that reads as one is typed, keeping the text", () => {
    const onChange = vi.fn();

    const { rerender } = render(
      <JsonEditor label="The step" value={{ a: 1 }} onChange={onChange} />,
    );

    type('{"a": 2}');

    expect(onChange).toHaveBeenCalledWith({ a: 2 });

    rerender(<JsonEditor label="The step" value={{ a: 2 }} onChange={onChange} />);

    expect(field()).toHaveValue('{"a": 2}');
  });

  it("changes nothing when only the spacing changes", () => {
    const onChange = vi.fn();

    render(<JsonEditor label="The step" value={{ a: 1 }} onChange={onChange} />);
    type('{"a":1}');

    expect(onChange).not.toHaveBeenCalled();
    expect(field()).toHaveValue('{"a":1}');
  });

  it("keeps text that does not read, and says where and why", () => {
    const onChange = vi.fn();

    render(<JsonEditor label="The step" value={{ a: 1 }} onChange={onChange} />);
    type('{\n  "a": 1,\n}');

    expect(onChange).not.toHaveBeenCalled();
    expect(field()).toHaveValue('{\n  "a": 1,\n}');
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/^Line 3, column 1: /)).toBeInTheDocument();

    type("[1]");

    expect(screen.getByText("It must be a JSON object, in braces.")).toBeInTheDocument();
  });

  it("shows the object again once it changes some other way", () => {
    const value: JsonObject = { a: 1 };
    const { rerender } = render(<JsonEditor label="The step" value={value} onChange={vi.fn()} />);

    type('{"a": 1,');
    rerender(<JsonEditor label="The step" value={{ a: 3 }} onChange={vi.fn()} />);

    expect(field()).toHaveValue('{\n  "a": 3\n}');
    expect(field()).toHaveAttribute("aria-invalid", "false");
  });
});
