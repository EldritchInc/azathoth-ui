/**
 * Spend as the editor reads it (ADR 0014): ranges in the browser's time
 * zone, or another, made into exact times with their offsets, midnight to
 * midnight, so a range across a clock change is as long as it was; what
 * the page keeps in its address; and how amounts, calls and periods are
 * said. Billed and estimated dollars are never added together.
 */

import type { SpendQuery } from "./api/client";
import {
  SPEND_GROUPS,
  SPEND_PERIODS,
  type SpendGroup,
  type SpendPeriod,
  type SpendPeriodTotals,
  type SpendTotals,
} from "./api/types";

/** A range the page offers, or two dates of a person's own. */
export type SpendPreset = "last_7_days" | "last_30_days" | "this_month" | "last_month" | "custom";

/** Every range, in the order the page offers them, and what each is called. */
export const SPEND_PRESETS: readonly (readonly [SpendPreset, string])[] = [
  ["last_7_days", "Last 7 days"],
  ["last_30_days", "Last 30 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["custom", "Dates"],
];

/** What the Spend page shows, as its address keeps it. */
export interface SpendView {
  readonly preset: SpendPreset;
  /** The first day of a custom range, as `YYYY-MM-DD`. */
  readonly from: string | null;
  /** The last day of a custom range, included. */
  readonly to: string | null;
  readonly period: SpendPeriod;
  readonly group: SpendGroup;
  readonly timeZone: string;
  readonly workflowId: string | null;
}

/** The view a page opens with, before its time zone is the browser's. */
export const DEFAULT_SPEND_VIEW: SpendView = {
  preset: "last_30_days",
  from: null,
  to: null,
  period: "day",
  group: "workflow",
  timeZone: "UTC",
  workflowId: null,
};

/** Returns the browser's IANA time zone, or UTC when it names none. */
export function browserTimeZone(): string {
  const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;

  return zone === "" ? "UTC" : zone;
}

/** Returns whether a name is an IANA time zone the browser knows. */
export function isTimeZone(name: string): boolean {
  if (name === "") {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });

    return true;
  } catch {
    return false;
  }
}

interface Day {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Returns the wall clock in a time zone at an instant, and its offset from UTC in minutes. */
function wallClock(
  instant: Date,
  zone: string,
): Day & { readonly time: string; readonly offset: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((each) => each.type === type)?.value ?? "";
  const offset = /GMT([+-])(\d{2}):(\d{2})/.exec(part("timeZoneName"));
  const minutes =
    offset === null
      ? 0
      : (offset[1] === "-" ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3]));

  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
    offset: minutes,
  };
}

/** Returns the day `days` after another, as the calendar counts. */
function after(day: Day, days: number): Day {
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + days));

  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** Returns midnight of a day in a time zone, as ISO 8601 with its offset. */
function midnight(day: Day, zone: string): string {
  const wall = Date.UTC(day.year, day.month - 1, day.day);
  let instant = wall;

  //
  // The offset is the zone's at midnight itself, which is found from a
  // guess at the offset and corrected once, since a clock moves by at most
  // one change across a day.
  //
  for (let pass = 0; pass < 2; pass += 1) {
    instant = wall - wallClock(new Date(instant), zone).offset * 60_000;
  }

  const clock = wallClock(new Date(instant), zone);
  const sign = clock.offset < 0 ? "-" : "+";
  const offset = Math.abs(clock.offset);

  return (
    `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}T${clock.time}` +
    `${sign}${pad(Math.floor(offset / 60))}:${pad(offset % 60)}`
  );
}

/** Returns a `YYYY-MM-DD` date as a day, or null when it is not one. */
function dayOf(text: string | null): Day | null {
  const found = text === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (found === null) {
    return null;
  }

  const day = { year: Number(found[1]), month: Number(found[2]), day: Number(found[3]) };
  const checked = after(day, 0);

  return checked.month === day.month && checked.day === day.day ? day : null;
}

function before(left: Day, right: Day): boolean {
  return (
    Date.UTC(left.year, left.month - 1, left.day) < Date.UTC(right.year, right.month - 1, right.day)
  );
}

/**
 * Returns the exact range a preset or two dates name in a time zone, now
 * being `now`, or null when the dates are not a range or the zone not one.
 * Every range runs midnight to midnight, its last day included.
 */
