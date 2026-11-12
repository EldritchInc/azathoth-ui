import { describe, expect, it } from "vitest";

import type { ComponentStatus, Lineage, Relation } from "./api/types";
import {
  RELATION_ORDER,
  RELATION_TEXT,
  groupByRelation,
  lineageKey,
  lineagePath,
  shortDigest,
  tokenCommand,
} from "./remotes";

const WORKFLOW: Lineage = {
  kind: "workflow",
  id: "a1000000-0000-4000-8000-000000000001",
  version: null,
};

const TOOL: Lineage = {
  kind: "tool",
  id: "a2000000-0000-4000-8000-000000000001",
  version: "1.0.0",
};

function component(lineage: Lineage, relation: Relation | null): ComponentStatus {
  return {
    lineage,
    relation,
    local_digest: null,
    local_number: null,
    remote_digest: null,
    remote_number: null,
    remote_production_digest: null,
  };
}

describe("groupByRelation", () => {
  it("puts what needs a person first and what agrees last, dropping empty relations", () => {
    const groups = groupByRelation([
      component(TOOL, "in_sync"),
      component(WORKFLOW, "diverged"),
      component({ ...TOOL, version: "2.0.0" }, "local_only"),
      component({ ...WORKFLOW, id: "b" }, "in_sync"),
    ]);

    expect(groups.map((group) => group.relation)).toEqual(["diverged", "local_only", "in_sync"]);
    expect(groups[2]?.components.map((each) => each.lineage.id)).toEqual([TOOL.id, "b"]);
  });

  it("puts components whose relation is unknown last", () => {
    const groups = groupByRelation([component(WORKFLOW, null), component(TOOL, "ahead")]);

    expect(groups.map((group) => group.relation)).toEqual(["ahead", null]);
  });

  it("has no groups for no components", () => {
    expect(groupByRelation([])).toEqual([]);
  });

  it("orders and names every relation", () => {
    expect([...RELATION_ORDER].sort()).toEqual(Object.keys(RELATION_TEXT).sort());
  });
});

describe("lineagePath", () => {
  it("shows each kind where its own page is", () => {
    expect(lineagePath(WORKFLOW, true)).toBe(`/workflows/${WORKFLOW.id}`);
    expect(lineagePath({ ...WORKFLOW, kind: "benchmark" }, true)).toBe(
      `/benchmarks/${WORKFLOW.id}`,
    );
    expect(lineagePath(TOOL, true)).toBe(`/tools/${TOOL.id}/versions/1.0.0`);
  });

  it("has no page for what this instance does not hold", () => {
    expect(lineagePath(WORKFLOW, false)).toBeNull();
  });
});

describe("lineageKey", () => {
  it("tells tool versions apart", () => {
    expect(lineageKey(TOOL)).not.toBe(lineageKey({ ...TOOL, version: "2.0.0" }));
    expect(lineageKey(WORKFLOW)).toBe(`workflow:${WORKFLOW.id}@`);
  });
});

describe("shortDigest", () => {
  it("shows a digest's first twelve characters", () => {
    expect(shortDigest("0123456789abcdef")).toBe("0123456789ab");
  });
});

describe("tokenCommand", () => {
  it("sets a variable in each shell, never with a real token", () => {
    expect(tokenCommand("AZATHOTH_REMOTE_TOKEN", "posix")).toBe(
      "export AZATHOTH_REMOTE_TOKEN=<TOKEN>",
    );
    expect(tokenCommand("AZATHOTH_REMOTE_TOKEN", "powershell")).toBe(
      '$env:AZATHOTH_REMOTE_TOKEN = "<TOKEN>"',
    );
  });
});
