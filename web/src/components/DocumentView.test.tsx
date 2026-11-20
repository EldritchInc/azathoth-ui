import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentView } from "./DocumentView";

const DOCUMENT = { name: "count", cases: [1, true, null] };

const EXPORT = "/api/workflows/a1/export?revision=1";

describe("DocumentView", () => {
  it("shows the document laid out as JSON, with keys and values marked", () => {
    const { container } = render(
      <DocumentView document={DOCUMENT} label="count revision 1" exportPath={EXPORT} />,
    );
    const code = container.querySelector("code");

    expect(code?.textContent).toBe(JSON.stringify(DOCUMENT, null, 2));
    expect(screen.getByLabelText("count revision 1, as JSON")).toBeVisible();
    expect(container.querySelectorAll("code span")).toHaveLength(6);
  });

  it("downloads Azathoth's export of the revision, named as Azathoth names it", () => {
    render(<DocumentView document={DOCUMENT} label="count revision 1" exportPath={EXPORT} />);

    const download = screen.getByRole("link", { name: "Download" });

    expect(download).toHaveAttribute("href", EXPORT);
    expect(download).toHaveAttribute("download", "");
  });

  it("says nothing of restricted data unless the document holds some", () => {
    const { rerender } = render(
      <DocumentView document={DOCUMENT} label="count revision 1" exportPath={EXPORT} />,
    );

    expect(screen.queryByText(/holds restricted data/)).toBeNull();

    rerender(
      <DocumentView document={DOCUMENT} label="count revision 1" exportPath={EXPORT} restricted />,
    );

    expect(screen.getByText(/This document holds restricted data/)).toBeVisible();
  });

  it("offers the document to copy", () => {
    render(<DocumentView document={DOCUMENT} label="count revision 1" exportPath={EXPORT} />);

    expect(screen.getByRole("button", { name: "Copy document" })).toBeEnabled();
  });
});
