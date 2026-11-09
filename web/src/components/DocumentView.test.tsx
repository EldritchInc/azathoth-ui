import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentView } from "./DocumentView";

const DOCUMENT = { name: "count", cases: [1, true, null] };

afterEach(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("DocumentView", () => {
  it("shows the document laid out as JSON, with keys and values marked", () => {
    const { container } = render(<DocumentView document={DOCUMENT} fileName="count-r1.json" />);
    const code = container.querySelector("code");

    expect(code?.textContent).toBe(JSON.stringify(DOCUMENT, null, 2));
    expect(screen.getByLabelText("count-r1.json, as JSON")).toBeVisible();
    expect(container.querySelectorAll("code span")).toHaveLength(6);
  });

  it("downloads the document under its file name", () => {
    const created: Blob[] = [];
    const clicked: string[] = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        created.push(blob);
        return "blob:document";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    render(<DocumentView document={DOCUMENT} fileName="count-r1.json" />);

    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(clicked).toEqual(["count-r1.json"]);
    expect(created).toHaveLength(1);
    expect(created[0]?.type).toBe("application/json");
  });

  it("offers the document to copy", () => {
    render(<DocumentView document={DOCUMENT} fileName="count-r1.json" />);

    expect(screen.getByRole("button", { name: "Copy document" })).toBeEnabled();
  });
});