export function rangeOf(
  range: {
    readonly preset: SpendPreset;
    readonly from?: string | null;
    readonly to?: string | null;
  },
  now: Date,
  zone: string,
): { readonly since: string; readonly until: string } | null {
  if (!isTimeZone(zone)) {
    return null;
  }

  const today = wallClock(now, zone);
  const tomorrow = after(today, 1);
  const first = { year: today.year, month: today.month, day: 1 };

  if (range.preset === "custom") {
    const from = dayOf(range.from ?? null);
    const to = dayOf(range.to ?? null);

    if (from === null || to === null || before(to, from)) {
      return null;
    }

    return { since: midnight(from, zone), until: midnight(after(to, 1), zone) };
  }

  if (range.preset === "this_month") {
    return { since: midnight(first, zone), until: midnight(tomorrow, zone) };
  }

  if (range.preset === "last_month") {
    const previous = after(first, -1);

    return {
      since: midnight({ ...previous, day: 1 }, zone),
      until: midnight(first, zone),
    };
  }

  const days = range.preset === "last_7_days" ? 7 : 30;

  return { since: midnight(after(tomorrow, -days), zone), until: midnight(tomorrow, zone) };
}

const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});

/** Returns an amount in US dollars, to the millionth, as the command line says it. */
export function spendDollars(amount: number): string {
  return DOLLARS.format(amount);
}

/** Returns how many calls some spend holds, and how many of them were unpriced. */
export function callsOf(totals: SpendTotals): string {
  const calls = `${String(totals.calls)} call${totals.calls === 1 ? "" : "s"}`;

  return totals.unpriced_calls === 0
    ? calls
    : `${calls}, ${String(totals.unpriced_calls)} unpriced`;
}

/** Returns a period's name, from the day it starts on in the report's time zone. */
export function periodName(period: SpendPeriodTotals, length: SpendPeriod): string {
  const day = dayOf(period.start.slice(0, 10));
  const date =
    day === null ? new Date(period.start) : new Date(Date.UTC(day.year, day.month - 1, day.day));

  if (length === "week") {
    return `Week of ${date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}`;
  }
  if (length === "month") {
    return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  }

  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function oneOf<T extends string>(choices: readonly T[], text: string | null, fallback: T): T {
  return choices.find((choice) => choice === text) ?? fallback;
}

/** Returns the view an address keeps, anything it does not know passed over. */
export function spendViewOf(search: URLSearchParams, browserZone: string): SpendView {
  return {
    preset: oneOf(
      SPEND_PRESETS.map(([preset]) => preset),
      search.get("range"),
      DEFAULT_SPEND_VIEW.preset,
    ),
    from: search.get("from"),
    to: search.get("to"),
    period: oneOf(SPEND_PERIODS, search.get("by"), DEFAULT_SPEND_VIEW.period),
    group: oneOf(SPEND_GROUPS, search.get("group"), DEFAULT_SPEND_VIEW.group),
    timeZone: search.get("zone") ?? browserZone,
    workflowId: search.get("workflow"),
  };
}

/** Returns the address's query that keeps a view, each default left out; empty for none. */
export function spendViewSearch(view: SpendView, browserZone: string): string {
  const search = new URLSearchParams();

  if (view.preset !== DEFAULT_SPEND_VIEW.preset) {
    search.set("range", view.preset);
  }
  if (view.from !== null) {
    search.set("from", view.from);
  }
  if (view.to !== null) {
    search.set("to", view.to);
  }
  if (view.period !== DEFAULT_SPEND_VIEW.period) {
    search.set("by", view.period);
  }
  if (view.group !== DEFAULT_SPEND_VIEW.group) {
    search.set("group", view.group);
  }
  if (view.timeZone !== browserZone) {
    search.set("zone", view.timeZone);
  }
  if (view.workflowId !== null) {
    search.set("workflow", view.workflowId);
  }

  return search.toString();
}

/** Returns the query a view asks of the server, now being `now`, or null when its range is none. */
export function spendQueryOf(view: SpendView, now: Date): SpendQuery | null {
  const range = rangeOf(view, now, view.timeZone);

  return range === null
    ? null
    : {
        ...range,
        period: view.period,
        group: view.group,
        timeZone: view.timeZone,
        workflowId: view.workflowId,
      };
}
