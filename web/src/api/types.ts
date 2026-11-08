/**
 * The JSON the editor's server answers with, mirroring `azathoth.api`'s models.
 */

/** Where an instance keeps its data. */
export type Backend = "sqlite" | "postgres";

/** Whether the service API's calls may still change in a minor release. */
export type ApiStability = "provisional" | "stable";

/** `GET /api/instance`: the instance the editor serves. */
export interface InstanceDescription {
  readonly database: string;
  readonly backend: Backend;
  readonly azathoth_version: string;
  readonly schema_version: number;
  readonly api_stability: ApiStability;
}

/** How the server answers any error under `/api`. */
export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Returns whether a value is the server's answer to an error. */
export function isErrorBody(value: unknown): value is ErrorBody {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string"
  );
}

/** Returns whether a value describes an instance the editor can show. */
export function isInstanceDescription(value: unknown): value is InstanceDescription {
  return (
    isRecord(value) &&
    typeof value.database === "string" &&
    (value.backend === "sqlite" || value.backend === "postgres") &&
    typeof value.azathoth_version === "string" &&
    typeof value.schema_version === "number" &&
    (value.api_stability === "provisional" || value.api_stability === "stable")
  );
}
