import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type { Permissions } from "../permissions";
import { WORKFLOW_DETAIL, WORKFLOW_HISTORY } from "../test/documents";
import { LARGE_MODEL, SERVER, serving, urlOf, type Answers } from "../test/instances";
import { renderAt } from "../test/render";
import { MODEL_SPEND, NEW_YORK } from "../test/spend";

const WORKFLOW_PATH = `/api/workflows/${WORKFLOW_DETAIL.id}`;

const ANSWERS: Answers = {
  ...SERVER,
  [WORKFLOW_PATH]: [200, WORKFLOW_DETAIL],
  [`${WORKFLOW_PATH}/history?limit=100`]: [200, { items: WORKFLOW_HISTORY }],
  "/api/spend": [200, MODEL_SPEND],
};

const NO_SPEND: Permissions = (_instance, action) =>
  action === "read_spend"
    ? { allowed: false, reason: "Only finance reads spend." }
    : { allowed: true };

beforeEach(() => {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...new Intl.DateTimeFormat().resolvedOptions(),
    timeZone: NEW_YORK,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Opens the editor at `path`, returning every spend query it asks the server. */
function open(path: string, permissions?: Permissions, answers: Answers = ANSWERS): URL[] {
  const asked: URL[] = [];
  const server = serving(answers);

  renderAt(<App />, {
    path,
    ...(permissions === undefined ? {} : { permissions }),
    fetcher: (input, init) => {
      const url = urlOf(input);

      if (url.pathname === "/api/spend") {
        asked.push(url);
      }

      return server(input, init);
    },
  });

  return asked;
}

describe("a workflow's Spend tab", () => {
  it("is one of its page's tabs", async () => {
    open(`/workflows/${WORKFLOW_DETAIL.id}`);

    const tabs = within(await screen.findByRole("navigation", { name: "Workflow" }));

    expect(tabs.getByRole("link", { name: "Spend" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW_DETAIL.id}/spend`,
    );
  });

  it("is not there where spend may not be read", async () => {
    open(`/workflows/${WORKFLOW_DETAIL.id}`, NO_SPEND);

    const tabs = within(await screen.findByRole("navigation", { name: "Workflow" }));

    expect(tabs.getByRole("link", { name: "Experiments" })).toBeVisible();
    expect(tabs.queryByRole("link", { name: "Spend" })).toBeNull();
  });

  it("shows the workflow's last 30 days by model, in the browser's time zone", async () => {
    const asked = open(`/workflows/${WORKFLOW_DETAIL.id}/spend`);

    const spend = within(await screen.findByRole("region", { name: "Spend" }));

    const totals = within(await spend.findByRole("list", { name: "Totals" }));

    expect(totals.getByText("Billed").nextElementSibling).toHaveTextContent("$0.250000");
    expect(totals.getByText("Estimated").nextElementSibling).toHaveTextContent("$0.500000");
    expect(
      within(spend.getByRole("region", { name: "By model" })).getByRole("table"),
    ).toBeVisible();
    expect(spend.getByText(`Read in ${NEW_YORK}.`)).toBeVisible();

    const query = asked[0]?.searchParams;

    expect(query?.get("workflow_id")).toBe(WORKFLOW_DETAIL.id);
    expect(query?.get("group")).toBe("model");
    expect(query?.get("time_zone")).toBe(NEW_YORK);
    expect(query?.get("since")).toMatch(/T00:00:00-0[45]:00$/);
  });

  it("opens the Spend page with the same choices", async () => {
    open(`/workflows/${WORKFLOW_DETAIL.id}/spend`);

    expect(await screen.findByRole("link", { name: "Open in Spend" })).toHaveAttribute(
      "href",
      `/spend?group=model&workflow=${WORKFLOW_DETAIL.id}`,
    );
  });

  it("is the editor's page for an address it does not have where spend may not be read", async () => {
    const asked = open(`/workflows/${WORKFLOW_DETAIL.id}/spend`, NO_SPEND);

    expect(await screen.findByText("Nothing at this address")).toBeVisible();
    expect(screen.queryByText("Only finance reads spend.")).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe("a model's spend", () => {
  const MODEL_PAGE = `/models/${LARGE_MODEL.identifier}`;

  it("is what it spent in the last 30 days, billed and estimated apart", async () => {
    const asked = open(MODEL_PAGE);

    const spend = within(await screen.findByRole("region", { name: "Spend" }));

    const totals = within(await spend.findByRole("list", { name: "Totals" }));

    expect(totals.getByText("Billed").nextElementSibling).toHaveTextContent("$0.250000");
    expect(totals.getByText("Estimated").nextElementSibling).toHaveTextContent("$0.000000");
    expect(totals.getByText("Calls").nextElementSibling).toHaveTextContent("1");
    expect(asked[0]?.searchParams.get("group")).toBe("model");
    expect(asked[0]?.searchParams.has("workflow_id")).toBe(false);
    expect(spend.getByRole("link", { name: "Open in Spend" })).toHaveAttribute(
      "href",
      "/spend?group=model",
    );
  });

  it("says when nothing was spent on it", async () => {
    open(MODEL_PAGE, undefined, {
      ...ANSWERS,
      "/api/spend": [200, { ...MODEL_SPEND, groups: [] }],
    });

    expect(await screen.findByText("Nothing was spent on it in the last 30 days.")).toBeVisible();
  });

  it("is not there, nor asked for, where spend may not be read", async () => {
    const asked = open(MODEL_PAGE, NO_SPEND);

    expect(await screen.findByRole("heading", { level: 1, name: "Acme Large" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Spend" })).toBeNull();
    await waitFor(() => {
      expect(asked).toEqual([]);
    });
  });
});
