import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JUDGES, LARGE_JUDGE, SMALL_JUDGE } from "../test/evidence";
import {
  BEDROCK_MODEL,
  LARGE_MODEL,
  LISTED_AT,
  SERVER,
  SMALL_MODEL,
  type Answers,
} from "../test/instances";
import { recording, type Sent } from "../test/remotes";
import { renderAt } from "../test/render";
import { JudgeList } from "./JudgeList";

/** The Bedrock model, authorized here, and not a judge yet. */
const BEDROCK = { ...BEDROCK_MODEL, authorized: true };

/** An instance whose rotation holds both Acme models, and which authorizes the Bedrock one. */
const ROTATION: Answers = {
  ...SERVER,
  "/api/models": [200, { items: [LARGE_MODEL, SMALL_MODEL, BEDROCK], listed_at: LISTED_AT }],
  "/api/judges": [200, { items: JUDGES }],
};

function rows(): HTMLElement[] {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

describe("JudgeList", () => {
  it("lists the rotation in the order judges are tried, marking one no longer authorized", async () => {
    renderAt(<JudgeList />, { answers: ROTATION });

    expect(await screen.findByRole("heading", { level: 1, name: "Judges" })).toBeVisible();
    await screen.findByRole("link", { name: "Acme Large" });
    const [first, second] = rows();

    if (first === undefined || second === undefined) {
      throw new Error("Two rows were expected.");
    }

    expect(rows()).toHaveLength(2);
    expect(within(first).getByRole("cell", { name: "1" })).toBeVisible();
    expect(within(first).getByRole("link", { name: "Acme Large" })).toHaveAttribute(
      "href",
      "/models/openrouter/acme/large",
    );
    expect(first).toHaveTextContent(LARGE_JUDGE.identifier);
    expect(first).toHaveTextContent("Authorized");
    expect(within(second).getByRole("cell", { name: "2" })).toBeVisible();
    expect(second).toHaveTextContent("Not authorized: never asked to judge");
    expect(screen.getByText(LARGE_JUDGE.command)).toBeVisible();
  });

  it("names a judge by its identifier when the catalog no longer lists it", async () => {
    renderAt(<JudgeList />, {
      answers: {
        ...ROTATION,
        "/api/models": [200, { items: [], listed_at: LISTED_AT }],
      },
    });

    expect(await screen.findByRole("link", { name: SMALL_JUDGE.identifier })).toHaveAttribute(
      "href",
      "/models/openrouter/acme/small%3Afree",
    );
  });

  it("says when there is no judge yet", async () => {
    renderAt(<JudgeList />, { answers: { ...ROTATION, "/api/judges": [200, { items: [] }] } });

    expect(await screen.findByText("No judge yet")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says when the rotation can't be listed", async () => {
    renderAt(<JudgeList />, {
      answers: {
        ...ROTATION,
        "/api/judges": [503, { error: { code: "unavailable", message: "Down." } }],
      },
    });

    expect(await screen.findByText("Couldn't list the judges")).toBeVisible();
    expect(screen.getByText("Down.")).toBeVisible();
  });

  it("offers only the authorized models that are not judges yet, and adds one", async () => {
    const sent: Sent[] = [];
    renderAt(<JudgeList />, {
      fetcher: recording(ROTATION, { "/api/judges": [201, { ...LARGE_JUDGE, position: 3 }] }, sent),
    });

    const form = await screen.findByRole("form", { name: "Add a judge" });
    const model = within(form).getByLabelText("Model");

    await waitFor(() => {
      expect(
        within(model)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["zeta.mini-v1"]);
    });
    fireEvent.change(model, { target: { value: BEDROCK.identifier } });
    fireEvent.click(within(form).getByRole("button", { name: "Add judge" }));

    await waitFor(() => {
      expect(sent.filter((request) => request.method === "POST")).toEqual([
        { method: "POST", path: "/api/judges", body: { identifier: BEDROCK.identifier } },
      ]);
    });
    await waitFor(() => {
      expect(
        sent.filter((request) => request.method === "GET" && request.path === "/api/judges"),
      ).toHaveLength(2);
    });
  });

  it("says when every authorized model is a judge already", async () => {
    renderAt(<JudgeList />, {
      answers: {
        ...ROTATION,
        "/api/models": [200, { items: [LARGE_MODEL, SMALL_MODEL], listed_at: LISTED_AT }],
      },
    });

    expect(await screen.findByText("Every authorized model is a judge already.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add judge" })).toBeNull();
  });

  it("shows why Azathoth would not add a judge", async () => {
    renderAt(<JudgeList />, {
      fetcher: recording(
        ROTATION,
        {
          "/api/judges": [
            403,
            { error: { code: "model_not_authorized", message: "zeta.mini-v1 isn't authorized." } },
          ],
        },
        [],
      ),
    });

    const form = await screen.findByRole("form", { name: "Add a judge" });
    await within(form).findByRole("option", { name: "zeta.mini-v1" });
    fireEvent.click(within(form).getByRole("button", { name: "Add judge" }));

    expect(await screen.findByText("Couldn't add the judge")).toBeVisible();
    expect(screen.getByText("zeta.mini-v1 isn't authorized.")).toBeVisible();
  });

  it("asks before removing a judge, naming the instance, and removes it once confirmed", async () => {
    const sent: Sent[] = [];
    renderAt(<JudgeList />, {
      fetcher: recording(ROTATION, { "/api/judges/remove": [200, LARGE_JUDGE] }, sent),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Remove Acme Large" }));
    let confirm = within(screen.getByRole("group", { name: "Remove judge" }));

    expect(
      confirm.getByText("Remove Acme Large from the judges on your local instance?"),
    ).toBeVisible();
    expect(confirm.getByText("Each judge after it moves up one place.")).toBeVisible();

    fireEvent.click(confirm.getByRole("button", { name: "Keep it" }));

    expect(screen.queryByRole("group", { name: "Remove judge" })).toBeNull();
    expect(sent.some((request) => request.method === "POST")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Remove Acme Large" }));
    confirm = within(screen.getByRole("group", { name: "Remove judge" }));
    fireEvent.click(confirm.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(sent.filter((request) => request.method === "POST")).toEqual([
        {
          method: "POST",
          path: "/api/judges/remove",
          body: { identifier: LARGE_JUDGE.identifier },
        },
      ]);
    });
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "Remove judge" })).toBeNull();
    });
  });

  it("shows why a judge could not be removed", async () => {
    renderAt(<JudgeList />, {
      fetcher: recording(
        ROTATION,
        {
          "/api/judges/remove": [
            404,
            { error: { code: "not_found", message: "acme/large is not a judge." } },
          ],
        },
        [],
      ),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Remove Acme Large" }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Remove judge" })).getByRole("button", {
        name: "Remove",
      }),
    );

    expect(await screen.findByText("Couldn't remove the judge")).toBeVisible();
    expect(screen.getByText("acme/large is not a judge.")).toBeVisible();
  });

  it("disables adding and removing where judges may not be managed, saying why", async () => {
    renderAt(<JudgeList />, {
      answers: ROTATION,
      permissions: (_instance, action) =>
        action === "manage_judges"
          ? { allowed: false, reason: "Only admins keep the judges." }
          : { allowed: true },
    });

    const remove = await screen.findByRole("button", { name: "Remove Acme Large" });
    const form = await screen.findByRole("form", { name: "Add a judge" });

    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription("Only admins keep the judges.");
    expect(within(form).getByRole("button", { name: "Add judge" })).toBeDisabled();
  });
});
