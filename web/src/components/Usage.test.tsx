import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ModelUsage, ToolUsage } from "../api/types";
import type { Action, Permissions } from "../permissions";
import { SERVER, TOOL, WORKFLOW } from "../test/instances";
import { renderAt } from "../test/render";
import { ModelUsageSection, RUNS_SHOWN, ToolUsageSection } from "./Usage";

const MODEL = "openrouter/acme/large";

const STEP = "c1000000-0000-4000-8000-000000000002";

const MODEL_PATH = `/api/model-usage?identifier=${encodeURIComponent(MODEL)}`;

const TOOL_PATH = `/api/tools/${TOOL.id}/usage`;

function run(number: number, steps = [{ step_id: STEP, attempt_number: 1 }]) {
  return {
    run_id: `d1000000-0000-4000-8000-00000000000${String(number)}`,
    started_at: `2026-11-0${String(number)}T12:00:00Z`,
    steps,
  };
}

const USED: ModelUsage = {
  identifier: MODEL,
  in_production: true,
  workflows: [
    {
      workflow_id: WORKFLOW.id,
      workflow_name: WORKFLOW.name,
      configured: true,
      production: [{ step_id: STEP, role: "primary" }],
      runs: [run(1), run(2, [{ step_id: STEP, attempt_number: 2 }])],
    },
  ],
};

const TOOL_USED: ToolUsage = {
  tool_id: TOOL.id,
  tool_names: ["count_words"],
  in_production: false,
  workflows: [
    {
      workflow_id: WORKFLOW.id,
      workflow_name: WORKFLOW.name,
      configured: false,
      production: false,
      runs: [
        {
          run_id: "d1000000-0000-4000-8000-000000000009",
          started_at: "2026-11-09T12:00:00Z",
          executions: [
            {
              step_id: STEP,
              attempt_number: 1,
              implementation_id: "e1000000-0000-4000-8000-000000000001",
              tool_version: "1.0.0",
              runtime: "python",
            },
          ],
        },
      ],
    },
  ],
};

/** Returns one entry of a list, failing the test if there is none at that place. */
function entryOf(entries: readonly HTMLElement[], index: number): HTMLElement {
  const found = entries[index];

  if (found === undefined) {
    throw new Error(`The list has no entry ${String(index)}.`);
  }

  return found;
}

/** Refuses one action everywhere; allows every other. */
function refusing(refused: Action): Permissions {
  return (_instance, action) =>
    action === refused ? { allowed: false, reason: "Not here." } : { allowed: true };
}

describe("where a model is used", () => {
  it("names each workflow, its production steps and its runs, newest first", async () => {
    renderAt(<ModelUsageSection identifier={MODEL} />, {
      answers: { ...SERVER, [MODEL_PATH]: [200, USED] },
    });

    const section = await screen.findByRole("region", { name: "Where it's used" });

    expect(await within(section).findByText(/Active production uses it/)).toBeVisible();
    expect(within(section).getByRole("link", { name: WORKFLOW.name })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW.id}`,
    );
    expect(section).toHaveTextContent("Its latest revision names it");
    expect(section).toHaveTextContent("Production runs it at step c1000000, as its primary");
    expect(section).toHaveTextContent("2 kept runs used it");

    const runs = within(
      within(section).getByRole("list", { name: `Runs of ${WORKFLOW.name} that used it` }),
    ).getAllByRole("listitem");

    expect(entryOf(runs, 0)).toHaveTextContent("step c1000000, attempt 2");
    expect(within(entryOf(runs, 0)).getByRole("link")).toHaveAttribute(
      "href",
      `/runs/${run(2).run_id}`,
    );
  });

  it("lists only the newest runs, and counts the rest", async () => {
    const many = Array.from({ length: RUNS_SHOWN + 2 }, (_, index) => run(index + 1));

    renderAt(<ModelUsageSection identifier={MODEL} />, {
      answers: {
        ...SERVER,
        [MODEL_PATH]: [200, { ...USED, workflows: [{ ...USED.workflows[0], runs: many }] }],
      },
    });

    const list = await screen.findByRole("list", { name: `Runs of ${WORKFLOW.name} that used it` });

    expect(within(list).getAllByRole("link")).toHaveLength(RUNS_SHOWN);
    expect(list).toHaveTextContent("and 2 earlier");
  });

  it("says when nothing uses it", async () => {
    renderAt(<ModelUsageSection identifier={MODEL} />, {
      answers: {
        ...SERVER,
        [MODEL_PATH]: [200, { identifier: MODEL, in_production: false, workflows: [] }],
      },
    });

    expect(
      await screen.findByText(
        "No workflow names this model, no production uses it, and no kept run used it.",
      ),
    ).toBeVisible();
  });

  it.each<Action>(["read_runs", "read_catalog"])(
    "isn't there, and asks nothing, where %s is refused",
    (action) => {
      const asked: string[] = [];

      renderAt(<ModelUsageSection identifier={MODEL} />, {
        permissions: refusing(action),
        fetcher: (input) => {
          asked.push(input instanceof Request ? input.url : input.toString());

          return Promise.reject(new Error("Nothing should be asked."));
        },
      });

      expect(screen.queryByRole("region", { name: "Where it's used" })).toBeNull();
      expect(asked).toEqual([]);
    },
  );
});

describe("where a tool is used", () => {
  it("names each workflow, whether production requires it, and what each run ran", async () => {
    renderAt(<ToolUsageSection toolId={TOOL.id} />, {
      answers: { ...SERVER, [TOOL_PATH]: [200, TOOL_USED] },
    });

    const section = await screen.findByRole("region", { name: "Where it's used" });

    expect(await within(section).findByText(/No active production uses it/)).toBeVisible();
    expect(section).toHaveTextContent("Its latest revision doesn't");
    expect(section).not.toHaveTextContent("Production requires it");
    expect(section).toHaveTextContent("1 kept run used it");
    expect(section).toHaveTextContent("version 1.0.0, in python");
  });

  it("says why it couldn't say where it's used", async () => {
    renderAt(<ToolUsageSection toolId={TOOL.id} />, {
      answers: {
        ...SERVER,
        [TOOL_PATH]: [
          404,
          { error: { code: "not_found", message: `Tool ${TOOL.id} is not configured.` } },
        ],
      },
    });

    expect(await screen.findByText("Couldn't say where it's used")).toBeVisible();
    expect(screen.getByText(`Tool ${TOOL.id} is not configured.`)).toBeVisible();
  });
});
