import { describe, expect, it } from "vitest";

import { ApiFailure } from "./api/client";
import { queryKeys, retryable } from "./queries";

describe("retryable", () => {
  it("tries a request that did not reach the server twice more", () => {
    const unreachable = new ApiFailure("unreachable", "gone", null);

    expect(retryable(0, unreachable)).toBe(true);
    expect(retryable(1, unreachable)).toBe(true);
    expect(retryable(2, unreachable)).toBe(false);
  });

  it("tries a server failure again", () => {
    expect(retryable(0, new ApiFailure("instance_closed", "closed", 503))).toBe(true);
  });

  it("never repeats a request the server refused", () => {
    expect(retryable(0, new ApiFailure("not_found", "gone", 404))).toBe(false);
    expect(retryable(0, new ApiFailure("unauthenticated", "key", 401))).toBe(false);
  });
});

describe("queryKeys", () => {
  it("keeps each kind's list under its own key", () => {
    expect(queryKeys.list("tools")).toEqual(["tools", "list"]);
    expect(queryKeys.editor).toEqual(["editor"]);
  });

  it("keeps each revision and each tool version apart", () => {
    expect(queryKeys.detail("workflows", { id: "w" }, null)).toEqual([
      "workflows",
      "detail",
      "w",
      null,
      null,
    ]);
    expect(queryKeys.detail("tools", { id: "t", version: "1.0.0" }, 2)).toEqual([
      "tools",
      "detail",
      "t",
      "1.0.0",
      2,
    ]);
    expect(queryKeys.history("tools", { id: "t", version: "1.0.0" })).toEqual([
      "tools",
      "history",
      "t",
      "1.0.0",
    ]);
  });
});
