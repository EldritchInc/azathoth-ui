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

/** The providers an editor can be opened with. */
export type ProviderName = "openrouter" | "bedrock";

/** `GET /api/editor`: the editor, how its commands name its database, and its providers. */
export interface EditorDescription {
  readonly version: string;
  readonly shell: Shell;
  readonly command_prefix: string;
  readonly providers: readonly ProviderName[];
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

/** One model a provider serves now, as `azathoth.api` describes it. */
export interface ModelSummary {
  readonly identifier: string;
  readonly provider: string;
  readonly model: string;
  readonly display_name: string | null;
  readonly input_modalities: readonly string[];
  readonly output_modalities: readonly string[];
  readonly capabilities: readonly string[];
  readonly context_window_tokens: number | null;
  readonly maximum_output_tokens: number | null;
  readonly input_usd_per_million_tokens: number | null;
  readonly output_usd_per_million_tokens: number | null;
  /** Whether the local portfolio holds it. */
  readonly authorized: boolean;
  readonly command: string;
}

/** `GET /api/models`: every model the providers serve, and when they were asked. */
export interface ModelListing {
  readonly items: readonly ModelSummary[];
  readonly listed_at: string;
}

/** One model the local portfolio authorizes. */
export interface PortfolioEntry {
  readonly identifier: string;
  readonly provider: string;
  readonly model: string;
  readonly command: string;
}

/** One step of a production workflow that uses a model, and how. */
export interface ProductionStepUsage {
  readonly step_id: string;
  readonly role: string;
}

/** A production workflow that uses a model, and the steps that do. */
export interface ProductionDependent {
  readonly workflow_id: string;
  readonly workflow_name: string;
  readonly steps: readonly ProductionStepUsage[];
}

/** What removing a model from the local portfolio did. */
export interface PortfolioRemoval {
  readonly identifier: string;
  readonly dependents: readonly ProductionDependent[];
  readonly command: string;
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
    typeof value.command_prefix === "string" &&
    Array.isArray(value.providers) &&
    value.providers.every((provider) => provider === "openrouter" || provider === "bedrock")
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

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isTextList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Returns whether a value is one model a provider serves. */
export function isModelSummary(value: unknown): value is ModelSummary {
  return (
    isRecord(value) &&
    typeof value.identifier === "string" &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    (value.display_name === null || typeof value.display_name === "string") &&
    isTextList(value.input_modalities) &&
    isTextList(value.output_modalities) &&
    isTextList(value.capabilities) &&
    isNumberOrNull(value.context_window_tokens) &&
    isNumberOrNull(value.maximum_output_tokens) &&
    isNumberOrNull(value.input_usd_per_million_tokens) &&
    isNumberOrNull(value.output_usd_per_million_tokens) &&
    typeof value.authorized === "boolean" &&
    typeof value.command === "string"
  );
}

/** Returns whether a value is the server's list of models. */
export function isModelListing(value: unknown): value is ModelListing {
  return (
    isRecord(value) &&
    typeof value.listed_at === "string" &&
    itemsOf(value, isModelSummary) !== null
  );
}

/** Returns whether a value is one model the local portfolio authorizes. */
export function isPortfolioEntry(value: unknown): value is PortfolioEntry {
  return (
    isRecord(value) &&
    typeof value.identifier === "string" &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    typeof value.command === "string"
  );
}

/** Returns whether a value is a production workflow that uses a model. */
export function isProductionDependent(value: unknown): value is ProductionDependent {
  return (
    isRecord(value) &&
    typeof value.workflow_id === "string" &&
    typeof value.workflow_name === "string" &&
    Array.isArray(value.steps) &&
    value.steps.every(
      (step) => isRecord(step) && typeof step.step_id === "string" && typeof step.role === "string",
    )
  );
}

/** Returns whether a value is what removing a model from the local portfolio did. */
export function isPortfolioRemoval(value: unknown): value is PortfolioRemoval {
  return (
    isRecord(value) &&
    typeof value.identifier === "string" &&
    Array.isArray(value.dependents) &&
    value.dependents.every(isProductionDependent) &&
    typeof value.command === "string"
  );
}
