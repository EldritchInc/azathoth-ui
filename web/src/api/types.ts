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

/** The shells the editor writes commands for. */
export type Shell = "posix" | "powershell";

/** `GET /api/editor`: the editor, and how its commands name its database. */
export interface EditorDescription {
  readonly version: string;
  readonly shell: Shell;
  readonly command_prefix: string;
}

/** One revision of a component: its number, digest and when it was imported. */
export interface Revision {
  readonly number: number;
  readonly content_digest: string;
  readonly imported_at: string | null;
  readonly identical_to: number | null;
}

/** What every workflow, tool and benchmark summary carries. */
export interface Summary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly revision: Revision;
  readonly command: string;
}

/** A workflow at one revision. */
export type WorkflowSummary = Summary;

/** One version of a tool at one revision. */
export interface ToolSummary extends Summary {
  readonly implementation_count: number;
  readonly test_case_count: number;
}

/** A benchmark at one revision. */
export interface BenchmarkSummary extends Summary {
  readonly case_count: number;
}

/** One revision of a workflow, tool version or benchmark, with its document. */
export interface ComponentDetail extends Summary {
  readonly latest_number: number;
  readonly document: Readonly<Record<string, unknown>>;
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

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
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

/** Returns whether a value describes the editor. */
export function isEditorDescription(value: unknown): value is EditorDescription {
  return (
    isRecord(value) &&
    typeof value.version === "string" &&
    (value.shell === "posix" || value.shell === "powershell") &&
    typeof value.command_prefix === "string"
  );
}

/** Returns whether a value is one revision. */
export function isRevision(value: unknown): value is Revision {
  return (
    isRecord(value) &&
    isWholeNumber(value.number) &&
    typeof value.content_digest === "string" &&
    (value.imported_at === null || typeof value.imported_at === "string") &&
    (value.identical_to === null || isWholeNumber(value.identical_to))
  );
}

/** Returns whether a value is a summary of a workflow, tool or benchmark. */
export function isSummary(value: unknown): value is Summary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.version === "string" &&
    typeof value.description === "string" &&
    isRevision(value.revision) &&
    typeof value.command === "string"
  );
}

/** Returns whether a value summarizes a tool version. */
export function isToolSummary(value: unknown): value is ToolSummary {
  return (
    isSummary(value) &&
    isRecord(value) &&
    isWholeNumber(value.implementation_count) &&
    isWholeNumber(value.test_case_count)
  );
}

/** Returns whether a value summarizes a benchmark. */
export function isBenchmarkSummary(value: unknown): value is BenchmarkSummary {
  return isSummary(value) && isRecord(value) && isWholeNumber(value.case_count);
}

/** Returns whether a value is one revision of a component with its document. */
export function isComponentDetail(value: unknown): value is ComponentDetail {
  return (
    isSummary(value) &&
    isRecord(value) &&
    isWholeNumber(value.latest_number) &&
    isRecord(value.document)
  );
}

/** Returns the items of a list the server answered with, when each is what `guard` expects. */
export function itemsOf<T>(value: unknown, guard: (item: unknown) => item is T): T[] | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }
  const items: unknown[] = value.items;

  return items.every(guard) ? items : null;
}
