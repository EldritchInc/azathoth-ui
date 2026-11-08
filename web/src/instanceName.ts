import type { InstanceDescription } from "./api/types";

/** Returns the short name an instance goes by: its file, or its PostgreSQL database. */
export function instanceName(instance: InstanceDescription): string {
  if (instance.backend === "sqlite") {
    const parts = instance.database.split(/[\\/]/);

    return parts.at(-1) ?? instance.database;
  }

  try {
    const url = new URL(instance.database);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

    return database === "" ? url.hostname : database;
  } catch {
    return "PostgreSQL instance";
  }
}
