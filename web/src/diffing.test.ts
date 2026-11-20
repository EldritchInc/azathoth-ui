import { describe, expect, it } from "vitest";

import { comparedRevisions, diffCommand, shownValue, WITHHELD } from "./diffing";
import { BENCHMARK, TOOL, WORKFLOW } from "./test/instances";

describe("comparedRevisions", () => {
  it("compares the latest revision with the one before it unless others are named", () => {
    expect(comparedRevisions(null, null, 4)).toEqual({ before: 3, after: 4 });
    expect(comparedRevisions(null, "2", 4)).toEqual({ before: 1, after: 2 });
    expect(comparedRevisions("1", "3", 4)).toEqual({ before: 1, after: 3 });
  });

  it("compares a first revision with itself, and ignores what is not a revision", () => {
    expect(comparedRevisions(null, null, 1)).toEqual({ before: 1, after: 1 });
    expect(comparedRevisions("zero", "-2", 5)).toEqual({ before: 4, after: 5 });
  });
});

describe("diffCommand", () => {
  it("names the kind, the id and both revisions, and a tool's version", () => {
    expect(diffCommand("workflows", WORKFLOW, { before: 1, after: 2 })).toBe(
      `azathoth workflow diff ${WORKFLOW.id} 1 2`,
    );
    expect(diffCommand("benchmarks", BENCHMARK, { before: 3, after: 1 })).toBe(
      `azathoth benchmark diff ${BENCHMARK.id} 3 1`,
    );
    expect(diffCommand("tools", { id: TOOL.id, version: "1.0.0" }, { before: 1, after: 2 })).toBe(
      `azathoth tool diff ${TOOL.id} 1 2 --version 1.0.0`,
    );
  });
});

describe("shownValue", () => {
  it("reads a value as its JSON, null included", () => {
    expect(shownValue("é", false)).toBe('"é"');
    expect(shownValue({ count: 2 }, false)).toBe('{"count":2}');
    expect(shownValue(null, false)).toBe("null");
  });

  it("says a withheld value is withheld", () => {
    expect(shownValue(null, true)).toBe(WITHHELD);
    expect(shownValue("open text", true)).toBe('"open text"');
  });
});
