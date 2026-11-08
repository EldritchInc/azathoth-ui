/**
 * The editor's connection to its server, kept by asking for the instance.
 *
 * It asks once on mount, then every `interval` milliseconds and whenever the
 * window regains focus. When the server stops answering, the editor keeps
 * showing the last instance it saw, and says why it lost it.
 */

import { useEffect, useState } from "react";

import { ApiFailure, UNREACHABLE_MESSAGE, fetchInstance, type RequestOptions } from "./api/client";
import type { InstanceDescription } from "./api/types";

export const CHECK_INTERVAL = 10_000;

export type Connection =
  | { readonly state: "connecting" }
  | { readonly state: "connected"; readonly instance: InstanceDescription }
  | {
      readonly state: "lost";
      readonly failure: ApiFailure;
      readonly instance: InstanceDescription | null;
    };

export type InstanceLoader = (options?: RequestOptions) => Promise<InstanceDescription>;

function lastInstance(connection: Connection): InstanceDescription | null {
  return connection.state === "connecting" ? null : connection.instance;
}

/** Returns the editor's connection to its server, checked on a timer and on focus. */
export function useInstance(
  load: InstanceLoader = fetchInstance,
  interval: number = CHECK_INTERVAL,
): Connection {
  const [connection, setConnection] = useState<Connection>({ state: "connecting" });

  useEffect(() => {
    let active = true;
    let pending: AbortController | null = null;

    async function check(): Promise<void> {
      pending?.abort();
      const current = new AbortController();
      pending = current;

      try {
        const instance = await load({ signal: current.signal });

        if (active && !current.signal.aborted) {
          setConnection({ state: "connected", instance });
        }
      } catch (error) {
        if (!active || current.signal.aborted) {
          return;
        }
        const failure =
          error instanceof ApiFailure
            ? error
            : new ApiFailure("unreachable", UNREACHABLE_MESSAGE, null);

        setConnection((previous) => ({
          state: "lost",
          failure,
          instance: lastInstance(previous),
        }));
      }
    }

    const run = (): void => {
      void check();
    };

    run();
    const timer = window.setInterval(run, interval);
    window.addEventListener("focus", run);

    return () => {
      active = false;
      pending?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, [load, interval]);

  return connection;
}
