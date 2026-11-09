import { describe, expect, it } from "vitest";

import { MAX_DOCUMENT_BYTES } from "./api/client";
import { TOO_LARGE_MESSAGE, readText, refusal } from "./importing";

describe("refusal", () => {
  it("sends a document as large as the server takes, and refuses a larger one", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(refusal({ size: MAX_DOCUMENT_BYTES })).toBeNull();
    expect(refusal({ size: MAX_DOCUMENT_BYTES + 1 })).toBe(TOO_LARGE_MESSAGE);
  });
});

describe("readText", () => {
  it("reads a file's text as UTF-8", async () => {
    const file = new File(['{"name": "ñame"}'], "name.json", { type: "application/json" });

    expect(await readText(file)).toBe('{"name": "ñame"}');
  });
});
