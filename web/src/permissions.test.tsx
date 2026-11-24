import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { ActionButton } from "./components/ActionButton";
import { ModelPage } from "./components/ModelPage";
import { RunWorkflow } from "./components/RunWorkflow";
import { ACTIONS, EVERYTHING, resource, type Permissions } from "./permissions";
import { LOCAL_SCOPE, remoteScope } from "./scope";
import { SERVER, WORKFLOW } from "./test/instances";
import { renderAt } from "./test/render";
import { READY, RUN_WORKFLOW } from "./test/runs";

const REASON = "Only approvers may change the portfolio on staging.";

/** Refuses one action everywhere, with the test's reason; allows every other. */
function refusing(refused: string): Permissions {
  return (_instance, action) =>
    action === refused ? { allowed: false, reason: REASON } : { allowed: true };
}

describe("the action catalog", () => {
  it("names every action of Azathoth's ADR 0127, once each", () => {
    expect(new Set(ACTIONS).size).toBe(ACTIONS.length);
    expect(ACTIONS).toHaveLength(27);
    expect(ACTIONS).toContain("promote");
    expect(ACTIONS).toContain("import_goal");
    expect(ACTIONS).toContain("authorize_model");
  });

  it("is all allowed on the editor's own instance", () => {
    for (const action of ACTIONS) {
      expect(EVERYTHING(LOCAL_SCOPE, action, null)).toEqual({ allowed: true });
    }
  });
});

describe("ActionButton", () => {
  it("names its action, and is enabled where the action is allowed", () => {
    renderAt(
      <ActionButton type="button" action="authorize_model">
        Add
      </ActionButton>,
    );

    const button = screen.getByRole("button", { name: "Add" });

    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("data-action", "authorize_model");
  });

  it("disables itself and gives the reason where the action is refused", () => {
    renderAt(
      <ActionButton type="button" action="authorize_model" title="Add it">
        Add
      </ActionButton>,
      { permissions: refusing("authorize_model") },
    );

    const button = screen.getByRole("button", { name: "Add" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", REASON);
    expect(button).toHaveAccessibleDescription(REASON);
  });

  it("stays disabled when its page disables it, whatever is allowed", () => {
    renderAt(
      <ActionButton type="button" action="run_workflow" disabled>
        Run
      </ActionButton>,
    );

    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("asks about the instance the page acts on, or the one it names, and its resource", () => {
    const asked: string[] = [];
    const recording: Permissions = (instance, action, resource) => {
      asked.push(`${instance.api} ${action} ${resource ?? "-"}`);

      return { allowed: true };
    };

    renderAt(
      <>
        <ActionButton type="button" action="run_workflow" subject={resource("workflow", "w")}>
          Run
        </ActionButton>
        <ActionButton type="button" action="push" instance="origin">
          Push
        </ActionButton>
      </>,
      {
        permissions: recording,
        scope: remoteScope("staging"),
      },
    );

    expect(asked).toContain("/api/remotes/staging run_workflow workflow w");
    expect(asked).toContain("/api/remotes/origin push -");
  });
});

describe("pages that act", () => {
  it("ask about what they act on as a remote's policy names it", async () => {
    const asked: string[] = [];
    const recording: Permissions = (_instance, action, subject) => {
      asked.push(`${action} ${subject ?? "-"}`);

      return { allowed: true };
    };

    renderAt(
      <Routes>
        <Route path="/workflows/:id/run" element={<RunWorkflow />} />
      </Routes>,
      {
        path: `/workflows/${WORKFLOW.id}/run`,
        answers: {
          ...SERVER,
          [`/api/workflows/${WORKFLOW.id}`]: [200, RUN_WORKFLOW],
          "/api/workflows/readiness": [200, READY],
        },
        permissions: recording,
      },
    );

    await screen.findByRole("button", { name: "Run" });

    expect(asked).toContain(`run_workflow workflow ${WORKFLOW.id}`);
  });
});

describe("pages where an action is refused", () => {
  it("won't change a portfolio it may not, and says why", async () => {
    renderAt(
      <Routes>
        <Route path="/models/*" element={<ModelPage />} />
      </Routes>,
      { path: "/models/openrouter/acme/large", permissions: refusing("authorize_model") },
    );

    const button = await screen.findByRole("button", { name: "Remove from local portfolio" });

    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(REASON);
  });

  it("won't run a workflow it may not, even once it could run", async () => {
    renderAt(
      <Routes>
        <Route path="/workflows/:id/run" element={<RunWorkflow />} />
      </Routes>,
      {
        path: `/workflows/${WORKFLOW.id}/run`,
        answers: {
          ...SERVER,
          [`/api/workflows/${WORKFLOW.id}`]: [200, RUN_WORKFLOW],
          "/api/workflows/readiness": [200, READY],
        },
        permissions: refusing("run_workflow"),
      },
    );

    const button = await screen.findByRole("button", { name: "Run" });

    await waitFor(() => {
      expect(button).toHaveAttribute("title", REASON);
    });
    expect(button).toBeDisabled();
  });
});
