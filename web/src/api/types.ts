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

/** Why a run did not succeed, as `azathoth.api` says. */
export interface RunError {
  readonly code: string;
  readonly step_id: string | null;
  readonly exception_type: string | null;
  readonly message: string;
}

/** How one run ended, as `azathoth.api` returns it. */
export interface RunResult {
  readonly run_id: string;
  readonly workflow_id: string;
  readonly workflow_revision: number | null;
  readonly succeeded: boolean;
  readonly has_result: boolean;
  readonly result: unknown;
  readonly error: RunError | null;
  readonly warnings: readonly string[];
  readonly started_at: string;
  readonly completed_at: string;
  readonly command: string;
}

/** One kept run of a workflow, as its list of runs shows it. */
export interface RunSummary {
  readonly run_id: string;
  readonly workflow_id: string;
  readonly workflow_name: string;
  readonly workflow_revision: number | null;
  /** The production invocation the run executed, when it executed one. */
  readonly invocation_id: string | null;
  readonly succeeded: boolean;
  readonly error: RunError | null;
  readonly started_at: string;
  readonly completed_at: string;
  readonly command: string;
}

/** What a step's strategy measured as it ran; what it did not measure is null. */
export interface StepMetrics {
  readonly provider: string | null;
  readonly model: string | null;
  readonly prompt_tokens: number | null;
  readonly completion_tokens: number | null;
  readonly total_tokens: number | null;
  readonly latency_ms: number | null;
  readonly estimated_cost_usd: number | null;
}

/** One attempt of a step that failed. */
export interface StepFailure {
  readonly attempt: number;
  readonly exception_type: string;
  readonly message: string;
}

/** One step of a kept run, with what it produced and every attempt that failed. */
export interface RunStepDetail {
  readonly step_id: string;
  readonly status: StepStatus;
  readonly attempts: number;
  readonly confidence: number | null;
  readonly layer: number;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly strategy: string | null;
  readonly metrics: StepMetrics | null;
  readonly output: unknown;
  readonly values: Readonly<Record<string, unknown>>;
  readonly failures: readonly StepFailure[];
}

/** `GET /api/runs/{run_id}`: one kept run with its input, its result and each step. */
export interface RunDetail extends RunSummary {
  readonly has_result: boolean;
  readonly result: unknown;
  readonly has_input: boolean;
  readonly input: unknown;
  readonly resumes: number;
  readonly steps: readonly RunStepDetail[];
}

/** A run starting: the first event of every run. */
export interface RunStarted {
  readonly type: "run_started";
  readonly workflow_id: string;
}

/** One step starting, with what it says as it runs. */
export interface StepStarted {
  readonly type: "step_started";
  readonly step_id: string;
  readonly layer: number;
  readonly message: string | null;
}

/** How a step ended: executed, failed or skipped. */
export type StepStatus = "executed" | "failed" | "skipped";

/** One step finishing. */
export interface StepFinished {
  readonly type: "step_finished";
  readonly step_id: string;
  readonly layer: number;
  readonly status: StepStatus;
  readonly failure: string | null;
  readonly confidence: number | null;
}

/** The values one step added to the run's context, by name. */
export interface ContextChanged {
  readonly type: "context_changed";
  readonly step_id: string;
  readonly values: Readonly<Record<string, unknown>>;
}

/** A run finishing: the run Azathoth kept, and whether it succeeded. */
export interface RunFinished {
  readonly type: "run_finished";
  readonly run_id: string;
  readonly succeeded: boolean;
}

/** One event of a run, as the service API reports it. */
export type RunEvent = RunStarted | StepStarted | StepFinished | ContextChanged | RunFinished;

/** What a live run runs: a workflow, or one step tried alone. */
export type LiveKind = "run" | "step";

/** Where a live run is. */
export type LiveState = "running" | "finished" | "cancelled" | "refused";

