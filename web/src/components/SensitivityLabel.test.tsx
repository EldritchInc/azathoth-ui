import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SensitivityLabel } from "./SensitivityLabel";

describe("SensitivityLabel", () => {
  it("names each of Azathoth's labels, marking which it is", () => {
    render(
      <>
        <SensitivityLabel sensitivity="public" />
        <SensitivityLabel sensitivity="internal" />
        <SensitivityLabel sensitivity="restricted" />
      </>,
    );

    expect(screen.getByText("Public")).toHaveAttribute("data-sensitivity", "public");
    expect(screen.getByText("Internal")).toHaveAttribute("data-sensitivity", "internal");
    expect(screen.getByText("Restricted")).toHaveAttribute("data-sensitivity", "restricted");
  });

  it("says it is a label, for whoever cannot see it is one", () => {
    render(<SensitivityLabel sensitivity="restricted" />);

    expect(screen.getByText("Restricted")).toHaveAttribute("title", "Labelled restricted");
  });
});
