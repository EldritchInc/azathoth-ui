import { describe, expect, it } from "vitest";

import { THEME_KEY, applyTheme, readTheme, saveTheme } from "./theme";

function memory(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));

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

function broken(): Storage {
  const refuse = (): never => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };

  return {
    length: 0,
    clear: refuse,
    getItem: refuse,
    key: refuse,
    removeItem: refuse,
    setItem: refuse,
  };
}

describe("readTheme", () => {
  it("follows the system until a theme is chosen", () => {
    expect(readTheme(memory())).toBe("system");
    expect(readTheme(null)).toBe("system");
  });

  it("returns the theme chosen", () => {
    expect(readTheme(memory({ [THEME_KEY]: "dark" }))).toBe("dark");
    expect(readTheme(memory({ [THEME_KEY]: "light" }))).toBe("light");
  });

  it("ignores a value it does not know, and storage it cannot read", () => {
    expect(readTheme(memory({ [THEME_KEY]: "sepia" }))).toBe("system");
    expect(readTheme(broken())).toBe("system");
  });

  it("keeps its choice under the editor's own key", () => {
    expect(THEME_KEY).toBe("azathoth-ui.theme");
  });
});

describe("saveTheme", () => {
  it("keeps a chosen theme, and forgets it for the system's", () => {
    const storage = memory();

    saveTheme(storage, "dark");
    expect(storage.getItem(THEME_KEY)).toBe("dark");

    saveTheme(storage, "system");
    expect(storage.getItem(THEME_KEY)).toBeNull();
  });

  it("does without storage it cannot write", () => {
    expect(() => {
      saveTheme(broken(), "light");
    }).not.toThrow();
    expect(() => {
      saveTheme(null, "light");
    }).not.toThrow();
  });
});

describe("applyTheme", () => {
  it("names a chosen theme on the root, and names none for the system's", () => {
    const root = document.createElement("html");

    applyTheme(root, "light");
    expect(root.dataset.theme).toBe("light");

    applyTheme(root, "system");
    expect(root.dataset.theme).toBeUndefined();
  });
});
