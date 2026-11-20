/**
 * An optimization as it runs, from its events (ADR 0013): each generation,
 * or the final evaluation, with its candidates as they finish and, once it
 * ends, which won and how many it proposes next.
 */

import type {
  CandidateFinished,
  GenerationFinished,
  OptimizationEvent,
  SavingsProjection,
} from "./api/types";
import { dollarsOf } from "./benchmarking";
import { lengthOf } from "./running";

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

/** Returns how one side of a comparison did on a case, or a dash when it didn't run it. */
export function comparedResult(passed: boolean | null, score: number | null): string {
  if (passed === null && score === null) {
    return "—";
  }

  const result = passed === null ? "Unknown" : passed ? "Passed" : "Failed";

  return score === null ? result : `${result}, scoring ${score.toFixed(2)}`;
}

function percentNote(percent: number | null): string {
  return percent === null ? "" : ` (${String(Math.round(Math.abs(percent)))}%)`;
}

/** Returns what the winner saves per run in cost, or what it costs more. */
export function costSaving(amount: number | null, percent: number | null): string {
  if (amount === null) {
    return "—";
  }
  if (amount === 0) {
    return "Costs the same";
  }

  return amount > 0
    ? `Saves ${dollarsOf(amount)}${percentNote(percent)}`
    : `Costs ${dollarsOf(-amount)} more${percentNote(percent)}`;
}

/** Returns how much time the winner saves per run, or how much longer it takes. */
export function timeSaving(seconds: number | null, percent: number | null): string {
  if (seconds === null) {
    return "—";
  }
  if (seconds === 0) {
    return "Takes as long";
  }

  return seconds > 0
    ? `Saves ${lengthOf(seconds)}${percentNote(percent)}`
    : `Takes ${lengthOf(-seconds)} longer${percentNote(percent)}`;
}

/**
 * Returns what the winner would have saved over production's recent
 * invocations, said as what would have been: a projection, never a
 * measurement.
 */
export function projectionLine(projection: SavingsProjection): string {
  const days = String(projection.window_days);

  if (projection.invocations === 0) {
    return `Production wasn’t invoked in the last ${days} days, so there is nothing to project.`;
  }

  const count = projection.invocations;
  const over = `Over production’s ${String(count)} invocation${count === 1 ? "" : "s"} in the last ${days} days`;
  const parts: string[] = [];
  const costSaved = projection.cost_usd !== null && projection.cost_usd >= 0;

  if (projection.cost_usd !== null) {
    parts.push(
      projection.cost_usd >= 0
        ? `saved ${dollarsOf(projection.cost_usd)}`
        : `cost ${dollarsOf(-projection.cost_usd)} more`,
    );
  }
  if (projection.latency_seconds !== null) {
    parts.push(
      projection.latency_seconds >= 0
        ? `${costSaved ? "" : "saved "}${lengthOf(projection.latency_seconds)} of waiting`
        : `added ${lengthOf(-projection.latency_seconds)} of waiting`,
    );
  }

  return parts.length === 0
    ? `${over}, nothing was measured to project.`
    : `${over}, the winner would have ${parts.join(" and ")}.`;
}