/** `GET /api/live/{handle}`: one run started from the editor, and how it ended. */
export interface LiveRun {
  readonly handle: string;
  readonly kind: LiveKind;
  readonly workflow_id: string;
  readonly step_id: string | null;
  readonly state: LiveState;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly event_count: number;
  /** A run's `RunResult`, or a tried step's trial, once it has finished. */
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly error: { readonly code: string; readonly message: string } | null;
}

/** One reason Azathoth would refuse a workflow document, and where it is. */
export interface DocumentProblem {
  readonly message: string;
  /** The keys and indexes that lead to the value at fault; empty for the whole document. */
  readonly location: readonly (string | number)[];
  readonly step_id: string | null;
}

/** `POST /api/workflows/check`: whether Azathoth would import a document, and every reason not. */
export interface WorkflowCheck {
  readonly valid: boolean;
  readonly problems: readonly DocumentProblem[];
}

/** How a step runs: a prompt, a prompt rendered from the context, or a tool. */
export type StepKind = "prompt" | "context_prompt" | "tool";

/** Whether one step of a document could run here now, and on what. */
export interface StepReadiness {
  readonly step_id: string;
  readonly kind: StepKind;
  readonly ready: boolean;
  /** The models a prompt step could run on, in the order a run tries them. */
  readonly models: readonly string[];
  readonly tool_id: string | null;
  readonly tool_version: string | null;
  readonly tool_implementation_id: string | null;
  readonly problem: string | null;
}

/** `POST /api/workflows/readiness`: whether every step of a document could run here now. */
export interface WorkflowReadiness {
  readonly ready: boolean;
  readonly steps: readonly StepReadiness[];
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

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** Returns whether a value says why a run did not succeed. */
export function isRunError(value: unknown): value is RunError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    isTextOrNull(value.step_id) &&
    isTextOrNull(value.exception_type) &&
    typeof value.message === "string"
  );
}

/** Returns whether a value is how one run ended. */
export function isRunResult(value: unknown): value is RunResult {
  return (
    isRecord(value) &&
    typeof value.run_id === "string" &&
    typeof value.workflow_id === "string" &&
    (value.workflow_revision === null || isWholeNumber(value.workflow_revision)) &&
    typeof value.succeeded === "boolean" &&
    typeof value.has_result === "boolean" &&
    (value.error === null || isRunError(value.error)) &&
    isTextList(value.warnings) &&
    typeof value.started_at === "string" &&
    typeof value.completed_at === "string" &&
    typeof value.command === "string"
  );
}

const STEP_STATUSES: readonly unknown[] = ["executed", "failed", "skipped"];

/** Returns whether a value is one event of a run. */
export function isRunEvent(value: unknown): value is RunEvent {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case "run_started":
      return typeof value.workflow_id === "string";
    case "step_started":
      return (
        typeof value.step_id === "string" &&
        isWholeNumber(value.layer) &&
        isTextOrNull(value.message)
      );
    case "step_finished":
      return (
        typeof value.step_id === "string" &&
        isWholeNumber(value.layer) &&
        STEP_STATUSES.includes(value.status) &&
        isTextOrNull(value.failure) &&
        isNumberOrNull(value.confidence)
      );
    case "context_changed":
      return typeof value.step_id === "string" && isRecord(value.values);
    case "run_finished":
      return typeof value.run_id === "string" && typeof value.succeeded === "boolean";
    default:
      return false;
  }
}

const LIVE_STATES: readonly unknown[] = ["running", "finished", "cancelled", "refused"];

/** Returns whether a value is one run started from the editor. */
export function isLiveRun(value: unknown): value is LiveRun {
  return (
    isRecord(value) &&
    typeof value.handle === "string" &&
    (value.kind === "run" || value.kind === "step") &&
    typeof value.workflow_id === "string" &&
    isTextOrNull(value.step_id) &&
    LIVE_STATES.includes(value.state) &&
    typeof value.started_at === "string" &&
    isTextOrNull(value.finished_at) &&
    isWholeNumber(value.event_count) &&
    (value.result === null || isRecord(value.result)) &&
    (value.error === null ||
      (isRecord(value.error) &&
        typeof value.error.code === "string" &&
        typeof value.error.message === "string"))
  );
}

