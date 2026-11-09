import { describe, expect, it } from "vitest";

import { begin, HISTORY_LIMIT, record, redo, undo } from "./history";

describe("history", () => {
  it("undoes and redoes each change in turn", () => {
    const history = record(record(begin("a"), "b"), "c");

    expect(undo(history).present).toBe("b");
    expect(undo(undo(history)).present).toBe("a");
    expect(redo(undo(undo(history))).present).toBe("b");
    expect(redo(redo(undo(undo(history)))).present).toBe("c");
  });

  it("does nothing with nothing to undo or redo", () => {
    const history = begin("a");

    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it("forgets what was undone once a new change is made", () => {
    const history = record(undo(record(begin("a"), "b")), "c");

    expect(history.future).toEqual([]);
    expect(history.past).toEqual(["a"]);
    expect(redo(history)).toBe(history);
  });

  it("records nothing for a change to the same value", () => {
    const history = begin("a");

    expect(record(history, "a")).toBe(history);
  });

  it("undoes the changes of one group together, and starts a new one after an undo", () => {
    const typed = record(record(record(begin(""), "h", "name"), "hi", "name"), "hi!", "name");

    expect(typed.past).toEqual([""]);
    expect(undo(typed).present).toBe("");

    const again = record(record(undo(record(typed, "x", "other")), "y", "other"), "z", "other");

    expect(again.past).toEqual(["", "hi!"]);
    expect(again.present).toBe("z");
  });

  it("keeps only so many changes", () => {
    let history = begin(0);

    for (let change = 1; change <= HISTORY_LIMIT + 5; change += 1) {
      history = record(history, change);
    }

    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toBe(5);
  });
});
