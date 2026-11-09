import { describe, expect, it } from "vitest";

import {
  DESCRIPTIONS,
  KINDS,
  detailApiPath,
  detailPath,
  historyApiPath,
  matches,
  parseRevision,
} from "./kinds";
import { BENCHMARK, TOOL, WORKFLOW } from "./test/instances";

describe("detailPath", () => {
  it("finds a workflow and a benchmark by id, and a tool by id and version", () => {
    expect(detailPath("workflows", WORKFLOW)).toBe(`/workflows/${WORKFLOW.id}`);
    expect(detailPath("benchmarks", BENCHMARK)).toBe(`/benchmarks/${BENCHMARK.id}`);
    expect(detailPath("tools", TOOL)).toBe(`/tools/${TOOL.id}/versions/1.0.0`);
  });

  it("keeps a version with any character in one part of the path", () => {
    expect(detailPath("tools", { ...TOOL, version: "1.0/beta 2" })).toBe(
      `/tools/${TOOL.id}/versions/1.0%2Fbeta%202`,
    );
  });
});

describe("matches", () => {
  it("matches everything when nothing is typed", () => {
    expect(matches(WORKFLOW, "")).toBe(true);
    expect(matches(WORKFLOW, "   ")).toBe(true);
  });

  it("matches every word typed, in any order, case, or field", () => {
    expect(matches(WORKFLOW, "SUMMARIZE")).toBe(true);
    expect(matches(WORKFLOW, "sentence summ")).toBe(true);
    expect(matches(WORKFLOW, "1.0.0")).toBe(true);
    expect(matches(WORKFLOW, "a1000000-0000")).toBe(true);
    expect(matches(WORKFLOW, "summarize review")).toBe(false);
  });
});

describe("DESCRIPTIONS", () => {
  it("names each kind and the command that imports it", () => {
    expect(KINDS.map((kind) => DESCRIPTIONS[kind].importCommand)).toEqual([
      "azathoth workflow import <file>",
      "azathoth tool import <file>",
      "azathoth benchmark import <file>",
    ]);
    expect(KINDS.map((kind) => DESCRIPTIONS[kind].path)).toEqual([
      "/workflows",
      "/tools",
      "/benchmarks",
    ]);
  });
});

describe("detailApiPath", () => {
  it("asks for the latest revision unless one is named", () => {
    expect(detailApiPath("workflows", WORKFLOW, null)).toBe(`/api/workflows/${WORKFLOW.id}`);
    expect(detailApiPath("benchmarks", BENCHMARK, 3)).toBe(
      `/api/benchmarks/${BENCHMARK.id}?revision=3`,
    );
  });

  it("asks for one exact tool version", () => {
    expect(detailApiPath("tools", { id: TOOL.id, version: "1.0/beta" }, 2)).toBe(
      `/api/tools/${TOOL.id}/versions/1.0%2Fbeta?revision=2`,
    );
  });
});

describe("historyApiPath", () => {
  it("asks for up to a hundred revisions, of one version for a tool", () => {
    expect(historyApiPath("workflows", WORKFLOW)).toBe(
      `/api/workflows/${WORKFLOW.id}/history?limit=100`,
    );
    expect(historyApiPath("tools", { id: TOOL.id, version: "1.0 beta" })).toBe(
      `/api/tools/${TOOL.id}/history?limit=100&version=1.0+beta`,
    );
  });
});

describe("parseRevision", () => {
  it("reads a revision number, and nothing else", () => {
    expect(parseRevision("3")).toBe(3);
    expect(parseRevision(null)).toBeNull();
    expect(parseRevision("0")).toBeNull();
    expect(parseRevision("-1")).toBeNull();
    expect(parseRevision("2.5")).toBeNull();
    expect(parseRevision("latest")).toBeNull();
    expect(parseRevision("1234567890")).toBeNull();
  });
});
