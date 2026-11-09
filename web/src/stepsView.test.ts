import { describe, expect, it } from "vitest";

import { isNarrow, NARROW_QUERY, readStepsView, saveStepsView, STEPS_VIEW_KEY } from "./stepsView";

function storageWith(entries: Record<string, string>): Storage {
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

const BROKEN: Storage = {
  length: 0,
  clear: blocked,
  getItem: blocked,
  key: blocked,
  removeItem: blocked,
  setItem: blocked,
};

describe("readStepsView", () => {
  it("shows the graph on a wide window and the outline on a narrow one", () => {
    expect(readStepsView(storageWith({}), false)).toBe("graph");
    expect(readStepsView(storageWith({}), true)).toBe("outline");
    expect(readStepsView(null, true)).toBe("outline");
  });

  it("keeps to what the person chose, whatever the window", () => {
    expect(readStepsView(storageWith({ [STEPS_VIEW_KEY]: "graph" }), true)).toBe("graph");
    expect(readStepsView(storageWith({ [STEPS_VIEW_KEY]: "outline" }), false)).toBe("outline");
  });

  it("chooses by the window when the storage holds nothing it knows or cannot be read", () => {
    expect(readStepsView(storageWith({ [STEPS_VIEW_KEY]: "tree" }), false)).toBe("graph");
    expect(readStepsView(BROKEN, true)).toBe("outline");
  });
});

describe("saveStepsView", () => {
  it("remembers the person's choice", () => {
    const storage = storageWith({});

    saveStepsView(storage, "outline");

    expect(storage.getItem(STEPS_VIEW_KEY)).toBe("outline");
    expect(readStepsView(storage, false)).toBe("outline");
  });

  it("does without a storage it cannot write", () => {
    expect(() => {
      saveStepsView(BROKEN, "graph");
    }).not.toThrow();
    expect(() => {
      saveStepsView(null, "graph");
    }).not.toThrow();
  });
});

describe("isNarrow", () => {
  it("asks the window whether it is phone-narrow", () => {
    const asked: string[] = [];
    const window = {
      matchMedia: (query: string) => {
        asked.push(query);
        return { matches: true } as MediaQueryList;
      },
    };

    expect(isNarrow(window)).toBe(true);
    expect(asked).toEqual([NARROW_QUERY]);
  });

  it("calls a window it cannot ask wide", () => {
    expect(isNarrow(null)).toBe(false);
    expect(isNarrow({} as Pick<Window, "matchMedia">)).toBe(false);
    expect(
      isNarrow({
        matchMedia: () => {
          throw new Error("no media");
        },
      }),
    ).toBe(false);
  });
});
