import type { InstanceDescription } from "../api/types";

/** An SQLite instance, as `GET /api/instance` describes it. */
export const SQLITE_INSTANCE: InstanceDescription = {
  database: "/Users/eris/Library/Application Support/Azathoth/ui.db",
  backend: "sqlite",
  azathoth_version: "1.4.0a1",
  schema_version: 2,
  api_stability: "provisional",
};

/** Returns a fetch that answers every request with one status and JSON body. */
export function answering(status: number, body: unknown): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}
