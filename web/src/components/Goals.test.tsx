import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../App";
import type { GoalDetail } from "../api/types";
import type { Permissions } from "../permissions";
import { SERVER, type Answers } from "../test/instances";
import { renderAt } from "../test/render";

const GOAL_ID = "9a000000-0000-4000-8000-000000000001";

const GOAL: GoalDetail = {
  id: GOAL_ID,
  name: "Answer accurately",
  description: "Produce the correct answer for the supplied request.",
  command: `azathoth goal show ${GOAL_ID}`,
  success_criteria: ["The answer matches the expected result.", "The answer remains factual."],
  constraints: [],
  document: {
    id: GOAL_ID,
    name: "Answer accurately",
    description: "Produce the correct answer for the supplied request.",
    success_criteria: ["The answer matches the expected result.", "The answer remains factual."],
    constraints: [],
  },
};

const ANSWERS: Answers = {
  ...SERVER,
  "/api/goals": [200, { items: [GOAL] }],
  [`/api/goals/${GOAL_ID}`]: [200, GOAL],
};

function jsonFile(name: string): File {
  return new File([JSON.stringify(GOAL.document)], name, { type: "application/json" });
}

function choose(file: File): void {
  fireEvent.change(screen.getByLabelText("Choose goal documents"), { target: { files: [file] } });
}

describe("the goals", () => {
  it("are in the rail, counted, and open their page", async () => {
    renderAt(<App />, { answers: ANSWERS });

    const goals = within(screen.getByRole("navigation", { name: "Editor" })).getByRole("link", {
      name: /^Goals/,
    });

    expect(goals).toHaveAttribute("href", "/goals");
    expect(await within(goals).findByText("1")).toBeVisible();

    fireEvent.click(goals);

    expect(await screen.findByRole("heading", { level: 1, name: "Goals" })).toBeVisible();
  });

  it("are listed, each opening its own page", async () => {
    renderAt(<App />, { path: "/goals", answers: ANSWERS });

    const list = await screen.findByRole("list", { name: "Goals" });

    expect(within(list).getByRole("link", { name: GOAL.name })).toHaveAttribute(
      "href",
      `/goals/${GOAL_ID}`,
    );
    expect(list).toHaveTextContent(GOAL.description);
  });

  it("say when there are none, and how to import one", async () => {
    renderAt(<App />, { path: "/goals" });

    expect(await screen.findByText("No goals yet")).toBeVisible();
    expect(screen.getByText("azathoth goal import <FILE>")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import goal" })).toBeEnabled();
  });

  it("import a chosen document, and link to the goal", async () => {
    renderAt(<App />, {
      path: "/goals",
      answers: { ...ANSWERS, "/api/goals/import": [201, { created: true, goal: GOAL }] },
    });
    await screen.findByRole("list", { name: "Goals" });

    choose(jsonFile("goal.json"));

    const imports = await screen.findByRole("list", { name: "Imports" });

    expect(await within(imports).findByText("Imported the goal Answer accurately.")).toBeVisible();
    expect(within(imports).getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      `/goals/${GOAL_ID}`,
    );
  });

  it("say a goal already kept, unchanged, is unchanged", async () => {
    renderAt(<App />, {
      path: "/goals",
      answers: { ...ANSWERS, "/api/goals/import": [200, { created: false, goal: GOAL }] },
    });
    await screen.findByRole("list", { name: "Goals" });

    choose(jsonFile("goal.json"));

    expect(
      await screen.findByText(
        "Answer accurately is unchanged: it is the goal already kept under its ID.",
      ),
    ).toBeVisible();
  });

  it("say why another goal with a kept ID was refused", async () => {
    renderAt(<App />, {
      path: "/goals",
      answers: {
        ...ANSWERS,
        "/api/goals/import": [
          409,
          { error: { code: "conflict", message: `Goal ${GOAL_ID} already exists.` } },
        ],
      },
    });
    await screen.findByRole("list", { name: "Goals" });

    choose(jsonFile("goal.json"));

    expect(await screen.findByText("Couldn't import goal.json")).toBeVisible();
    expect(screen.getByText(`Goal ${GOAL_ID} already exists.`)).toBeVisible();
  });

  it("can't be imported where import_goal is refused, and say why", async () => {
    const refusing: Permissions = (_instance, action) =>
      action === "import_goal"
        ? { allowed: false, reason: "Only curators import goals here." }
        : { allowed: true };

    renderAt(<App />, { path: "/goals", answers: ANSWERS, permissions: refusing });

    const button = await screen.findByRole("button", { name: "Import goal" });

    expect(button).toBeDisabled();
    expect(await screen.findByText("Only curators import goals here.")).toBeInTheDocument();
  });
});

describe("a goal's page", () => {
  it("shows its criteria, its constraints, its command and its document", async () => {
    renderAt(<App />, { path: `/goals/${GOAL_ID}`, answers: ANSWERS });

    expect(await screen.findByRole("heading", { level: 1, name: GOAL.name })).toBeVisible();
    expect(screen.getByRole("region", { name: "Success criteria" })).toHaveTextContent(
      "The answer remains factual.",
    );
    expect(screen.getByRole("region", { name: "Constraints" })).toHaveTextContent(
      "It keeps no constraints.",
    );
    expect(screen.getByText(GOAL.command)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Document" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Download" })).toBeNull();
    expect(
      within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", {
        name: "Goals",
      }),
    ).toHaveAttribute("href", "/goals");
  });

  it("says when there is no goal at its address", async () => {
    renderAt(<App />, {
      path: `/goals/${GOAL_ID}`,
      answers: {
        ...SERVER,
        [`/api/goals/${GOAL_ID}`]: [
          404,
          { error: { code: "not_found", message: `Goal ${GOAL_ID} is not configured.` } },
        ],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("No goal at this address");
  });
});
