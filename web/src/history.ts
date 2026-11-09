/**
 * Undo and redo: a value's past, its present and the future undoing left.
 *
 * Changes recorded under the same group in a row, such as the letters typed
 * into one field, are undone together.
 */

/** A value with what it was before and what undoing took away. */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  readonly group: string | null;
}

/** How many changes back undo can go. */
export const HISTORY_LIMIT = 200;

/** Returns a history of one value, with nothing to undo or redo. */
export function begin<T>(present: T): History<T> {
  return { past: [], present, future: [], group: null };
}

/**
 * Returns a history with a change made: the present joins the past unless
 * the change continues the last change's group, and the future is gone. A
 * change to the same value records nothing.
 */
export function record<T>(history: History<T>, next: T, group: string | null = null): History<T> {
  if (Object.is(next, history.present)) {
    return history;
  }
  if (group !== null && group === history.group) {
    return { ...history, present: next, future: [] };
  }
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    group,
  };
}

/** Returns a history one change back, or the same history when there is nothing to undo. */
export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);

  return previous === undefined
    ? history
    : {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
        group: null,
      };
}

/** Returns a history one change forward again, or the same history when there is none. */
export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;

  return next === undefined
    ? history
    : { past: [...history.past, history.present], present: next, future: rest, group: null };
}
