import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SPEND_VIEW,
  browserTimeZone,
  callsOf,
  isTimeZone,
  periodName,
  rangeOf,
  spendDollars,
  spendQueryOf,
  spendViewOf,
  spendViewSearch,
} from "./spending";
import { NEW_YORK, SPEND_REPORT } from "./test/spend";

/** 10:00 in New York, 15:00 UTC, and already midnight the next day in Tokyo. */
const NOW = new Date("2026-11-19T15:00:00Z");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the browser's time zone", () => {
  it("is the one the browser names", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: "Asia/Tokyo",
    });

    expect(browserTimeZone()).toBe("Asia/Tokyo");
  });

  it("is UTC when the browser names none", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: "",
    });

    expect(browserTimeZone()).toBe("UTC");
  });

  it("is told apart from a name that is not a time zone", () => {
    expect(isTimeZone(NEW_YORK)).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});

describe("a range", () => {
  it("of the last 30 days runs through today, midnight to midnight in the time zone", () => {
    expect(rangeOf({ preset: "last_30_days" }, NOW, NEW_YORK)).toEqual({
      since: "2026-10-21T00:00:00-04:00",
      until: "2026-11-20T00:00:00-05:00",
    });
  });

  it("of the last 7 days is read in the time zone, whatever the day is in UTC", () => {
    expect(rangeOf({ preset: "last_7_days" }, NOW, "Asia/Tokyo")).toEqual({
      since: "2026-11-14T00:00:00+09:00",
      until: "2026-11-21T00:00:00+09:00",
    });
  });

  it("of this month runs from its first day through today", () => {
    expect(rangeOf({ preset: "this_month" }, NOW, NEW_YORK)).toEqual({
      since: "2026-11-01T00:00:00-04:00",
      until: "2026-11-20T00:00:00-05:00",
    });
  });

  it("of last month runs from its first day to this month's", () => {
    expect(rangeOf({ preset: "last_month" }, NOW, NEW_YORK)).toEqual({
      since: "2026-10-01T00:00:00-04:00",
      until: "2026-11-01T00:00:00-04:00",
    });
  });

  it("of last month in January is December's", () => {
    expect(rangeOf({ preset: "last_month" }, new Date("2027-01-10T12:00:00Z"), "UTC")).toEqual({
      since: "2026-12-01T00:00:00+00:00",
      until: "2027-01-01T00:00:00+00:00",
    });
  });

  it("of two dates takes both, across the day the clocks go forward", () => {
    expect(
      rangeOf({ preset: "custom", from: "2026-03-07", to: "2026-03-08" }, NOW, NEW_YORK),
    ).toEqual({
      since: "2026-03-07T00:00:00-05:00",
      until: "2026-03-09T00:00:00-04:00",
    });
  });

  it.each([
    ["no dates", {}],
    ["a date that is not one", { from: "2026-02-30", to: "2026-03-01" }],
    ["a from after its to", { from: "2026-03-09", to: "2026-03-08" }],
  ])("of two dates is none with %s", (_name, dates) => {
    expect(rangeOf({ preset: "custom", ...dates }, NOW, NEW_YORK)).toBeNull();
  });

  it("is none in a time zone that is not one", () => {
    expect(rangeOf({ preset: "last_7_days" }, NOW, "Mars/Olympus")).toBeNull();
  });
});

describe("what spend is said as", () => {
  it("is dollars to the millionth, as the command line says them", () => {
    expect(spendDollars(0.25)).toBe("$0.250000");
    expect(spendDollars(0.000012)).toBe("$0.000012");
    expect(spendDollars(1234.5)).toBe("$1,234.500000");
    expect(spendDollars(0)).toBe("$0.000000");
  });

  it("counts calls, and the unpriced among them", () => {
    expect(callsOf({ billed_usd: 0, estimated_usd: 0, calls: 1, unpriced_calls: 0 })).toBe(
      "1 call",
    );
    expect(callsOf({ billed_usd: 0, estimated_usd: 0, calls: 3, unpriced_calls: 1 })).toBe(
      "3 calls, 1 unpriced",
    );
  });

  it("names a period by the day it starts on in the report's time zone", () => {
    const [first] = SPEND_REPORT.periods;

    if (first === undefined) {
      throw new Error("The report has no period.");
    }

    expect(periodName(first, "day")).toBe("Wed, Nov 18");
    expect(periodName({ ...first, start: "2026-11-16T00:00:00-05:00" }, "week")).toBe(
      "Week of Nov 16",
    );
    expect(periodName({ ...first, start: "2026-11-01T00:00:00-04:00" }, "month")).toBe(
      "November 2026",
    );
  });
});

describe("the view in the address", () => {
  it("is the last 30 days by day and workflow, in the browser's zone, by default", () => {
    expect(spendViewOf(new URLSearchParams(), NEW_YORK)).toEqual({
      ...DEFAULT_SPEND_VIEW,
      timeZone: NEW_YORK,
    });
    expect(DEFAULT_SPEND_VIEW).toMatchObject({
      preset: "last_30_days",
      period: "day",
      group: "workflow",
      from: null,
      to: null,
      workflowId: null,
    });
  });

  it("keeps every choice, leaving the defaults out of the address", () => {
    const view = {
      preset: "custom",
      from: "2026-11-01",
      to: "2026-11-15",
      period: "week",
      group: "model",
      timeZone: "Asia/Tokyo",
      workflowId: "abc",
    } as const;
    const search = spendViewSearch(view, NEW_YORK);

    expect(spendViewOf(new URLSearchParams(search), NEW_YORK)).toEqual(view);
    expect(spendViewSearch({ ...DEFAULT_SPEND_VIEW, timeZone: NEW_YORK }, NEW_YORK)).toBe("");
  });

  it("passes over a choice it does not know", () => {
    expect(
      spendViewOf(new URLSearchParams("range=forever&by=fortnight&group=colour"), NEW_YORK),
    ).toEqual({ ...DEFAULT_SPEND_VIEW, timeZone: NEW_YORK });
  });

  it("becomes the query its range asks, or none when its range is none", () => {
    expect(
      spendQueryOf({ ...DEFAULT_SPEND_VIEW, timeZone: NEW_YORK, workflowId: "abc" }, NOW),
    ).toEqual({
      since: "2026-10-21T00:00:00-04:00",
      until: "2026-11-20T00:00:00-05:00",
      period: "day",
      group: "workflow",
      timeZone: NEW_YORK,
      workflowId: "abc",
    });
    expect(spendQueryOf({ ...DEFAULT_SPEND_VIEW, preset: "custom", timeZone: NEW_YORK }, NOW)).toBe(
      null,
    );
  });
});
