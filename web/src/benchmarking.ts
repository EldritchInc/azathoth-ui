/**
 * What a person writes of a benchmark's case, and what the editor sends of
 * it (ADR 0012): what it expects, what its run must cite, its label, and
 * an edit, which sends only what changed.
 */

import type { CaseEdit } from "./api/client";
import {
  isCaseCitations,
  type BenchmarkEvent,
  type BenchmarkCaseDetail,
  type CaseFinished,
  type CaseCitations,
  type CaseComparison,
  type CaseSource,
  type Sensitivity,
} from "./api/types";

/** What each comparison asks of a case's run. */
export const COMPARISON_MEANINGS: Readonly<Record<CaseComparison, string>> = {
  exact: "Its output must equal what is expected, exactly.",
  normalized: "Its output must equal what is expected once both are normalized.",
  semantic: "The judges decide whether its output means what is expected.",
  schema: "Its output must match what is expected, read as a JSON Schema.",
};

/** What a case was made from, as a sentence's start names it. */
export const SOURCE_NAMES: Readonly<Record<CaseSource, string>> = {
  run: "A run",
  file: "A file",
  json: "JSON",
};

const EXPECTED_MISSING = "Write what it expects, as JSON: text goes in quotes.";

const CITATIONS_FORM =
  'Write {"require": [{"source", "segment"}, …], "on_unverified": "fail" or "ignore"}, or leave it empty.';

const DESCRIPTION_MISSING = "Say what the case expects, in words.";

function parsed(text: string): { readonly value: unknown } | { readonly problem: string } {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "it doesn’t read as JSON";

    return { problem: `This isn’t JSON yet: ${reason}` };
  }
}

/** Returns the value a case is written to expect, or why it isn't one yet. */
export function expectedOf(text: string): {
  readonly value: unknown;
  readonly problem: string | null;
} {
  if (text.trim() === "") {
    return { value: undefined, problem: EXPECTED_MISSING };
  }
  const read = parsed(text);

  return "value" in read ? { value: read.value, problem: null } : { value: undefined, ...read };
}

/** Returns what a case's run is written to cite, `null` for nothing, or why it isn't that yet. */
export function citationsOf(text: string): {
  readonly citations: CaseCitations | null;
  readonly problem: string | null;
} {
  if (text.trim() === "") {
    return { citations: null, problem: null };
  }
  const read = parsed(text);

  if ("problem" in read) {
    return { citations: null, problem: read.problem };
  }

  return isCaseCitations(read.value)
    ? { citations: read.value, problem: null }
    : { citations: null, problem: CITATIONS_FORM };
}

const LABELS: readonly Sensitivity[] = ["public", "internal", "restricted"];

/** Returns the labels a case may be given: its own, and each more sensitive one. */
export function raisableLabels(current: Sensitivity): Sensitivity[] {
  return LABELS.slice(LABELS.indexOf(current));
}

/** An edit of a case as a person writes it: its JSON as text. */
export interface EditDraft {
  readonly comparison: CaseComparison;
  readonly expected: string;
  readonly description: string;
  readonly citations: string;
  readonly sensitivity: Sensitivity;
}

/** Returns an edit of a case that starts as the case is. */
export function draftOf(detail: BenchmarkCaseDetail): EditDraft {
  return {
    comparison: detail.comparison,
    expected: JSON.stringify(detail.expected, null, 2),
    description: detail.description,
    citations: detail.citations === null ? "" : JSON.stringify(detail.citations, null, 2),
    sensitivity: detail.sensitivity,
  };
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Returns what an edit sends: only what differs from the case, so an
 * untouched field is left as it was. Emptied citations stop requiring any.
 */
export function caseEditOf(
  detail: BenchmarkCaseDetail,
  draft: EditDraft,
): { readonly edit: CaseEdit | null; readonly problem: string | null } {
  const expected = expectedOf(draft.expected);
  const citations = citationsOf(draft.citations);
  const description = draft.description.trim();
  const problem =
    expected.problem ?? citations.problem ?? (description === "" ? DESCRIPTION_MISSING : null);

  if (problem !== null) {
    return { edit: null, problem };
  }

  return {
    edit: {
      ...(draft.comparison === detail.comparison ? {} : { comparison: draft.comparison }),
      ...(same(expected.value, detail.expected) ? {} : { expected: expected.value }),
      ...(description === detail.description ? {} : { description }),
      ...(same(citations.citations, detail.citations) ? {} : { citations: citations.citations }),
      ...(draft.sensitivity === detail.sensitivity ? {} : { sensitivity: draft.sensitivity }),
    },
    problem: null,
  };
}

/** One case of a live benchmark, once it started: its place, and how it finished, if it has. */
export interface CaseRun {
  readonly case_id: string;
  readonly index: number;
  readonly finished: CaseFinished | null;
}

/** One workflow's cases in a live benchmark run or comparison. */
export interface WorkflowCases {
  readonly workflow_id: string;
  /** How many cases it runs. */
  readonly total: number;
  readonly done: number;
  readonly passed: number;
  /** Each case that started, in the order it did. */
  readonly cases: readonly CaseRun[];
}

/** Returns each workflow's cases so far, in the order the workflows started, from its events. */
export function caseProgressOf(events: readonly BenchmarkEvent[]): WorkflowCases[] {
  const workflows = new Map<string, { total: number; cases: Map<string, CaseRun> }>();

  for (const event of events) {
    const known = workflows.get(event.workflow_id);
    const workflow = known ?? { total: 0, cases: new Map<string, CaseRun>() };

    if (known === undefined) {
      workflows.set(event.workflow_id, workflow);
    }
    if (event.type === "case_started") {
      workflow.total = event.total;
      workflow.cases.set(event.case_id, {
        case_id: event.case_id,
        index: event.index,
        finished: null,
      });
    } else {
      const started = workflow.cases.get(event.case_id);

      workflow.cases.set(event.case_id, {
        case_id: event.case_id,
        index: started?.index ?? workflow.cases.size + 1,
        finished: event,
      });
    }
  }

  return [...workflows].map(([workflowId, { total, cases }]) => {
    const runs = [...cases.values()];
    const finished = runs.filter((each) => each.finished !== null);

    return {
      workflow_id: workflowId,
      total: Math.max(total, runs.length),
      done: finished.length,
      passed: finished.filter((each) => each.finished?.passed === true).length,
      cases: runs,
    };
  });
}

const TARGET_PROBLEM = "Give a number above zero.";

/** Returns a comparison's latency or cost target, as written, or why it isn't one. */
export function targetOf(text: string): {
  readonly value: number | null;
  readonly problem: string | null;
} {
  const value = text.trim() === "" ? Number.NaN : Number(text);

  return Number.isFinite(value) && value > 0
    ? { value, problem: null }
    : { value: null, problem: TARGET_PROBLEM };
}
