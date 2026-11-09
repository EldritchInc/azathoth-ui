import { describe, expect, it } from "vitest";

import { relativeTime } from "./time";

const NOW = new Date("2026-11-08T23:00:00Z");

function before(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

describe("relativeTime", () => {
  it("calls the last moments just now", () => {
    expect(relativeTime(NOW, NOW)).toBe("just now");
    expect(relativeTime(before(44), NOW)).toBe("just now");
  });

  it("counts minutes, hours and days in the largest whole unit", () => {
    expect(relativeTime(before(50), NOW)).toBe("50 seconds ago");
    expect(relativeTime(before(3 * 60), NOW)).toBe("3 minutes ago");
    expect(relativeTime(before(2 * 3600 + 59 * 60), NOW)).toBe("2 hours ago");
    expect(relativeTime(before(24 * 3600), NOW)).toBe("yesterday");
    expect(relativeTime(before(3 * 24 * 3600), NOW)).toBe("3 days ago");
    expect(relativeTime(before(15 * 24 * 3600), NOW)).toBe("2 weeks ago");
    expect(relativeTime(before(400 * 24 * 3600), NOW)).toBe("last year");
  });

  it("speaks of the future too, for a clock that runs ahead", () => {
    expect(relativeTime(new Date(NOW.getTime() + 3600 * 1000), NOW)).toBe("in 1 hour");
  });
});
