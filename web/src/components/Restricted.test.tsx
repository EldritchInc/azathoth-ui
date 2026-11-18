import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Permissions } from "../permissions";
import { renderAt } from "../test/render";
import { Restricted, RestrictedScope } from "./Restricted";

/** Renders two pieces of data under one page's scope, as a run's page shows its input and result. */
function open({
  sensitivity = "restricted",
  permissions,
}: {
  readonly sensitivity?: "public" | "internal" | "restricted";
  readonly permissions?: Permissions;
} = {}) {
  return renderAt(
    <RestrictedScope>
      <Restricted sensitivity={sensitivity} what="the run's input" subject="r1">
        <p>The input</p>
      </Restricted>
      <Restricted sensitivity={sensitivity} what="the run's result" subject="r1" inline>
        <p>The result</p>
      </Restricted>
    </RestrictedScope>,
    permissions === undefined ? {} : { permissions },
  );
}

describe("Restricted", () => {
  it("shows data that isn't restricted as it is", () => {
    open({ sensitivity: "internal" });

    expect(screen.getByText("The input")).toBeVisible();
    expect(screen.getByText("The result")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show it" })).toBeNull();
  });

  it("hides restricted data until it is shown, and says why", () => {
    open();

    expect(screen.queryByText("The input")).toBeNull();
    expect(screen.queryByText("The result")).toBeNull();

    const hidden = within(screen.getByRole("group", { name: "Restricted: the run's input" }));

    expect(hidden.getByText("This is restricted data")).toBeVisible();
    expect(
      hidden.getByText(/labelled restricted, so it stays hidden until you show it/),
    ).toBeVisible();
  });

  it("shows everything restricted on the page once any of it is shown", () => {
    open();

    fireEvent.click(
      within(screen.getByRole("group", { name: "Restricted: the run's result" })).getByRole(
        "button",
        { name: "Show it" },
      ),
    );

    expect(screen.getByText("The input")).toBeVisible();
    expect(screen.getByText("The result")).toBeVisible();
    expect(screen.queryByText("This is restricted data")).toBeNull();
  });

  it("hides it again the next time the page is opened", () => {
    const first = open();

    fireEvent.click(screen.getAllByRole("button", { name: "Show it" })[0] ?? document.body);

    expect(screen.getByText("The input")).toBeVisible();

    first.unmount();
    open();

    expect(screen.queryByText("The input")).toBeNull();
  });

  it("never shows it where reading restricted data is refused, and says why", () => {
    open({
      permissions: (_instance, action) =>
        action === "read_restricted"
          ? { allowed: false, reason: "Only auditors read restricted data." }
          : { allowed: true },
    });

    for (const button of screen.getAllByRole("button", { name: "Show it" })) {
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription("Only auditors read restricted data.");
    }
    expect(screen.queryByText("The input")).toBeNull();
  });
});
