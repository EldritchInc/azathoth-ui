import { describe, expect, it } from "vitest";

import {
  caseEditOf,
  caseProgressOf,
  citationsOf,
  draftOf,
  expectedOf,
  raisableLabels,
  targetOf,
  type EditDraft,
} from "./benchmarking";
import {
  CASE_EVENTS,
  JSON_CASE,
  JSON_CASE_DETAIL,
  RUN_CASE,
  RUN_CASE_DETAIL,
} from "./test/benchmarks";
import { REVIEW_WORKFLOW, WORKFLOW } from "./test/instances";

describe("what a case expects", () => {
  it("is any JSON value, text in quotes", () => {
    expect(expectedOf("8")).toEqual({ value: 8, problem: null });
    expect(expectedOf("null")).toEqual({ value: null, problem: null });
    expect(expectedOf(' "eight" ')).toEqual({ value: "eight", problem: null });
  });

  it("is refused when it is empty or isn't JSON", () => {
    expect(expectedOf("  ").problem).toBe("Write what it expects, as JSON: text goes in quotes.");
    expect(expectedOf("eight").problem).toMatch(/^This isn’t JSON yet: /);
  });
});

describe("what a case's run must cite", () => {
  it("is nothing when left empty", () => {
    expect(citationsOf(" ")).toEqual({ citations: null, problem: null });
  });

  it("is what Azathoth reads", () => {
    const text = JSON.stringify(RUN_CASE_DETAIL.citations);

    expect(citationsOf(text)).toEqual({ citations: RUN_CASE_DETAIL.citations, problem: null });
  });

  it("is refused when it isn't segments and a rule", () => {
    expect(citationsOf("[1]").problem).toBe(
      'Write {"require": [{"source", "segment"}, …], "on_unverified": "fail" or "ignore"}, or leave it empty.',
    );
    expect(citationsOf("{").problem).toMatch(/^This isn’t JSON yet: /);
  });
});

describe("a case's label", () => {
  it("can only be raised", () => {
    expect(raisableLabels("public")).toEqual(["public", "internal", "restricted"]);
    expect(raisableLabels("internal")).toEqual(["internal", "restricted"]);
    expect(raisableLabels("restricted")).toEqual(["restricted"]);
  });
});

describe("an edit of a case", () => {
  it("starts as the case is, and changes nothing until something does", () => {
    const draft = draftOf(RUN_CASE_DETAIL);

    expect(draft).toEqual({
      comparison: "semantic",
      expected: JSON.stringify(RUN_CASE_DETAIL.expected, null, 2),
      description: RUN_CASE_DETAIL.description,
      citations: JSON.stringify(RUN_CASE_DETAIL.citations, null, 2),
      sensitivity: "restricted",
    });
    expect(caseEditOf(RUN_CASE_DETAIL, draft)).toEqual({ edit: {}, problem: null });
    expect(draftOf(JSON_CASE_DETAIL).citations).toBe("");
  });

  it("sends only what changed", () => {
    const draft: EditDraft = {
      ...draftOf(JSON_CASE_DETAIL),
      comparison: "normalized",
      expected: "9",
      description: "  Nine words.  ",
      sensitivity: "restricted",
    };

    expect(caseEditOf(JSON_CASE_DETAIL, draft)).toEqual({
      edit: {
        comparison: "normalized",
        expected: 9,
        description: "Nine words.",
        sensitivity: "restricted",
      },
      problem: null,
    });
  });

  it("stops requiring citations when they are emptied, and can expect null", () => {
    const draft: EditDraft = { ...draftOf(RUN_CASE_DETAIL), citations: "", expected: "null" };

    expect(caseEditOf(RUN_CASE_DETAIL, draft)).toEqual({
      edit: { citations: null, expected: null },
      problem: null,
    });
  });

  it("says why it can't be sent yet", () => {
    expect(caseEditOf(JSON_CASE_DETAIL, { ...draftOf(JSON_CASE_DETAIL), expected: "" })).toEqual({
      edit: null,
      problem: "Write what it expects, as JSON: text goes in quotes.",
    });
    expect(
      caseEditOf(JSON_CASE_DETAIL, { ...draftOf(JSON_CASE_DETAIL), citations: "[]" }).edit,
    ).toBeNull();
    expect(
      caseEditOf(JSON_CASE_DETAIL, { ...draftOf(JSON_CASE_DETAIL), description: " " }),
    ).toEqual({ edit: null, problem: "Say what the case expects, in words." });
  });
});

describe("a live benchmark's cases", () => {
  it("are told by workflow, each case as it started and how it finished", () => {
    const [started, finished] = [CASE_EVENTS[0], CASE_EVENTS[1]];

    if (started === undefined || finished === undefined) {
      throw new Error("Two events were expected.");
    }

    expect(caseProgressOf(CASE_EVENTS.slice(0, 3))).toEqual([
      {
        workflow_id: WORKFLOW.id,
        total: 2,
        done: 1,
        passed: 1,
        cases: [
          { case_id: JSON_CASE.case_id, index: 1, finished },
          { case_id: RUN_CASE.case_id, index: 2, finished: null },
        ],
      },
    ]);
    expect(caseProgressOf([started])[0]?.done).toBe(0);
  });

  it("keep each workflow of a comparison apart, in the order they started", () => {
    const second = CASE_EVENTS.map((event) => ({ ...event, workflow_id: REVIEW_WORKFLOW.id }));
    const progress = caseProgressOf([...CASE_EVENTS, ...second]);

    expect(progress.map((each) => [each.workflow_id, each.done, each.passed])).toEqual([
      [WORKFLOW.id, 2, 1],
      [REVIEW_WORKFLOW.id, 2, 1],
    ]);
  });

  it("are none before the first case starts", () => {
    expect(caseProgressOf([])).toEqual([]);
  });
});

describe("a comparison's target", () => {
  it("is a number above zero", () => {
    expect(targetOf("5")).toEqual({ value: 5, problem: null });
    expect(targetOf(" 0.01 ")).toEqual({ value: 0.01, problem: null });
  });

  it("is refused when it isn't one", () => {
    for (const text of ["", "0", "-1", "fast", "Infinity"]) {
      expect(targetOf(text)).toEqual({ value: null, problem: "Give a number above zero." });
    }
  });
});
