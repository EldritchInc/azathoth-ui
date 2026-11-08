import { describe, expect, it } from "vitest";

import { SQLITE_INSTANCE, answering } from "../test/instances";
import {
  ApiFailure,
  INVALID_RESPONSE_MESSAGE,
  UNREACHABLE_MESSAGE,
  fetchInstance,
  getJson,
} from "./client";

async function failure(promise: Promise<unknown>): Promise<ApiFailure> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiFailure) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a failure");
}

describe("getJson", () => {
  it("asks the server for JSON with its cookie", async () => {
    const seen: [string, RequestInit | undefined][] = [];
    const fetcher: typeof fetch = (input, init) => {
      seen.push([input instanceof Request ? input.url : input.toString(), init]);
      return answering(200, { ok: true })(input, init);
    };

    expect(await getJson("/api/thing", { fetcher })).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toBe("/api/thing");
    expect(seen[0]?.[1]?.credentials).toBe("same-origin");
    expect(seen[0]?.[1]?.headers).toEqual({ accept: "application/json" });
  });

  it("turns an API error into a failure with its code, message and status", async () => {
    const fetcher = answering(503, {
      error: { code: "instance_closed", message: "This Azathoth instance is closed." },
    });
    const error = await failure(getJson("/api/thing", { fetcher }));

    expect(error.code).toBe("instance_closed");
    expect(error.message).toBe("This Azathoth instance is closed.");
    expect(error.status).toBe(503);
  });

  it("calls a server that does not answer unreachable", async () => {
    const fetcher: typeof fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    const error = await failure(getJson("/api/thing", { fetcher }));

    expect(error.code).toBe("unreachable");
    expect(error.message).toBe(UNREACHABLE_MESSAGE);
    expect(error.status).toBeNull();
  });

  it("calls an error without the API's shape an invalid response", async () => {
    const fetcher: typeof fetch = () =>
      Promise.resolve(new Response("Bad Gateway", { status: 502 }));
    const error = await failure(getJson("/api/thing", { fetcher }));

    expect(error.code).toBe("invalid_response");
    expect(error.message).toBe(INVALID_RESPONSE_MESSAGE);
    expect(error.status).toBe(502);
  });

  it("calls JSON that is not the API's error an invalid response", async () => {
    const fetcher = answering(500, { detail: "Internal Server Error" });
    const error = await failure(getJson("/api/thing", { fetcher }));

    expect(error.code).toBe("invalid_response");
    expect(error.status).toBe(500);
  });

  it("lets an abort through as it is", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("Aborted", "AbortError");
    const fetcher: typeof fetch = () => {
      controller.abort();
      return Promise.reject(aborted);
    };

    await expect(getJson("/api/thing", { fetcher, signal: controller.signal })).rejects.toBe(
      aborted,
    );
  });
});

describe("fetchInstance", () => {
  it("returns the instance the server describes", async () => {
    const instance = await fetchInstance({ fetcher: answering(200, SQLITE_INSTANCE) });

    expect(instance).toEqual(SQLITE_INSTANCE);
  });

  it("refuses a description missing what the editor shows", async () => {
    const partial = Object.fromEntries(
      Object.entries(SQLITE_INSTANCE).filter(([key]) => key !== "schema_version"),
    );
    const error = await failure(fetchInstance({ fetcher: answering(200, partial) }));

    expect(error.code).toBe("invalid_response");
  });

  it("refuses a backend it does not know", async () => {
    const fetcher = answering(200, { ...SQLITE_INSTANCE, backend: "oracle" });

    expect((await failure(fetchInstance({ fetcher }))).code).toBe("invalid_response");
  });
});
