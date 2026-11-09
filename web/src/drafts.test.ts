import { describe, expect, it } from "vitest";

import {
  allDrafts,
  discardDraft,
  draftKey,
  readDraft,
  same,
  saveDraft,
  workflowId,
  workflowName,
} from "./drafts";
import { uuid, VALID_DOCUMENT } from "./test/documents";

function memory(entries: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(entries));

  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function blocked(): never {
  throw new Error("blocked");
}

const BLOCKED: Storage = {
  length: 0,
  clear: blocked,
  getItem: blocked,
  key: blocked,
  removeItem: blocked,
  setItem: blocked,
};

describe("drafts", () => {
  it("keeps a draft under its workflow's id, and reads it back", () => {
    const storage = memory();

    expect(saveDraft(storage, uuid(1), { document: VALID_DOCUMENT, base: 3 })).toBe(true);
    expect(storage.getItem(draftKey(uuid(1)))).not.toBeNull();
    expect(readDraft(storage, uuid(1))).toEqual({ document: VALID_DOCUMENT, base: 3 });
    expect(readDraft(storage, uuid(2))).toBeNull();
  });

  it("keeps a draft of a workflow never saved", () => {
    const storage = memory();

    saveDraft(storage, uuid(1), { document: VALID_DOCUMENT, base: null });

    expect(readDraft(storage, uuid(1))).toEqual({ document: VALID_DOCUMENT, base: null });
  });

  it("reads nothing it does not recognise as a draft", () => {
    const storage = memory({
      [draftKey("a")]: "not json",
      [draftKey("b")]: JSON.stringify({ document: [], base: null }),
      [draftKey("c")]: JSON.stringify({ document: {}, base: 0 }),
      [draftKey("d")]: JSON.stringify({ document: {}, base: 1.5 }),
      [draftKey("e")]: JSON.stringify({ document: {} }),
    });

    for (const id of ["a", "b", "c", "d", "e"]) {
      expect(readDraft(storage, id)).toBeNull();
    }
  });

  it("forgets a draft", () => {
    const storage = memory();

    saveDraft(storage, uuid(1), { document: VALID_DOCUMENT, base: 1 });
    discardDraft(storage, uuid(1));

    expect(readDraft(storage, uuid(1))).toBeNull();
  });

  it("lists every draft it can read, and nothing else kept beside them", () => {
    const storage = memory({
      "azathoth-ui.theme": "dark",
      "something.else": JSON.stringify({ document: {}, base: null }),
      [draftKey("bad")]: "{",
    });

    saveDraft(storage, uuid(1), { document: VALID_DOCUMENT, base: 1 });
    saveDraft(storage, uuid(2), { document: {}, base: null });

    expect([...allDrafts(storage).keys()].sort()).toEqual([uuid(1), uuid(2)]);
    expect(allDrafts(storage).get(uuid(2))).toEqual({ document: {}, base: null });
  });

  it("does without a storage it cannot use", () => {
    expect(saveDraft(BLOCKED, uuid(1), { document: {}, base: null })).toBe(false);
    expect(saveDraft(null, uuid(1), { document: {}, base: null })).toBe(false);
    expect(readDraft(BLOCKED, uuid(1))).toBeNull();
    expect(readDraft(null, uuid(1))).toBeNull();
    expect(allDrafts(BLOCKED).size).toBe(0);
    expect(allDrafts(null).size).toBe(0);
    expect(() => {
      discardDraft(BLOCKED, uuid(1));
    }).not.toThrow();
  });
});

describe("a workflow document's id and name", () => {
  it("reads them from its metadata", () => {
    expect(workflowId(VALID_DOCUMENT)).toBe(uuid(1));
    expect(workflowName(VALID_DOCUMENT)).toBe("summarize ticket");
  });

  it("has neither when its metadata does not say", () => {
    expect(workflowId({})).toBeNull();
    expect(workflowName({ metadata: { name: "  " } })).toBeNull();
  });
});

describe("same", () => {
  it("compares documents by what they say, not the order of their keys", () => {
    expect(
      same({ a: 1, b: { c: [1, { d: 2, e: 3 }] } }, { b: { c: [1, { e: 3, d: 2 }] }, a: 1 }),
    ).toBe(true);
    expect(same({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(same({ a: 1 }, { a: 1, b: null })).toBe(false);
  });
});
