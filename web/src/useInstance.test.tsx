import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiFailure, type RequestOptions } from "./api/client";
import type { InstanceDescription } from "./api/types";
import { SQLITE_INSTANCE } from "./test/instances";
import { useInstance } from "./useInstance";

type Answer = InstanceDescription | ApiFailure;

/** Returns a loader that gives one answer per call, repeating the last. */
function answers(...queue: Answer[]): {
  load: (options?: RequestOptions) => Promise<InstanceDescription>;
  calls: () => number;
} {
  let calls = 0;

  return {
    load: () => {
      const answer = queue[Math.min(calls, queue.length - 1)];
      calls += 1;

      if (answer === undefined) {
        throw new Error("no answers");
      }
      return answer instanceof ApiFailure ? Promise.reject(answer) : Promise.resolve(answer);
    },
    calls: () => calls,
  };
}

const LOST = new ApiFailure("unreachable", "The editor's server isn't answering.", null);

describe("useInstance", () => {
  it("connects, then holds the instance", async () => {
    const loader = answers(SQLITE_INSTANCE);
    const { result } = renderHook(() => useInstance(loader.load, 60_000));

    expect(result.current).toEqual({ state: "connecting" });

    await waitFor(() => {
      expect(result.current).toEqual({ state: "connected", instance: SQLITE_INSTANCE });
    });
  });

  it("keeps the last instance it saw when the server stops answering", async () => {
    const loader = answers(SQLITE_INSTANCE, LOST);
    const { result } = renderHook(() => useInstance(loader.load, 10));

    await waitFor(() => {
      expect(result.current).toEqual({
        state: "lost",
        failure: LOST,
        instance: SQLITE_INSTANCE,
      });
    });
  });

  it("has no instance to keep when the first check fails", async () => {
    const loader = answers(LOST);
    const { result } = renderHook(() => useInstance(loader.load, 60_000));

    await waitFor(() => {
      expect(result.current).toEqual({ state: "lost", failure: LOST, instance: null });
    });
  });

  it("reconnects when the server answers again", async () => {
    const loader = answers(LOST, SQLITE_INSTANCE);
    const { result } = renderHook(() => useInstance(loader.load, 10));

    await waitFor(() => {
      expect(result.current).toEqual({ state: "connected", instance: SQLITE_INSTANCE });
    });
  });

  it("checks again when the window regains focus", async () => {
    const loader = answers(SQLITE_INSTANCE);
    renderHook(() => useInstance(loader.load, 60_000));

    await waitFor(() => {
      expect(loader.calls()).toBe(1);
    });
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => {
      expect(loader.calls()).toBe(2);
    });
  });

  it("stops checking once unmounted", async () => {
    const loader = answers(SQLITE_INSTANCE);
    const { unmount } = renderHook(() => useInstance(loader.load, 10));

    await waitFor(() => {
      expect(loader.calls()).toBeGreaterThan(0);
    });
    unmount();
    const before = loader.calls();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(loader.calls()).toBe(before);
  });
});
