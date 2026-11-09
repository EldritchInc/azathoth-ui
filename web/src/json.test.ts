import { describe, expect, it } from "vitest";

import { layOut, tokenize } from "./json";

describe("tokenize", () => {
  it("tells keys from string values, and keeps every character", () => {
    const json = layOut({ name: "count", tags: ["a"], size: -1.5e3, live: true, gone: null });
    const tokens = tokenize(json);

    expect(tokens.map((token) => token.text).join("")).toBe(json);
    expect(tokens.filter((token) => token.kind === "key").map((token) => token.text)).toEqual([
      '"name"',
      '"tags"',
      '"size"',
      '"live"',
      '"gone"',
    ]);
    expect(tokens.filter((token) => token.kind === "string").map((token) => token.text)).toEqual([
      '"count"',
      '"a"',
    ]);
    expect(tokens.find((token) => token.kind === "number")?.text).toBe("-1500");
    expect(tokens.filter((token) => token.kind === "literal").map((token) => token.text)).toEqual([
      "true",
      "null",
    ]);
  });

  it("keeps escaped quotes inside a string", () => {
    const tokens = tokenize(layOut({ say: 'a "quoted" word: yes' }));

    expect(tokens.find((token) => token.kind === "string")?.text).toBe(
      '"a \\"quoted\\" word: yes"',
    );
  });

  it("keeps text it cannot read, rather than losing it", () => {
    expect(
      tokenize("{ ? }")
        .map((token) => token.text)
        .join(""),
    ).toBe("{ ? }");
  });
});
