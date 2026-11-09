/**
 * When things happened, said the way people say it.
 */

const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

/** Returns how long before `now` a moment was: "3 minutes ago", "yesterday", "just now". */
export function relativeTime(moment: Date, now: Date, locale = "en"): string {
  const seconds = Math.round((moment.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.trunc(seconds / size), unit);
    }
  }

  return Math.abs(seconds) < 45 ? "just now" : format.format(seconds, "second");
}

/** Returns a moment in full, for a tooltip: "Nov 8, 2026, 6:58 PM". */
export function fullTime(moment: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    moment,
  );
}
