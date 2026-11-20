import { describe, expect, it } from "vitest";

import {
  candidateLine,
  comparedResult,
  costSaving,
  generationCountOf,
  generationEndLine,
  generationProgressOf,
  generationTitle,
  projectionLine,
  timeSaving,
} from "./optimizing";
import {
  COMPARED,
  EARLIER_EXPERIMENT_ID,
  EXPERIMENT_ID,
  OPTIMIZATION_EVENTS,
} from "./test/optimization";

function at<T>(entries: readonly T[], index: number): T {
  const found = entries[index];

  if (found === undefined) {
    throw new Error(`No entry ${String(index)}.`);
  }

  return found;
}

describe("an optimization's progress", () => {
  it("is nothing before its first generation starts", () => {
    expect(generationProgressOf([])).toEqual([]);
  });

  it("keeps each generation's candidates as they finish, and its winner once it ends", () => {
    const progress = generationProgressOf(OPTIMIZATION_EVENTS);

    expect(progress.map((each) => [each.generation, each.final, each.candidates])).toEqual([
      [1, false, 1],
      [2, true, 2],
    ]);

    const first = at(progress, 0);
    const last = at(progress, 1);

    expect(first.finished.map((each) => each.overall_score)).toEqual([0.62]);
    expect(first.ended?.experiment_id).toBe(EARLIER_EXPERIMENT_ID);
    expect(first.winner).toBe(1);
    expect(last.finished.map((each) => each.overall_score)).toEqual([0.62, 0.96]);
    expect(last.ended?.experiment_id).toBe(EXPERIMENT_ID);
    expect(last.winner).toBe(2);
  });

  it("has no winner while a generation runs", () => {
    const progress = generationProgressOf(OPTIMIZATION_EVENTS.slice(0, 5));
    const last = at(progress, 1);

    expect(last.finished).toHaveLength(1);
    expect(last.ended).toBeNull();
    expect(last.winner).toBeNull();
  });

  it("ignores a candidate of a generation it never saw start", () => {
    expect(generationProgressOf(OPTIMIZATION_EVENTS.slice(1, 3))).toEqual([]);
  });
});

describe("an optimization said in words", () => {
  const progress = generationProgressOf(OPTIMIZATION_EVENTS);
  const first = at(progress, 0);
  const last = at(progress, 1);

  it("names each generation, and the final evaluation, with how many candidates are done", () => {
    expect(generationTitle(first)).toBe("Generation 1: 1 of 1 done");
    expect(generationTitle(last)).toBe("Final evaluation: 2 of 2 done");
  });

  it("says how each candidate did", () => {
    expect(candidateLine(at(last.finished, 1), 2, 2)).toBe(
      "Candidate 2 of 2: passed 2 of 2 cases, scoring 0.96",
    );
  });

  it("says which candidate won, and how many it proposes", () => {
    expect(generationEndLine(first)).toBe(
      "Candidate 1 won, scoring 0.62, and proposes 2 candidates",
    );
    expect(
      generationEndLine({
        ...first,
        ended: { ...at(first.ended === null ? [] : [first.ended], 0), proposed: 1 },
      }),
    ).toBe("Candidate 1 won, scoring 0.62, and proposes 1 candidate");
    expect(generationEndLine(last)).toBe("Candidate 2 won, scoring 0.96");
    expect(generationEndLine({ ...last, winner: null })).toBe("Its winner scored 0.96");
    expect(generationEndLine({ ...first, ended: null })).toBeNull();
  });
});

describe("how many generations to run", () => {
  it("is a whole number, 1 or more", () => {
    expect(generationCountOf("1")).toEqual({ value: 1, problem: null });
    expect(generationCountOf(" 3 ")).toEqual({ value: 3, problem: null });
  });

  it.each(["", "0", "-1", "1.5", "two"])("is not %j", (text) => {
    expect(generationCountOf(text)).toEqual({
      value: null,
      problem: "Give a whole number, 1 or more.",
    });
  });
});

describe("a comparison said in words", () => {
  it("says how a candidate did on a case, or that it didn't run it", () => {
    expect(comparedResult(true, 1)).toBe("Passed, scoring 1.00");
    expect(comparedResult(false, 0.25)).toBe("Failed, scoring 0.25");
    expect(comparedResult(false, null)).toBe("Failed");
    expect(comparedResult(null, null)).toBe("—");
  });

  it("says what the winner saves per run, or what it costs more", () => {
    expect(costSaving(0.04, 80)).toBe("Saves $0.04 (80%)");
    expect(costSaving(0.04, null)).toBe("Saves $0.04");
    expect(costSaving(-0.01, -25)).toBe("Costs $0.01 more (25%)");
    expect(costSaving(0, 0)).toBe("Costs the same");
    expect(costSaving(null, null)).toBe("—");
  });

  it("says how much faster the winner is per run, or how much slower", () => {
    expect(timeSaving(2.5, 50)).toBe("Saves 2.5 s (50%)");
    expect(timeSaving(-1.2, -20.4)).toBe("Takes 1.2 s longer (20%)");
    expect(timeSaving(0, null)).toBe("Takes as long");
    expect(timeSaving(null, null)).toBe("—");
  });

  it("projects the saving over production's recent invocations", () => {
    const projection = COMPARED.projection;

    if (projection === null) {
      throw new Error("The comparison has no projection.");
    }

    expect(projectionLine(projection)).toBe(
      "Over production’s 120 invocations in the last 30 days, the winner would have saved $4.80 and 5 min of waiting.",
    );
    expect(
      projectionLine({ ...projection, invocations: 1, cost_usd: -0.5, latency_seconds: null }),
    ).toBe(
      "Over production’s 1 invocation in the last 30 days, the winner would have cost $0.50 more.",
    );
    expect(projectionLine({ ...projection, cost_usd: 0.1, latency_seconds: -12 })).toBe(
      "Over production’s 120 invocations in the last 30 days, the winner would have saved $0.10 and added 12 s of waiting.",
    );
    expect(projectionLine({ ...projection, cost_usd: null, latency_seconds: null })).toBe(
      "Over production’s 120 invocations in the last 30 days, nothing was measured to project.",
    );
    expect(projectionLine({ ...projection, invocations: 0 })).toBe(
      "Production wasn’t invoked in the last 30 days, so there is nothing to project.",
    );
  });
});
