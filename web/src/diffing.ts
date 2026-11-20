/**
 * Comparing two revisions of a component (ADR 0015): which two a page
 * compares, the command that prints the same comparison, and how one side
 * of a change reads.
 */

import type { RevisionChange } from "./api/types";
import { parseRevision, type ComponentRef, type Kind } from "./kinds";

/** The two revisions a comparison names, the one compared from and the one compared to. */
export interface ComparedRevisions {
  readonly before: number;
  readonly after: number;
}

/**
 * Returns the two revisions a page's `?before=&after=` names: the latest,
 * and the one before it, unless the address names others.
 */
export function comparedRevisions(
  before: string | null,
  after: string | null,
  latest: number,
): ComparedRevisions {
  const to = parseRevision(after) ?? latest;

  return { before: parseRevision(before) ?? Math.max(1, to - 1), after: to };
}

/** The noun each kind's `azathoth` commands take. */
const NOUNS: Record<Kind, string> = {
  workflows: "workflow",
  tools: "tool",
  benchmarks: "benchmark",
};

/** Returns the `azathoth … diff` command that prints the same comparison. */
export function diffCommand(kind: Kind, ref: ComponentRef, compared: ComparedRevisions): string {
  const command = `azathoth ${NOUNS[kind]} diff ${ref.id} ${String(compared.before)} ${String(compared.after)}`;

  return kind === "tools" ? `${command} --version ${ref.version ?? ""}` : command;
}

/** The words a value withheld from a comparison is shown as. */
export const WITHHELD = "withheld";

/** Returns one side of a change as it reads: its JSON, or that it is withheld. */
export function shownValue(value: unknown, withheld: boolean): string {
  if (value === null && withheld) {
    return WITHHELD;
  }

  return value === undefined ? "null" : JSON.stringify(value);
}

/** The mark each kind of change is shown with, as `azathoth … diff` prints it. */
export const MARKS: Record<RevisionChange["kind"], string> = {
  added: "+",
  removed: "-",
  changed: "~",
};
