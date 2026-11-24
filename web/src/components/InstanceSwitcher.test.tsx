import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { remoteScope, type InstanceScope } from "../scope";
import { SERVER } from "../test/instances";
import { ORIGIN, STAGING } from "../test/remotes";
import { renderAt } from "../test/render";
import { InstanceSwitcher } from "./InstanceSwitcher";

const ON_STAGING: InstanceScope = {
  name: "staging",
  api: "/api/remotes/staging",
  pages: "/remotes/staging",
};

const NAMED = { ...SERVER, "/api/remotes": [200, { items: [ORIGIN, STAGING] }] } as const;

/** Returns the switcher's summary: what it shows before it is opened. */
function summary(): HTMLElement {
  const shown = screen.getByTestId("instance-switcher").querySelector("summary");

  if (shown === null) {
    throw new Error("The switcher has no summary.");
  }

  return shown;
}

function opened(): HTMLElement {
  fireEvent.click(summary());

  return screen.getByRole("navigation", { name: "Instances" });
}

describe("InstanceSwitcher", () => {
  it("says the page acts on the local instance", () => {
    renderAt(<InstanceSwitcher />, { answers: NAMED });

    expect(screen.getByTestId("instance-switcher")).toHaveAttribute("data-instance", "local");
    expect(within(summary()).getByText("Local")).toBeVisible();
  });

  it("lists the local instance and every remote it names, marking the current one", async () => {
    renderAt(<InstanceSwitcher />, { answers: NAMED });

    const instances = opened();
    const origin = await within(instances).findByRole("link", { name: "origin" });

    expect(within(instances).getByRole("link", { name: "Local" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(instances).getByRole("link", { name: "Local" })).toHaveAttribute("href", "/");
    expect(origin).toHaveAttribute("href", "/remotes/origin");
    expect(origin).not.toHaveAttribute("aria-current");
    expect(within(instances).getByRole("link", { name: "staging" })).toHaveAttribute(
      "href",
      "/remotes/staging",
    );
  });

  it("names the remote a page acts on, with its own colour", async () => {
    renderAt(<InstanceSwitcher />, { answers: NAMED, scope: ON_STAGING });

    expect(screen.getByTestId("instance-switcher")).toHaveAttribute("data-instance", "staging");
    expect(within(summary()).getByText("staging")).toBeVisible();

    const instances = opened();

    expect(await within(instances).findByRole("link", { name: "staging" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(instances).getByRole("link", { name: "Local" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("tells a remote named local from the local instance", async () => {
    const local = { ...ORIGIN, name: "local" };
    renderAt(<InstanceSwitcher />, {
      answers: { ...SERVER, "/api/remotes": [200, { items: [local] }] },
      scope: remoteScope("local"),
    });

    expect(within(summary()).getByText("local")).toBeVisible();

    const instances = opened();
    const remote = await within(instances).findByRole("link", { name: "local" });

    expect(remote).toHaveAttribute("href", "/remotes/local");
    expect(remote).toHaveAttribute("aria-current", "true");
    expect(within(instances).getByRole("link", { name: "Local" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("offers only the local instance while no remote is named", async () => {
    renderAt(<InstanceSwitcher />);

    const instances = opened();

    expect(await within(instances).findAllByRole("link")).toHaveLength(1);
  });
});
