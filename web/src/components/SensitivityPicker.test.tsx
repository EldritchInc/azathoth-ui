import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Sensitivity } from "../api/types";
import { SensitivityPicker } from "./SensitivityPicker";

/** Renders a picker that keeps what is chosen, as a form would. */
function Picking({ disabled = false }: { readonly disabled?: boolean }) {
  const [value, setValue] = useState<Sensitivity | null>(null);

  return (
    <>
      <SensitivityPicker value={value} onChange={setValue} disabled={disabled} />
      <output>{value ?? "none"}</output>
    </>
  );
}

function labels() {
  return within(screen.getByRole("radiogroup", { name: "The input's label" }));
}

describe("SensitivityPicker", () => {
  it("leaves the input unlabelled until a label is chosen, saying what that means", () => {
    render(<Picking />);

    expect(labels().getByRole("radio", { name: "Unlabelled" })).toBeChecked();
    expect(screen.getByText("Unlabelled, it counts as internal.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("none");
  });

  it("chooses each of Azathoth's labels, and says where restricted input may go", () => {
    render(<Picking />);

    fireEvent.click(labels().getByRole("radio", { name: "Restricted" }));

    expect(labels().getByRole("radio", { name: "Restricted" })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("restricted");
    expect(
      screen.getByText("Only models declared to neither retain nor train on data may receive it."),
    ).toBeVisible();

    fireEvent.click(labels().getByRole("radio", { name: "Public" }));

    expect(screen.getByRole("status")).toHaveTextContent("public");

    fireEvent.click(labels().getByRole("radio", { name: "Unlabelled" }));

    expect(screen.getByRole("status")).toHaveTextContent("none");
  });

  it("can't be chosen when there is nothing to label", () => {
    render(<Picking disabled />);

    for (const radio of labels().getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
    expect(screen.getByText("Give it input to label.")).toBeVisible();
  });
});
