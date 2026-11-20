import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { spendSearch } from "../api/client";
import type { Permissions } from "../permissions";
import { SERVER, REVIEW_WORKFLOW, WORKFLOW, serving, urlOf, type Answers } from "../test/instances";
import { renderAt } from "../test/render";
import { NEW_YORK, SPEND_QUERY, SPEND_REPORT } from "../test/spend";

/** The two days the report holds, as the page's address names them. */
const PAGE = `/spend?range=custom&from=2026-11-18&to=2026-11-19&zone=${encodeURIComponent(NEW_YORK)}`;

const ANSWERS: Answers = { ...SERVER, "/api/spend": [200, SPEND_REPORT] };

const NO_SPEND: Permissions = (_instance, action) =>
  action === "read_spend"
    ? { allowed: false, reason: "Only finance reads spend." }
    : { allowed: true };

afterEach(() => {
  vi.restoreAllMocks();
});

/** Opens the editor at `path`, returning every spend query it asks the server. */
function open(path = PAGE, answers: Answers = ANSWERS): URL[] {
  const asked: URL[] = [];
  const server = serving(answers);

  renderAt(<App />, {
    path,
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

/** Returns one section of the report, once the report has loaded. */
async function region(name: string) {
  return within(await screen.findByRole("region", { name }));
}

function rowsOf(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);
}

describe("the Spend page", () => {
  it("is in the rail", () => {
    renderAt(<App />, { answers: ANSWERS });

    expect(
      within(screen.getByRole("navigation", { name: "Editor" })).getByRole("link", {
        name: "Spend",
      }),
    ).toHaveAttribute("href", "/spend");
  });

  it("is nowhere where spend may not be read", () => {
    renderAt(<App />, { path: "/spend", answers: ANSWERS, permissions: NO_SPEND });

    expect(
      within(screen.getByRole("navigation", { name: "Editor" })).queryByRole("link", {
        name: "Spend",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Nothing at this address" }),
    ).toBeVisible();
    expect(screen.queryByText("Only finance reads spend.")).toBeNull();
  });

  it("asks for the range in the time zone its address names", async () => {
    const asked = open();

    await screen.findByRole("heading", { level: 1, name: "Spend" });
    await waitFor(() => {
      expect(asked.length).toBeGreaterThan(0);
    });
    expect(asked[0]?.search).toBe(spendSearch(SPEND_QUERY));
    expect(screen.getByText(/Read in America\/New_York/)).toBeVisible();
  });

  it("reads in the browser's time zone unless one is named", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: "Asia/Tokyo",
    });
    const asked = open("/spend");

    await waitFor(() => {
      expect(asked[0]?.searchParams.get("time_zone")).toBe("Asia/Tokyo");
    });
    expect(asked[0]?.searchParams.get("since")).toMatch(/T00:00:00\+09:00$/);
    expect(screen.getByLabelText("Range")).toHaveValue("last_30_days");
  });

  it("shows billed and estimated apart, never added, and counts the unpriced calls", async () => {
    open();

    const totals = within(await screen.findByRole("list", { name: "Totals" }));

    expect(totals.getByText("Billed").nextElementSibling).toHaveTextContent("$0.250000");
    expect(totals.getByText("Estimated").nextElementSibling).toHaveTextContent("$0.500000");
    expect(totals.getByText("Calls").nextElementSibling).toHaveTextContent("3");
    expect(totals.getByText("Unpriced calls").nextElementSibling).toHaveTextContent("1");
    expect(screen.queryByText("$0.750000")).toBeNull();
    expect(
      screen.getByText("1 call has no known cost: it is counted here, never taken as free."),
    ).toBeVisible();
  });

  it("shows each period, saying when nothing was spent", async () => {
    open();

    const periods = await region("Over time");

    expect(
      await periods.findByText(
        "Wed, Nov 18: $0.250000 billed, $0.500000 estimated, 3 calls, 1 unpriced",
      ),
    ).toBeVisible();
    expect(periods.getByText("Thu, Nov 19: nothing spent")).toBeVisible();
  });

  it("shows each workflow's spend over the range, each linking to it", async () => {
    open();

    const groups = await region("By workflow");
    const table = await groups.findByRole("table");

    expect(rowsOf(table)).toEqual([
      `${REVIEW_WORKFLOW.name}$0.000000$0.5000002 calls, 1 unpriced`,
      `${WORKFLOW.name}$0.250000$0.0000001 call`,
    ]);
    expect(groups.getByRole("link", { name: WORKFLOW.name })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW.id}`,
    );
  });

  it("shows each period's groups", async () => {
    open();

    const table = (await region("Each period")).getByRole("table");

    expect(rowsOf(table)).toEqual([
      `Wed, Nov 18${REVIEW_WORKFLOW.name}$0.000000$0.5000002 calls, 1 unpriced`,
      `Wed, Nov 18${WORKFLOW.name}$0.250000$0.0000001 call`,
      "Thu, Nov 19Nothing spent",
    ]);
  });

  it("downloads the same report as CSV, and names its command", async () => {
    open();

    expect(await screen.findByRole("link", { name: "Download CSV" })).toHaveAttribute(
      "href",
      `/api/spend.csv${spendSearch(SPEND_QUERY)}`,
    );
    expect(screen.getByText(SPEND_REPORT.command)).toBeVisible();
  });

  it("asks again, and keeps it in its address, when a choice changes", async () => {
    const asked = open();

    fireEvent.change(await screen.findByLabelText("Grouped by"), { target: { value: "model" } });

    await waitFor(() => {
      expect(asked.at(-1)?.searchParams.get("group")).toBe("model");
    });

    fireEvent.change(screen.getByLabelText("Periods"), { target: { value: "week" } });
    fireEvent.change(screen.getByLabelText("Workflow"), { target: { value: WORKFLOW.id } });

    await waitFor(() => {
      expect(asked.at(-1)?.searchParams.get("period")).toBe("week");
    });
    expect(asked.at(-1)?.searchParams.get("workflow_id")).toBe(WORKFLOW.id);
  });

  it("offers dates of a person's own, starting from the range it showed", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: "UTC",
    });
    open("/spend?range=last_month");

    fireEvent.change(await screen.findByLabelText("Range"), { target: { value: "custom" } });

    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");

    expect((from as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-01$/);
    expect((to as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("says when two dates are not a range, and asks nothing", async () => {
    const asked = open("/spend?range=custom&from=2026-11-19&to=2026-11-18");

    expect(
      await screen.findByText("Choose two dates, the first no later than the second."),
    ).toBeVisible();
    expect(asked).toEqual([]);
  });

  it("says when a time zone is not one, and keeps the last that was", async () => {
    open();

    const zone = await screen.findByLabelText("Time zone");

    fireEvent.change(zone, { target: { value: "Mars/Olympus" } });

    expect(screen.getByText("Not a time zone this browser knows.")).toBeVisible();
    expect(screen.getByText(/Read in America\/New_York/)).toBeVisible();
  });

  it("says why the server couldn't add it up", async () => {
    open(PAGE, {
      ...ANSWERS,
      "/api/spend": [
        422,
        { error: { code: "invalid_argument", message: "'Mars/Olympus' is not a time zone." } },
      ],
    });

    expect(await screen.findByText("Couldn't read what was spent")).toBeVisible();
    expect(screen.getByText("'Mars/Olympus' is not a time zone.")).toBeVisible();
  });
});
