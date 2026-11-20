/**
 * An optimization as it runs, from its events (ADR 0013): each generation,
 * or the final evaluation, with its candidates as they finish and, once it
 * ends, which won and how many it proposes next.
 */

import type { CandidateFinished, GenerationFinished, OptimizationEvent } from "./api/types";

/** One generation of an optimization, so far. */
export interface GenerationProgress {
  readonly generation: number;
  /** Whether it is the final evaluation of the last generation's proposals. */
  readonly final: boolean;
  /** How many candidates it runs. */
  readonly candidates: number;
  readonly finished: readonly CandidateFinished[];
  readonly ended: GenerationFinished | null;
  /** Which of its candidates won, counted from 1, once it has ended. */
  readonly winner: number | null;
}

function sameStrategies(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((each, index) => each === right[index]);
}

/**
 * Returns each generation an optimization's events tell of, in order. A
 * candidate or an end of a generation never seen starting is left out.
 */
export function generationProgressOf(events: readonly OptimizationEvent[]): GenerationProgress[] {
  const generations: {
    generation: number;
    final: boolean;
    candidates: number;
    finished: CandidateFinished[];
    ended: GenerationFinished | null;
  }[] = [];

  for (const event of events) {
    if (event.type === "generation_started") {
      generations.push({
        generation: event.generation,
        final: event.final,
        candidates: event.candidates,
        finished: [],
        ended: null,
      });
      continue;
    }

    const current = generations.findLast((each) => each.generation === event.generation);

    if (current === undefined) {
      continue;
    }
    if (event.type === "candidate_finished") {
      current.finished.push(event);
    } else {
      current.ended = event;
    }
  }

  return generations.map((each) => {
    const ended = each.ended;
    const index =
      ended === null
        ? -1
        : each.finished.findIndex((candidate) =>
            sameStrategies(candidate.strategy_ids, ended.winner_strategy_ids),
          );

    return { ...each, winner: index === -1 ? null : index + 1 };
  });
}

/** Returns a generation's name, and how many of its candidates are done. */
export function generationTitle(progress: GenerationProgress): string {
  const name = progress.final ? "Final evaluation" : `Generation ${String(progress.generation)}`;

  return `${name}: ${String(progress.finished.length)} of ${String(progress.candidates)} done`;
}

/** Returns how one candidate did: the cases it passed, and its score. */
export function candidateLine(candidate: CandidateFinished, index: number, total: number): string {
  return (
    `Candidate ${String(index)} of ${String(total)}: ` +
    `passed ${String(candidate.cases_passed)} of ${String(candidate.cases_run)} cases, ` +
    `scoring ${candidate.overall_score.toFixed(2)}`
  );
}

/** Returns which candidate won a generation that ended, and how many it proposes next. */
export function generationEndLine(progress: GenerationProgress): string | null {
  const ended = progress.ended;

  if (ended === null) {
    return null;
  }

  const score = ended.winner_score.toFixed(2);
  const won =
    progress.winner === null
      ? `Its winner scored ${score}`
      : `Candidate ${String(progress.winner)} won, scoring ${score}`;

  if (ended.proposed === 0) {
    return won;
  }

  return `${won}, and proposes ${String(ended.proposed)} candidate${ended.proposed === 1 ? "" : "s"}`;
}

const COUNT_PROBLEM = "Give a whole number, 1 or more.";

/** Returns how many generations to run, as written, or why it isn't a count. */
export function generationCountOf(text: string): {
  readonly value: number | null;
  readonly problem: string | null;
} {
  const trimmed = text.trim();
  const value = /^\d+$/.test(trimmed) ? Number(trimmed) : 0;

  return value >= 1 ? { value, problem: null } : { value: null, problem: COUNT_PROBLEM };
}
