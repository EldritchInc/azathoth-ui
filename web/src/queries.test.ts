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
});