/** Returns whether a value is one kept run, as a list of runs shows it. */
export function isRunSummary(value: unknown): value is RunSummary {
  return (
    isRecord(value) &&
    typeof value.run_id === "string" &&
    typeof value.workflow_id === "string" &&
    typeof value.workflow_name === "string" &&
    (value.workflow_revision === null || isWholeNumber(value.workflow_revision)) &&
    isTextOrNull(value.invocation_id) &&
    typeof value.succeeded === "boolean" &&
    (value.error === null || isRunError(value.error)) &&
    typeof value.started_at === "string" &&
    typeof value.completed_at === "string" &&
    typeof value.command === "string"
  );
}

function isStepMetrics(value: unknown): value is StepMetrics {
  return (
    isRecord(value) &&
    isTextOrNull(value.provider) &&
    isTextOrNull(value.model) &&
    isNumberOrNull(value.prompt_tokens) &&
    isNumberOrNull(value.completion_tokens) &&
    isNumberOrNull(value.total_tokens) &&
    isNumberOrNull(value.latency_ms) &&
    isNumberOrNull(value.estimated_cost_usd)
  );
}

function isStepFailure(value: unknown): value is StepFailure {
  return (
    isRecord(value) &&
    isWholeNumber(value.attempt) &&
    typeof value.exception_type === "string" &&
    typeof value.message === "string"
  );
}

/** Returns whether a value is one step of a kept run. */
export function isRunStepDetail(value: unknown): value is RunStepDetail {
  return (
    isRecord(value) &&
    typeof value.step_id === "string" &&
    STEP_STATUSES.includes(value.status) &&
    isWholeNumber(value.attempts) &&
    isNumberOrNull(value.confidence) &&
    isWholeNumber(value.layer) &&
    isTextOrNull(value.started_at) &&
    isTextOrNull(value.completed_at) &&
    isTextOrNull(value.strategy) &&
    (value.metrics === null || isStepMetrics(value.metrics)) &&
    isRecord(value.values) &&
    Array.isArray(value.failures) &&
    value.failures.every(isStepFailure)
  );
}

/** Returns whether a value is one kept run with its steps. */
export function isRunDetail(value: unknown): value is RunDetail {
  return (
    isRunSummary(value) &&
    isRecord(value) &&
    typeof value.has_result === "boolean" &&
    typeof value.has_input === "boolean" &&
    isWholeNumber(value.resumes) &&
    Array.isArray(value.steps) &&
    value.steps.every(isRunStepDetail)
  );
}

function isDocumentProblem(value: unknown): value is DocumentProblem {
  return (
    isRecord(value) &&
    typeof value.message === "string" &&
    Array.isArray(value.location) &&
    value.location.every((key) => typeof key === "string" || isWholeNumber(key)) &&
    isTextOrNull(value.step_id)
  );
}

/** Returns whether a value is what Azathoth makes of a workflow document. */
export function isWorkflowCheck(value: unknown): value is WorkflowCheck {
  return (
    isRecord(value) &&
    typeof value.valid === "boolean" &&
    Array.isArray(value.problems) &&
    value.problems.every(isDocumentProblem)
  );
}

const STEP_KINDS: readonly unknown[] = ["prompt", "context_prompt", "tool"];

function isStepReadiness(value: unknown): value is StepReadiness {
  return (
    isRecord(value) &&
    typeof value.step_id === "string" &&
    STEP_KINDS.includes(value.kind) &&
    typeof value.ready === "boolean" &&
    isTextList(value.models) &&
    isTextOrNull(value.tool_id) &&
    isTextOrNull(value.tool_version) &&
    isTextOrNull(value.tool_implementation_id) &&
    isTextOrNull(value.problem)
  );
}

/** Returns whether a value says whether a document could run here now. */
export function isWorkflowReadiness(value: unknown): value is WorkflowReadiness {
  return (
    isRecord(value) &&
    typeof value.ready === "boolean" &&
    Array.isArray(value.steps) &&
    value.steps.every(isStepReadiness)
  );
}
