import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { liveEventsPath } from "./api/client";
import {
  isBenchmarkEvent,
  isLiveRun,
  isOptimizationEvent,
  isRunEvent,
  type BenchmarkEvent,
  type LiveRun,
  type OptimizationEvent,
  type RunEvent,
} from "./api/types";
import { queryKeys } from "./queries";
import { scoped, useScope } from "./scope";

/**
 * A live run's events so far, how it ended once it has, and whether its
 * stream was lost. A benchmark run's or a comparison's events are its
 * cases, and an optimization's its generations, each kept apart from a run's.
 */
export interface LiveEvents {
  readonly events: readonly RunEvent[];
  readonly cases: readonly BenchmarkEvent[];
  readonly generations: readonly OptimizationEvent[];
  readonly end: LiveRun | null;
  /** Whether the stream closed before the run's end, and will not come back. */
  readonly lost: boolean;
}

const NOTHING_YET: LiveEvents = {
  events: [],
  cases: [],
  generations: [],
  end: null,
  lost: false,
};

function parsed(data: unknown): unknown {
  try {
    return typeof data === "string" ? (JSON.parse(data) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * Returns a live run's events as its server streams them (ADR 0007), from
 * the first, then how it ended. The browser reconnects a dropped stream by
 * itself, and each event is numbered, so none is shown twice. Once the run
 * ends, the editor's view of its live runs, and of the runs kept, is
 * fetched again.
 */
export function useLiveEvents(handle: string): LiveEvents {
  const client = useQueryClient();
  const scope = useScope();
  const [shown, setShown] = useState<{ readonly handle: string; readonly live: LiveEvents }>({
    handle,
    live: NOTHING_YET,
  });

  useEffect(() => {
    const source = new EventSource(liveEventsPath(handle, scope.api));
    let seen = 0;

    setShown({ handle, live: NOTHING_YET });

    source.addEventListener("run_event", (message: MessageEvent) => {
      const number = Number(message.lastEventId);
      const event = parsed(message.data);

      if (!Number.isInteger(number) || number <= seen) {
        return;
      }
      if (isRunEvent(event)) {
        seen = number;
        setShown((last) =>
          last.handle === handle
            ? { handle, live: { ...last.live, events: [...last.live.events, event] } }
            : last,
        );
      } else if (isBenchmarkEvent(event)) {
        seen = number;
        setShown((last) =>
          last.handle === handle
            ? { handle, live: { ...last.live, cases: [...last.live.cases, event] } }
            : last,
        );
      } else if (isOptimizationEvent(event)) {
        seen = number;
        setShown((last) =>
          last.handle === handle
            ? { handle, live: { ...last.live, generations: [...last.live.generations, event] } }
            : last,
        );
      }
    });

    source.addEventListener("end", (message: MessageEvent) => {
      const end = parsed(message.data);

      source.close();

      if (isLiveRun(end)) {
        client.setQueryData(scoped(scope, queryKeys.liveRun(handle)), end);
        setShown((last) =>
          last.handle === handle ? { handle, live: { ...last.live, end } } : last,
        );
      }
      void client.invalidateQueries({ queryKey: scoped(scope, queryKeys.liveList) });
      void client.invalidateQueries({ queryKey: scoped(scope, queryKeys.runs) });
      void client.invalidateQueries({ queryKey: scoped(scope, queryKeys.invocations) });
      void client.invalidateQueries({ queryKey: scoped(scope, queryKeys.executions) });
      void client.invalidateQueries({ queryKey: scoped(scope, queryKeys.experiments) });
    });

    source.addEventListener("error", () => {
      if (source.readyState === EventSource.CLOSED) {
        setShown((last) =>
          last.handle === handle && last.live.end === null
            ? { handle, live: { ...last.live, lost: true } }
            : last,
        );
      }
    });

    return () => {
      source.close();
    };
  }, [handle, client, scope]);

  return shown.handle === handle ? shown.live : NOTHING_YET;
}
