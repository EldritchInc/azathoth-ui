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

/** `GET /api/editor`: the editor, the shell it writes commands for, and its providers. */
export interface EditorDescription {
  readonly version: string;
  readonly shell: Shell;
  readonly providers: readonly ProviderName[];
}

/** `GET {base}/commands`: an instance's name, and what goes before a command for it (ADR 0009). */
export interface InstanceCommands {
  readonly instance: string;
  readonly prefix: string;
}

/** One revision of a component: its number, digest and when it was imported. */
export interface Revision {
  readonly number: number;
  readonly content_digest: string;
  readonly imported_at: string | null;
  readonly identical_to: number | null;
}

/** How sensitive data is, from public to restricted (Azathoth's ADR 0123). */
export type Sensitivity = "public" | "internal" | "restricted";

const SENSITIVITIES: readonly unknown[] = ["public", "internal", "restricted"];

/** Returns whether a value is one of Azathoth's labels. */
export function isSensitivity(value: unknown): value is Sensitivity {
  return SENSITIVITIES.includes(value);
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
  /** The most sensitive of its cases' labels, an unlabelled case counting as internal. */
  readonly sensitivity: Sensitivity;
}

/** One revision of a workflow, tool version or benchmark, with its document. */
export interface ComponentDetail extends Summary {
  readonly latest_number: number;
  readonly document: Readonly<Record<string, unknown>>;
}

/**
 * What importing one document did, as the editor reads Azathoth's import:
 * whether a revision was made, and the revision it is. A document identical
 * to the latest revision makes none, and is that revision.
 */
export interface ComponentImport {
  readonly created: boolean;
  readonly detail: ComponentDetail;
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

/** One answer of a model's declared policy: yes, no, or never declared. */
export type PolicyAnswer = "yes" | "no" | "unknown";

/** What was declared a model's provider does with data it is sent (Azathoth's ADR 0123). */
export interface DataPolicy {
  readonly retains_data: PolicyAnswer;
  readonly trains_on_data: PolicyAnswer;
}

/** One model the local portfolio authorizes, with its declared policy. */
export interface PortfolioEntry {
  readonly identifier: string;
  readonly provider: string;
  readonly model: string;
  readonly data_policy: DataPolicy;
  /** Whether it may be sent restricted input: only when declared to neither retain nor train. */
  readonly receives_restricted: boolean;
  readonly policy_declared_by: Author | null;
  readonly policy_declared_at: string | null;
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
  /** The label its input was given, internal when none was. */
  readonly sensitivity: Sensitivity;
  readonly started_at: string;
  readonly completed_at: string;
  readonly command: string;
  /** How a person last judged it, or none when nobody has (Azathoth's ADR 0129). */
  readonly feedback: FeedbackDisposition | null;
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

/**
 * What a live run runs: a workflow, one step tried alone, an invocation
 * through production, a workflow against a benchmark, workflows compared
 * against one, or a workflow optimized against one.
 */
export type LiveKind = "run" | "step" | "invocation" | "benchmark" | "comparison" | "optimization";

const LIVE_KINDS: readonly unknown[] = [
  "run",
  "step",
  "invocation",
  "benchmark",
  "comparison",
  "optimization",
];

/** Where a live run is. */
export type LiveState = "running" | "finished" | "cancelled" | "refused";

/** `GET /api/live/{handle}`: one run started from the editor, and how it ended. */
export interface LiveRun {
  readonly handle: string;
  readonly kind: LiveKind;
  readonly workflow_id: string;
  readonly step_id: string | null;
  /** An invocation's id, once it is known: from the start for a resume, from its outcome otherwise. */
  readonly invocation_id: string | null;
  /** The label it was given, or none. */
  readonly sensitivity: Sensitivity | null;
  /** The interrupted run it resumes from its journal, when it resumes one (ADR 0012). */
  readonly resumes_run_id: string | null;
  /** The benchmark it runs, for a benchmark run or a comparison (ADR 0012). */
  readonly benchmark_id: string | null;
  readonly state: LiveState;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly event_count: number;
  /**
   * A run's `RunResult`, a tried step's trial, an invocation's outcome, or a
   * benchmark's execution, once it has finished.
   */
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
    Array.isArray(value.providers) &&
    value.providers.every((provider) => provider === "openrouter" || provider === "bedrock")
  );
}

/** Returns whether a value is an instance's name and command prefix. */
export function isInstanceCommands(value: unknown): value is InstanceCommands {
  return isRecord(value) && typeof value.instance === "string" && typeof value.prefix === "string";
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
  return (
    isSummary(value) &&
    isRecord(value) &&
    isWholeNumber(value.case_count) &&
    isSensitivity(value.sensitivity)
  );
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

/** The key Azathoth's import holds its component under, for each kind. */
export const IMPORTED_KEYS = {
  workflows: "workflow",
  tools: "tool",
  benchmarks: "benchmark",
} as const;

/**
 * Returns what one import answer says, `{"created", "<kind>"}` as Azathoth
 * answers it, or `null` when it is not one.
 */
export function importOf(value: unknown, kind: keyof typeof IMPORTED_KEYS): ComponentImport | null {
  if (!isRecord(value) || typeof value.created !== "boolean") {
    return null;
  }
  const detail = value[IMPORTED_KEYS[kind]];

  return isComponentDetail(detail) ? { created: value.created, detail } : null;
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

const POLICY_ANSWERS: readonly unknown[] = ["yes", "no", "unknown"];

/** Returns whether a value is a model's declared policy. */
export function isDataPolicy(value: unknown): value is DataPolicy {
  return (
    isRecord(value) &&
    POLICY_ANSWERS.includes(value.retains_data) &&
    POLICY_ANSWERS.includes(value.trains_on_data)
  );
}

/** Returns whether a value is one model the local portfolio authorizes. */
export function isPortfolioEntry(value: unknown): value is PortfolioEntry {
  return (
    isRecord(value) &&
    typeof value.identifier === "string" &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    isDataPolicy(value.data_policy) &&
    typeof value.receives_restricted === "boolean" &&
    isAuthorOrNull(value.policy_declared_by) &&
    isTextOrNull(value.policy_declared_at) &&
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
    LIVE_KINDS.includes(value.kind) &&
    typeof value.workflow_id === "string" &&
    isTextOrNull(value.step_id) &&
    isTextOrNull(value.invocation_id) &&
    (value.sensitivity === null || isSensitivity(value.sensitivity)) &&
    isTextOrNull(value.resumes_run_id) &&
    isTextOrNull(value.benchmark_id) &&
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
    isSensitivity(value.sensitivity) &&
    typeof value.started_at === "string" &&
    typeof value.completed_at === "string" &&
    typeof value.command === "string" &&
    (value.feedback === null || isFeedbackDisposition(value.feedback))
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

/** A step tried alone (`POST /api/live/steps`), as its live run's result: what it did. */
export interface StepTrial {
  readonly step: RunStepDetail;
  /** What went wrong beside the step, such as an event callback that raised. */
  readonly warnings: readonly string[];
}

/** Returns whether a value is a tried step's trial. */
export function isStepTrial(value: unknown): value is StepTrial {
  return (
    isRecord(value) &&
    isRunStepDetail(value.step) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
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

/** A remote the editor's instance names: its URL, and the variable its token is read from. */
export interface NamedRemote {
  readonly name: string;
  readonly url: string;
  readonly token_variable: string;
  readonly added_at: string;
  /** Whether that variable is set in the editor's environment; its value never leaves it. */
  readonly token_set: boolean;
}

/** Returns whether a value is a remote the editor's instance names. */
export function isNamedRemote(value: unknown): value is NamedRemote {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    typeof value.token_variable === "string" &&
    typeof value.added_at === "string" &&
    typeof value.token_set === "boolean"
  );
}

/** What kind of document a lineage is. */
export type LineageKind = "workflow" | "tool" | "benchmark";

/** One workflow, tool version or benchmark, as revisions name it: a tool by its version too. */
export interface Lineage {
  readonly kind: LineageKind;
  readonly id: string;
  readonly version: string | null;
}

const LINEAGE_KINDS: readonly unknown[] = ["workflow", "tool", "benchmark"];

/** Returns whether a value is a lineage. */
export function isLineage(value: unknown): value is Lineage {
  return (
    isRecord(value) &&
    LINEAGE_KINDS.includes(value.kind) &&
    typeof value.id === "string" &&
    isTextOrNull(value.version)
  );
}

/** How a lineage here relates to the same lineage at a remote (Azathoth's ADR 0125). */
export type Relation = "in_sync" | "ahead" | "behind" | "diverged" | "local_only" | "remote_only";

export const RELATIONS: readonly Relation[] = [
  "in_sync",
  "ahead",
  "behind",
  "diverged",
  "local_only",
  "remote_only",
];

const RELATION_VALUES: readonly unknown[] = RELATIONS;

/** One component as each side holds it; `relation` is `null` when the remote was not reached. */
export interface ComponentStatus {
  readonly lineage: Lineage;
  readonly relation: Relation | null;
  readonly local_digest: string | null;
  readonly local_number: number | null;
  readonly remote_digest: string | null;
  readonly remote_number: number | null;
  readonly remote_production_digest: string | null;
}

/** Whether one model is authorized here, and at the remote, `null` when that is not known. */
export interface ModelStatus {
  readonly identifier: string;
  readonly authorized_locally: boolean;
  readonly authorized_remotely: boolean | null;
}

/** `POST /api/remotes/{name}/status`: what each side holds, and how each component relates. */
export interface RemoteStatus {
  readonly remote: string;
  readonly reachable: boolean;
  readonly components: readonly ComponentStatus[];
  readonly models: readonly ModelStatus[];
  readonly portfolio_synced_at: string | null;
}

function isNumberOrNullWhole(value: unknown): value is number | null {
  return value === null || isWholeNumber(value);
}

function isComponentStatus(value: unknown): value is ComponentStatus {
  return (
    isRecord(value) &&
    isLineage(value.lineage) &&
    (value.relation === null || RELATION_VALUES.includes(value.relation)) &&
    isTextOrNull(value.local_digest) &&
    isNumberOrNullWhole(value.local_number) &&
    isTextOrNull(value.remote_digest) &&
    isNumberOrNullWhole(value.remote_number) &&
    isTextOrNull(value.remote_production_digest)
  );
}

function isModelStatus(value: unknown): value is ModelStatus {
  return (
    isRecord(value) &&
    typeof value.identifier === "string" &&
    typeof value.authorized_locally === "boolean" &&
    (value.authorized_remotely === null || typeof value.authorized_remotely === "boolean")
  );
}

/** Returns whether a value is a remote's status. */
export function isRemoteStatus(value: unknown): value is RemoteStatus {
  return (
    isRecord(value) &&
    typeof value.remote === "string" &&
    typeof value.reachable === "boolean" &&
    Array.isArray(value.components) &&
    value.components.every(isComponentStatus) &&
    Array.isArray(value.models) &&
    value.models.every(isModelStatus) &&
    isTextOrNull(value.portfolio_synced_at)
  );
}

/** One revision a push or pull saved: its lineage, its digest, and its number where it was saved. */
export interface ReceivedRevision {
  readonly lineage: Lineage;
  readonly revision_digest: string;
  readonly number: number;
}

/** What a push sent, and what would stop it running at the remote (Azathoth's ADR 0125). */
export interface PushReport {
  readonly remote: string;
  readonly received: readonly ReceivedRevision[];
  readonly already_held: number;
  readonly content_sent: number;
  readonly unresolved: readonly string[];
  readonly warnings: readonly string[];
}

/** What a pull saved here, what it forked, and what it withheld as restricted. */
export interface PullReport {
  readonly remote: string;
  readonly received: readonly ReceivedRevision[];
  readonly already_held: number;
  readonly content_fetched: number;
  readonly forked: readonly Lineage[];
  readonly withheld: readonly Lineage[];
  readonly unresolved: readonly string[];
}

function isReceivedRevision(value: unknown): value is ReceivedRevision {
  return (
    isRecord(value) &&
    isLineage(value.lineage) &&
    typeof value.revision_digest === "string" &&
    isWholeNumber(value.number)
  );
}

function isReport(value: unknown): value is Record<string, unknown> & {
  readonly remote: string;
  readonly received: readonly ReceivedRevision[];
  readonly already_held: number;
  readonly unresolved: readonly string[];
} {
  return (
    isRecord(value) &&
    typeof value.remote === "string" &&
    Array.isArray(value.received) &&
    value.received.every(isReceivedRevision) &&
    isWholeNumber(value.already_held) &&
    isTextList(value.unresolved)
  );
}

/** Returns whether a value is a push's report. */
export function isPushReport(value: unknown): value is PushReport {
  return isReport(value) && isWholeNumber(value.content_sent) && isTextList(value.warnings);
}

/** Returns whether a value is a pull's report. */
export function isPullReport(value: unknown): value is PullReport {
  return (
    isReport(value) &&
    isWholeNumber(value.content_fetched) &&
    Array.isArray(value.forked) &&
    value.forked.every(isLineage) &&
    Array.isArray(value.withheld) &&
    value.withheld.every(isLineage)
  );
}

/** Who made a revision, or a production revision (Azathoth's ADR 0122). */
export interface Author {
  readonly name: string;
  readonly email: string | null;
}

function isAuthorOrNull(value: unknown): value is Author | null {
  return (
    value === null ||
    (isRecord(value) && typeof value.name === "string" && isTextOrNull(value.email))
  );
}

/** The models production runs one prompt step on, in the order it tries them. */
export interface ProductionStepModels {
  readonly step_id: string;
  readonly primary: string;
  readonly substitutes: readonly string[];
}

/** One production revision of a workflow: a promotion, or a rollback (Azathoth's ADR 0128). */
export interface ProductionRevisionSummary {
  readonly revision_id: string;
  readonly workflow_id: string;
  readonly workflow_revision: number | null;
  readonly created_at: string;
  readonly author: Author | null;
  /** The earlier production revision a rollback restored. */
  readonly restores: string | null;
  readonly active: boolean;
  readonly steps: readonly ProductionStepModels[];
}

/** What a workflow's production runs now. */
export interface ProductionState {
  readonly workflow_id: string;
  readonly workflow_name: string;
  readonly workflow_revision: number | null;
  /** The production revision that made it active, or none when it was set without one. */
  readonly revision: ProductionRevisionSummary | null;
  readonly steps: readonly ProductionStepModels[];
  readonly input_schema: unknown;
  readonly output_schema: unknown;
  readonly command: string;
}

/** How an invocation ended, or that it has not yet. */
export type InvocationStatus = "succeeded" | "failed" | "incomplete";

const INVOCATION_STATUSES: readonly unknown[] = ["succeeded", "failed", "incomplete"];

/** One invocation, as a workflow's list of them shows it. */
export interface InvocationSummary {
  readonly invocation_id: string;
  readonly workflow_id: string;
  readonly created_at: string;
  readonly status: InvocationStatus;
  readonly caller_metadata: Readonly<Record<string, unknown>>;
  readonly sensitivity: Sensitivity;
  readonly run_id: string | null;
  readonly command: string;
}

/** Why an invocation did not succeed: a production code, or an envelope's. */
export interface InvocationError {
  readonly code: string;
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** One step of an invocation's finished run. */
export interface InvocationRunStep {
  readonly step_id: string;
  readonly status: StepStatus;
  readonly attempts: number;
  readonly confidence: number | null;
}

/** The run behind an invocation: finished with its steps, or only its id and resumes. */
export interface InvocationRun {
  readonly run_id: string;
  readonly finished: boolean;
  readonly resumes: number;
  readonly workflow_revision: number | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly halted: boolean | null;
  readonly steps: readonly InvocationRunStep[];
}

/** `GET /api/invocations/{id}`: one invocation, with its input, outcome and run. */
export interface InvocationDetail {
  readonly invocation_id: string;
  readonly workflow_id: string;
  readonly created_at: string;
  readonly status: InvocationStatus;
  readonly result: unknown;
  readonly error: InvocationError | null;
  readonly idempotency_key: string | null;
  readonly input: unknown;
  readonly sensitivity: Sensitivity;
  readonly caller_metadata: Readonly<Record<string, unknown>>;
  readonly run: InvocationRun | null;
  readonly command: string;
}

/** How an invocation ended under its key: an invocation live run's result. */
export interface InvocationOutcome {
  readonly status: InvocationStatus | "rejected";
  readonly replayed: boolean;
  readonly idempotency_key: string;
  readonly invocation_id: string | null;
  readonly result: unknown;
  readonly error: InvocationError | null;
  readonly warnings: readonly string[];
  readonly command: string | null;
}

function isProductionStepModels(value: unknown): value is ProductionStepModels {
  return (
    isRecord(value) &&
    typeof value.step_id === "string" &&
    typeof value.primary === "string" &&
    isTextList(value.substitutes)
  );
}

function isStepModelsList(value: unknown): value is readonly ProductionStepModels[] {
  return Array.isArray(value) && value.every(isProductionStepModels);
}

/** Returns whether a value is one production revision. */
export function isProductionRevisionSummary(value: unknown): value is ProductionRevisionSummary {
  return (
    isRecord(value) &&
    typeof value.revision_id === "string" &&
    typeof value.workflow_id === "string" &&
    isNumberOrNullWhole(value.workflow_revision) &&
    typeof value.created_at === "string" &&
    isAuthorOrNull(value.author) &&
    isTextOrNull(value.restores) &&
    typeof value.active === "boolean" &&
    isStepModelsList(value.steps)
  );
}

/** Returns whether a value is what a workflow's production runs now. */
export function isProductionState(value: unknown): value is ProductionState {
  return (
    isRecord(value) &&
    typeof value.workflow_id === "string" &&
    typeof value.workflow_name === "string" &&
    isNumberOrNullWhole(value.workflow_revision) &&
    (value.revision === null || isProductionRevisionSummary(value.revision)) &&
    isStepModelsList(value.steps) &&
    typeof value.command === "string"
  );
}

/** Returns whether a value is `GET /api/workflows/{id}/production`'s answer. */
export function isProductionAnswer(
  value: unknown,
): value is { readonly production: ProductionState | null } {
  return isRecord(value) && (value.production === null || isProductionState(value.production));
}

/** Returns whether a value is one invocation, as a list shows it. */
export function isInvocationSummary(value: unknown): value is InvocationSummary {
  return (
    isRecord(value) &&
    typeof value.invocation_id === "string" &&
    typeof value.workflow_id === "string" &&
    typeof value.created_at === "string" &&
    INVOCATION_STATUSES.includes(value.status) &&
    isRecord(value.caller_metadata) &&
    SENSITIVITIES.includes(value.sensitivity) &&
    isTextOrNull(value.run_id) &&
    typeof value.command === "string"
  );
}

function isInvocationErrorOrNull(value: unknown): value is InvocationError | null {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.code === "string" &&
      typeof value.message === "string" &&
      isRecord(value.metadata))
  );
}

function isInvocationRun(value: unknown): value is InvocationRun {
  return (
    isRecord(value) &&
    typeof value.run_id === "string" &&
    typeof value.finished === "boolean" &&
    isWholeNumber(value.resumes) &&
    isNumberOrNullWhole(value.workflow_revision) &&
    isTextOrNull(value.started_at) &&
    isTextOrNull(value.completed_at) &&
    (value.halted === null || typeof value.halted === "boolean") &&
    Array.isArray(value.steps) &&
    value.steps.every(
      (step) =>
        isRecord(step) &&
        typeof step.step_id === "string" &&
        STEP_STATUSES.includes(step.status) &&
        isWholeNumber(step.attempts) &&
        isNumberOrNull(step.confidence),
    )
  );
}

/** Returns whether a value is one invocation, with its input, outcome and run. */
export function isInvocationDetail(value: unknown): value is InvocationDetail {
  return (
    isRecord(value) &&
    typeof value.invocation_id === "string" &&
    typeof value.workflow_id === "string" &&
    typeof value.created_at === "string" &&
    INVOCATION_STATUSES.includes(value.status) &&
    isInvocationErrorOrNull(value.error) &&
    isTextOrNull(value.idempotency_key) &&
    SENSITIVITIES.includes(value.sensitivity) &&
    isRecord(value.caller_metadata) &&
    (value.run === null || isInvocationRun(value.run)) &&
    typeof value.command === "string"
  );
}

/** Returns whether a value is how an invocation ended under its key. */
export function isInvocationOutcome(value: unknown): value is InvocationOutcome {
  return (
    isRecord(value) &&
    (INVOCATION_STATUSES.includes(value.status) || value.status === "rejected") &&
    typeof value.replayed === "boolean" &&
    typeof value.idempotency_key === "string" &&
    isTextOrNull(value.invocation_id) &&
    isInvocationErrorOrNull(value.error) &&
    isTextList(value.warnings) &&
    isTextOrNull(value.command)
  );
}

/** How a person judged a run (Azathoth's ADR 0068). */
export type FeedbackDisposition = "good" | "bad";

const FEEDBACK_DISPOSITIONS: readonly unknown[] = ["good", "bad"];

/** Returns whether a value is how a person judged a run. */
export function isFeedbackDisposition(value: unknown): value is FeedbackDisposition {
  return FEEDBACK_DISPOSITIONS.includes(value);
}

/** One model of the rotation that judges semantic cases, in its place (Azathoth's ADR 0129). */
export interface JudgeSummary {
  readonly identifier: string;
  readonly provider: string;
  readonly model: string;
  /** Its place in the rotation, from 1: the order judges are tried. */
  readonly position: number;
  /** Whether the portfolio still authorizes it; one that no longer does is never asked to judge. */
  readonly authorized: boolean;
  readonly command: string;
}

/** One immutable judgment of a kept run. */
export interface RunFeedback {
  readonly feedback_id: string;
  readonly run_id: string;
  readonly disposition: FeedbackDisposition;
  /** Why the run was judged so; a bad judgment always has one. */
  readonly reason: string | null;
  /** What the run should have produced, given only with a bad judgment. */
  readonly corrected_output: unknown;
  readonly created_at: string;
  readonly command: string;
}

/** A run's verified citations, as a W3C Web Annotation collection (Azathoth's ADR 0117). */
export interface Annotations {
  /** The run or invocation asked about. */
  readonly subject_id: string;
  /** The run whose cited steps kept the citations: an invocation's run. */
  readonly run_id: string;
  /** The collection, exactly as `azathoth run annotations` prints it. */
  readonly collection: Readonly<Record<string, unknown>>;
  /** Its annotations, in the order the run's steps checked them. */
  readonly items: readonly Readonly<Record<string, unknown>>[];
  readonly command: string;
}

/** How a child run ended, or that no finished run is kept for it yet. */
export type ChildStatus = "succeeded" | "failed" | "unfinished";

const CHILD_STATUSES: readonly unknown[] = ["succeeded", "failed", "unfinished"];

/** One run a step of another run started, and how it ended. */
export interface RunChildSummary {
  readonly child_run_id: string;
  readonly child_workflow_id: string;
  /** The invocation the child executed, when it was started by invoking one. */
  readonly child_invocation_id: string | null;
  readonly parent_run_id: string;
  readonly parent_step_id: string;
  /** The attempt of that step that started it, from 1. */
  readonly parent_attempt: number;
  /** How far below the run that started the whole tree it is: 1 for a child. */
  readonly depth: number;
  readonly started_at: string;
  readonly status: ChildStatus;
  /** The command that shows the child, once it finished. */
  readonly command: string | null;
}

/** A run that started and never finished, as its journal records it. */
export interface InterruptedRun {
  readonly run_id: string;
  readonly workflow_id: string;
  /** The workflow's name in the revision the run started from. */
  readonly workflow_name: string;
  readonly workflow_revision: number | null;
  /** The production invocation it executes, when it executes one. */
  readonly invocation_id: string | null;
  readonly started_at: string;
  /** When its journal last recorded anything: how far it got. */
  readonly last_recorded_at: string;
  /** How often it was resumed and stopped again. */
  readonly resumes: number;
  /** The command that resumes it: its invocation's, when it has one. */
  readonly command: string;
}

/** Returns whether a value is one judge of the rotation. */
export function isJudgeSummary(value: unknown): value is JudgeSummary {
  return (
    isRecord(value) &&
    typeof value.identifier === "string" &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    isWholeNumber(value.position) &&
    value.position >= 1 &&
    typeof value.authorized === "boolean" &&
    typeof value.command === "string"
  );
}

/** Returns whether a value is one judgment of a run. */
export function isRunFeedback(value: unknown): value is RunFeedback {
  return (
    isRecord(value) &&
    typeof value.feedback_id === "string" &&
    typeof value.run_id === "string" &&
    isFeedbackDisposition(value.disposition) &&
    isTextOrNull(value.reason) &&
    "corrected_output" in value &&
    typeof value.created_at === "string" &&
    typeof value.command === "string"
  );
}

/** Returns whether a value is a run's citations. */
export function isAnnotations(value: unknown): value is Annotations {
  return (
    isRecord(value) &&
    typeof value.subject_id === "string" &&
    typeof value.run_id === "string" &&
    isRecord(value.collection) &&
    Array.isArray(value.items) &&
    value.items.every(isRecord) &&
    typeof value.command === "string"
  );
}

/** Returns whether a value is one run another run started. */
export function isRunChildSummary(value: unknown): value is RunChildSummary {
  return (
    isRecord(value) &&
    typeof value.child_run_id === "string" &&
    typeof value.child_workflow_id === "string" &&
    isTextOrNull(value.child_invocation_id) &&
    typeof value.parent_run_id === "string" &&
    typeof value.parent_step_id === "string" &&
    isWholeNumber(value.parent_attempt) &&
    value.parent_attempt >= 1 &&
    isWholeNumber(value.depth) &&
    value.depth >= 1 &&
    typeof value.started_at === "string" &&
    CHILD_STATUSES.includes(value.status) &&
    isTextOrNull(value.command)
  );
}

/** Returns whether a value is one interrupted run. */
export function isInterruptedRun(value: unknown): value is InterruptedRun {
  return (
    isRecord(value) &&
    typeof value.run_id === "string" &&
    typeof value.workflow_id === "string" &&
    typeof value.workflow_name === "string" &&
    isNumberOrNullWhole(value.workflow_revision) &&
    isTextOrNull(value.invocation_id) &&
    typeof value.started_at === "string" &&
    typeof value.last_recorded_at === "string" &&
    isWholeNumber(value.resumes) &&
    value.resumes >= 0 &&
    typeof value.command === "string"
  );
}

/** How a case's run is compared with what it expects (Azathoth's ADR 0130). */
export type CaseComparison = "exact" | "normalized" | "semantic" | "schema";

/** Every comparison, in the order the editor offers them. */
export const CASE_COMPARISONS: readonly CaseComparison[] = [
  "exact",
  "normalized",
  "semantic",
  "schema",
];

/** Returns whether a value is one of the comparisons. */
export function isCaseComparison(value: unknown): value is CaseComparison {
  return (CASE_COMPARISONS as readonly unknown[]).includes(value);
}

/** What a case was made from: a kept run, a file, or JSON. */
export type CaseSource = "run" | "file" | "json";

const CASE_SOURCES: readonly unknown[] = ["run", "file", "json"];

/** One segment of one source that a case's run must cite. */
export interface CitedSegment {
  readonly source: string;
  readonly segment: string;
}

/** What a case's run must cite, and whether a check that did not verify fails it. */
export interface CaseCitations {
  readonly require: readonly CitedSegment[];
  readonly on_unverified: "fail" | "ignore";
}

/** One case of a benchmark at one revision, as its list shows it. */
export interface BenchmarkCaseSummary {
  readonly benchmark_id: string;
  /** The revision it was read from. */
  readonly revision: number;
  readonly case_id: string;
  /** What it expects, in words. */
  readonly description: string;
  readonly comparison: CaseComparison;
  /** Its input's label, internal when it has none. */
  readonly sensitivity: Sensitivity;
  readonly source: CaseSource;
  /** The kept run it was made from, when it was made from one. */
  readonly source_run_id: string | null;
  /** Whether it names what its run must cite. */
  readonly cited: boolean;
  readonly command: string;
}

/** One case, with its input, what it expects, and where they came from. */
export interface BenchmarkCaseDetail extends BenchmarkCaseSummary {
  /** What its run is given: the content's handle for a PDF or an image. */
  readonly input: unknown;
  readonly input_provenance: Readonly<Record<string, unknown>> | null;
  readonly expected: unknown;
  readonly citations: CaseCitations | null;
  /** The judgment whose corrected output it expects, when it was made from one. */
  readonly source_feedback_id: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** What adding, editing or removing a case answers: the case, and the revision it made. */
export interface BenchmarkCaseChange {
  readonly case: BenchmarkCaseDetail;
  readonly benchmark: BenchmarkSummary;
}

/** Whether an execution ran one workflow against a benchmark, or compared several. */
export type ExecutionKind = "run" | "compare";

const EXECUTION_KINDS: readonly unknown[] = ["run", "compare"];

/** What a comparison scored latency and cost against. */
export interface ScoringPolicy {
  readonly target_latency_seconds: number;
  readonly target_cost_usd: number;
}

/** How a comparison scored one workflow, from 0 to 1. */
export interface CandidateScorecard {
  readonly quality_score: number;
  readonly reliability_score: number;
  readonly latency_score: number;
  readonly cost_score: number;
  /** How well its runs cited, or none when no case named citations. */
  readonly citation_score: number | null;
  readonly overall_score: number;
  readonly rationale: string;
}

/** One workflow's pass count for one comparison. */
export interface ComparisonTally {
  readonly comparison: CaseComparison;
  readonly cases_run: number;
  readonly cases_passed: number;
}

/** How one case went for one workflow. */
export interface ExecutionCaseResult {
  readonly case_id: string;
  readonly comparison: CaseComparison;
  /** The run the case ran as, kept as any run is. */
  readonly run_id: string;
  readonly evaluation_id: string;
  readonly passed: boolean;
  /** Whether the run failed without the declared result, which fails the case. */
  readonly run_failure: boolean;
  /** The evaluation's score, or none once it is no longer kept. */
  readonly score: number | null;
  readonly reason: string | null;
  readonly judge_calls: number;
  /** What judging it cost, which is never charged to the workflow. */
  readonly judge_cost_usd: number;
}

/** One workflow an execution ran, as its benchmark's list shows it. */
export interface ExecutionCandidateSummary {
  readonly candidate_id: string;
  readonly workflow_id: string;
  readonly workflow_name: string;
  readonly workflow_revision: number | null;
  readonly cases_run: number;
  readonly cases_passed: number;
  /** The fraction of its cases that passed. */
  readonly accuracy: number;
  /** Its overall score in a comparison; a run is not scored. */
  readonly overall_score: number | null;
}

/** One workflow an execution ran, with every case. */
export interface ExecutionCandidate extends ExecutionCandidateSummary {
  readonly strategy_ids: readonly string[];
  readonly run_failures: number;
  readonly judged_semantically: boolean;
  readonly judge_calls: number;
  readonly judge_cost_usd: number;
  readonly tallies: readonly ComparisonTally[];
  readonly scorecard: CandidateScorecard | null;
  /** Every case, in the order the benchmark holds them. */
  readonly cases: readonly ExecutionCaseResult[];
}

/** What every execution carries. */
interface ExecutionHeader {
  readonly execution_id: string;
  readonly benchmark_id: string;
  readonly benchmark_revision: number | null;
  readonly benchmark_digest: string | null;
  readonly kind: ExecutionKind;
  readonly recorded_at: string;
  /** The label of the benchmark it ran. */
  readonly sensitivity: Sensitivity;
  readonly case_count: number;
  readonly command: string;
}

/** One saved run or comparison of a benchmark, as its list shows it. */
export interface BenchmarkExecutionSummary extends ExecutionHeader {
  /** Every workflow it ran, best first in a comparison. */
  readonly candidates: readonly ExecutionCandidateSummary[];
}

/** One saved run or comparison of a benchmark, with every workflow and case. */
export interface BenchmarkExecutionDetail extends ExecutionHeader {
  /** What a comparison scored against; none for a run. */
  readonly scoring_policy: ScoringPolicy | null;
  readonly candidates: readonly ExecutionCandidate[];
}

/** One case of a benchmark starting, as one workflow. */
export interface CaseStarted {
  readonly type: "case_started";
  readonly case_id: string;
  readonly workflow_id: string;
  /** Its place among the workflow's cases, from 1. */
  readonly index: number;
  readonly total: number;
}

/** One case of a benchmark ran as one workflow, and was judged. */
export interface CaseFinished {
  readonly type: "case_finished";
  readonly case_id: string;
  readonly workflow_id: string;
  readonly run_id: string;
  readonly passed: boolean;
  readonly score: number;
}

/** One event of a benchmark run or a comparison. */
export type BenchmarkEvent = CaseStarted | CaseFinished;

/** One event of any live run. */
export type LiveEvent = RunEvent | BenchmarkEvent | OptimizationEvent;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
  return isWholeNumber(value) && value >= 0;
}

/** Returns whether a value is what a case's run must cite. */
export function isCaseCitations(value: unknown): value is CaseCitations {
  return (
    isRecord(value) &&
    Array.isArray(value.require) &&
    value.require.every(
      (cited) =>
        isRecord(cited) && typeof cited.source === "string" && typeof cited.segment === "string",
    ) &&
    (value.on_unverified === "fail" || value.on_unverified === "ignore")
  );
}

/** Returns whether a value is one case, as a list of cases shows it. */
export function isBenchmarkCaseSummary(value: unknown): value is BenchmarkCaseSummary {
  return (
    isRecord(value) &&
    typeof value.benchmark_id === "string" &&
    isWholeNumber(value.revision) &&
    value.revision >= 1 &&
    typeof value.case_id === "string" &&
    typeof value.description === "string" &&
    isCaseComparison(value.comparison) &&
    isSensitivity(value.sensitivity) &&
    CASE_SOURCES.includes(value.source) &&
    isTextOrNull(value.source_run_id) &&
    typeof value.cited === "boolean" &&
    typeof value.command === "string"
  );
}

/** Returns whether a value is one case, with its input and what it expects. */
export function isBenchmarkCaseDetail(value: unknown): value is BenchmarkCaseDetail {
  return (
    isBenchmarkCaseSummary(value) &&
    isRecord(value) &&
    "input" in value &&
    value.input !== undefined &&
    (value.input_provenance === null || isRecord(value.input_provenance)) &&
    "expected" in value &&
    value.expected !== undefined &&
    (value.citations === null || isCaseCitations(value.citations)) &&
    isTextOrNull(value.source_feedback_id) &&
    isRecord(value.metadata)
  );
}

/** Returns whether a value is what adding, editing or removing a case answers. */
export function isBenchmarkCaseChange(value: unknown): value is BenchmarkCaseChange {
  return (
    isRecord(value) && isBenchmarkCaseDetail(value.case) && isBenchmarkSummary(value.benchmark)
  );
}

function isExecutionHeader(value: unknown): value is ExecutionHeader {
  return (
    isRecord(value) &&
    typeof value.execution_id === "string" &&
    typeof value.benchmark_id === "string" &&
    isNumberOrNullWhole(value.benchmark_revision) &&
    isTextOrNull(value.benchmark_digest) &&
    EXECUTION_KINDS.includes(value.kind) &&
    typeof value.recorded_at === "string" &&
    isSensitivity(value.sensitivity) &&
    isCount(value.case_count) &&
    typeof value.command === "string"
  );
}

function isExecutionCandidateSummary(value: unknown): value is ExecutionCandidateSummary {
  return (
    isRecord(value) &&
    typeof value.candidate_id === "string" &&
    typeof value.workflow_id === "string" &&
    typeof value.workflow_name === "string" &&
    isNumberOrNullWhole(value.workflow_revision) &&
    isCount(value.cases_run) &&
    isCount(value.cases_passed) &&
    isNumber(value.accuracy) &&
    (value.overall_score === null || isNumber(value.overall_score))
  );
}

function isScorecard(value: unknown): value is CandidateScorecard {
  return (
    isRecord(value) &&
    isNumber(value.quality_score) &&
    isNumber(value.reliability_score) &&
    isNumber(value.latency_score) &&
    isNumber(value.cost_score) &&
    (value.citation_score === null || isNumber(value.citation_score)) &&
    isNumber(value.overall_score) &&
    typeof value.rationale === "string"
  );
}

function isCaseResult(value: unknown): value is ExecutionCaseResult {
  return (
    isRecord(value) &&
    typeof value.case_id === "string" &&
    isCaseComparison(value.comparison) &&
    typeof value.run_id === "string" &&
    typeof value.evaluation_id === "string" &&
    typeof value.passed === "boolean" &&
    typeof value.run_failure === "boolean" &&
    (value.score === null || isNumber(value.score)) &&
    isTextOrNull(value.reason) &&
    isCount(value.judge_calls) &&
    isNumber(value.judge_cost_usd)
  );
}

function isExecutionCandidate(value: unknown): value is ExecutionCandidate {
  return (
    isExecutionCandidateSummary(value) &&
    isRecord(value) &&
    isTextList(value.strategy_ids) &&
    isCount(value.run_failures) &&
    typeof value.judged_semantically === "boolean" &&
    isCount(value.judge_calls) &&
    isNumber(value.judge_cost_usd) &&
    Array.isArray(value.tallies) &&
    value.tallies.every(
      (tally) =>
        isRecord(tally) &&
        isCaseComparison(tally.comparison) &&
        isCount(tally.cases_run) &&
        isCount(tally.cases_passed),
    ) &&
    (value.scorecard === null || isScorecard(value.scorecard)) &&
    Array.isArray(value.cases) &&
    value.cases.every(isCaseResult)
  );
}

/** Returns whether a value is one execution, as its benchmark's list shows it. */
export function isBenchmarkExecutionSummary(value: unknown): value is BenchmarkExecutionSummary {
  return (
    isExecutionHeader(value) &&
    isRecord(value) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isExecutionCandidateSummary)
  );
}

/** Returns whether a value is one execution, with every workflow and case. */
export function isBenchmarkExecutionDetail(value: unknown): value is BenchmarkExecutionDetail {
  return (
    isExecutionHeader(value) &&
    isRecord(value) &&
    (value.scoring_policy === null ||
      (isRecord(value.scoring_policy) &&
        isNumber(value.scoring_policy.target_latency_seconds) &&
        isNumber(value.scoring_policy.target_cost_usd))) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isExecutionCandidate)
  );
}

/** Returns whether a value is one event of a benchmark run or a comparison. */
export function isBenchmarkEvent(value: unknown): value is BenchmarkEvent {
  if (!isRecord(value) || typeof value.case_id !== "string") {
    return false;
  }
  switch (value.type) {
    case "case_started":
      return (
        typeof value.workflow_id === "string" &&
        isWholeNumber(value.index) &&
        value.index >= 1 &&
        isWholeNumber(value.total) &&
        value.total >= 1
      );
    case "case_finished":
      return (
        typeof value.workflow_id === "string" &&
        typeof value.run_id === "string" &&
        typeof value.passed === "boolean" &&
        isNumber(value.score)
      );
    default:
      return false;
  }
}

/** What every view of one recorded optimization experiment carries (Azathoth's ADR 0131). */
interface ExperimentHeader {
  readonly experiment_id: string;
  readonly workflow_id: string;
  readonly workflow_name: string;
  readonly recorded_at: string;
  /** The benchmark its candidates ran, or none from before benchmark optimization. */
  readonly benchmark_id: string | null;
  readonly benchmark_digest: string | null;
  readonly benchmark_revision: number | null;
  readonly sensitivity: Sensitivity;
  readonly candidate_count: number;
  readonly case_count: number;
  readonly winner_observation_id: string;
  readonly command: string;
}

/** One experiment, as a workflow's list shows it. */
export interface ExperimentSummary extends ExperimentHeader {
  readonly winner_score: number;
}

/** How one case went for one candidate of an experiment. */
export interface ExperimentCase {
  readonly case_id: string | null;
  readonly run_id: string;
  readonly evaluation_id: string;
  readonly passed: boolean | null;
  readonly judge_calls: number;
  readonly judge_cost_usd: number;
}

/** One step of a candidate, with the model its first case's run ran it on. */
export interface ExperimentStep {
  readonly step_id: string;
  readonly strategy_id: string | null;
  readonly model: string | null;
}

/** One candidate of an experiment, in its place in the ranking. */
export interface ExperimentCandidate {
  readonly observation_id: string;
  /** From 1 for the winner. */
  readonly rank: number;
  readonly workflow_revision: number | null;
  readonly strategy_ids: readonly string[];
  /** Empty once its first case's run is no longer kept. */
  readonly steps: readonly ExperimentStep[];
  readonly cases_run: number;
  readonly cases_passed: number | null;
  readonly scorecard: CandidateScorecard;
  readonly judge_calls: number;
  readonly judge_cost_usd: number;
  readonly cases: readonly ExperimentCase[];
}

/** One experiment, with every candidate, best first. */
export interface ExperimentDetail extends ExperimentHeader {
  readonly candidates: readonly ExperimentCandidate[];
}

/** What an experiment's winner is compared against. */
export type ComparisonBaseline = "production" | "configured";

/** One step of the winner and of the baseline, each with its model. */
export interface ComparedStep {
  readonly step_id: string;
  readonly winner_model: string | null;
  readonly baseline_model: string | null;
  readonly differs: boolean;
}

/** One case, as the winner and the baseline did on it. */
export interface ComparedCase {
  readonly case_id: string | null;
  readonly winner_passed: boolean | null;
  readonly baseline_passed: boolean | null;
  readonly winner_score: number | null;
  readonly baseline_score: number | null;
}

/** What one candidate's kept case runs cost and took, each the mean. */
export interface RunCosts {
  readonly runs: number;
  readonly cost_usd: number | null;
  readonly latency_seconds: number | null;
}

/** What the winner saves per run on the benchmark, measured; negative is a cost. */
export interface Savings {
  readonly cost_usd: number | null;
  readonly cost_percent: number | null;
  readonly latency_seconds: number | null;
  readonly latency_percent: number | null;
}

/** The saving per run over production's recent invocations: a projection, never a measurement. */
export interface SavingsProjection {
  readonly window_days: number;
  readonly since: string;
  readonly invocations: number;
  readonly cost_usd: number | null;
  readonly latency_seconds: number | null;
}

/** An experiment's winner beside what promoting it would replace. */
export interface ExperimentComparison {
  readonly experiment_id: string;
  readonly workflow_id: string;
  /** None when there is nothing to compare, with the reason why. */
  readonly baseline: ComparisonBaseline | null;
  readonly reason: string | null;
  readonly winner: ExperimentCandidate;
  readonly baseline_candidate: ExperimentCandidate | null;
  readonly steps: readonly ComparedStep[];
  readonly cases: readonly ComparedCase[];
  readonly winner_runs: RunCosts;
  readonly baseline_runs: RunCosts | null;
  /** The `azathoth workflow promote` command that promotes the winner. */
  readonly command: string;
  readonly savings: Savings | null;
  readonly projection: SavingsProjection | null;
}

/** Whether an experiment's winner can still be promoted, and why not. */
export interface Promotability {
  readonly experiment_id: string;
  readonly workflow_id: string;
  readonly promotable: boolean;
  /** The code promoting would refuse with, or none. */
  readonly code: string | null;
  readonly reason: string | null;
  readonly command: string;
}

/** One generation of a session: the experiment that measured it, and what it proposed. */
export interface OptimizationGeneration {
  readonly generation: number;
  readonly experiment_id: string;
  readonly winner_strategy_ids: readonly string[];
  readonly winner_score: number;
  readonly proposed: number;
}

/** What one optimization session measured, and which experiment holds its winner. */
export interface OptimizationSummary {
  readonly workflow_id: string;
  readonly benchmark_id: string;
  readonly generations: readonly OptimizationGeneration[];
  readonly final_experiment_id: string | null;
  /** Why the final evaluation did not run, or none when it ran. */
  readonly final_skipped: string | null;
  readonly winning_experiment_id: string;
  readonly judge_calls: number;
  readonly judge_cost_usd: number;
  readonly command: string;
}

/** One generation of a session is about to run its candidates. */
export interface GenerationStarted {
  readonly type: "generation_started";
  readonly generation: number;
  readonly candidates: number;
  /** Whether it is the final evaluation of the last generation's proposals. */
  readonly final: boolean;
}

/** One candidate of a generation ran every case, and was scored. */
export interface CandidateFinished {
  readonly type: "candidate_finished";
  readonly generation: number;
  readonly workflow_id: string;
  readonly strategy_ids: readonly string[];
  readonly cases_run: number;
  readonly cases_passed: number;
  readonly overall_score: number;
}

/** One generation's experiment was recorded, and its winner chosen. */
export interface GenerationFinished {
  readonly type: "generation_finished";
  readonly generation: number;
  readonly experiment_id: string;
  readonly winner_strategy_ids: readonly string[];
  readonly winner_score: number;
  /** How many candidates it proposes next; none after the final evaluation. */
  readonly proposed: number;
}

/** One event of an optimization. */
export type OptimizationEvent = GenerationStarted | CandidateFinished | GenerationFinished;

function isRank(value: unknown): value is number {
  return isWholeNumber(value) && value >= 1;
}

function isNumberOrNullFinite(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function isBooleanOrNull(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function isExperimentHeader(value: unknown): value is ExperimentHeader {
  return (
    isRecord(value) &&
    typeof value.experiment_id === "string" &&
    typeof value.workflow_id === "string" &&
    typeof value.workflow_name === "string" &&
    typeof value.recorded_at === "string" &&
    isTextOrNull(value.benchmark_id) &&
    isTextOrNull(value.benchmark_digest) &&
    isNumberOrNullWhole(value.benchmark_revision) &&
    isSensitivity(value.sensitivity) &&
    isRank(value.candidate_count) &&
    isRank(value.case_count) &&
    typeof value.winner_observation_id === "string" &&
    typeof value.command === "string"
  );
}

/** Returns whether a value is one experiment, as a workflow's list shows it. */
export function isExperimentSummary(value: unknown): value is ExperimentSummary {
  return isExperimentHeader(value) && isRecord(value) && isNumber(value.winner_score);
}

function isExperimentCase(value: unknown): value is ExperimentCase {
  return (
    isRecord(value) &&
    isTextOrNull(value.case_id) &&
    typeof value.run_id === "string" &&
    typeof value.evaluation_id === "string" &&
    isBooleanOrNull(value.passed) &&
    isCount(value.judge_calls) &&
    isNumber(value.judge_cost_usd)
  );
}

function isExperimentStep(value: unknown): value is ExperimentStep {
  return (
    isRecord(value) &&
    typeof value.step_id === "string" &&
    isTextOrNull(value.strategy_id) &&
    isTextOrNull(value.model)
  );
}

function isExperimentCandidate(value: unknown): value is ExperimentCandidate {
  return (
    isRecord(value) &&
    typeof value.observation_id === "string" &&
    isRank(value.rank) &&
    isNumberOrNullWhole(value.workflow_revision) &&
    isTextList(value.strategy_ids) &&
    Array.isArray(value.steps) &&
    value.steps.every(isExperimentStep) &&
    isCount(value.cases_run) &&
    (value.cases_passed === null || isCount(value.cases_passed)) &&
    isScorecard(value.scorecard) &&
    isCount(value.judge_calls) &&
    isNumber(value.judge_cost_usd) &&
    Array.isArray(value.cases) &&
    value.cases.every(isExperimentCase)
  );
}

/** Returns whether a value is one experiment, with every candidate ranked. */
export function isExperimentDetail(value: unknown): value is ExperimentDetail {
  return (
    isExperimentHeader(value) &&
    isRecord(value) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isExperimentCandidate)
  );
}

function isRunCosts(value: unknown): value is RunCosts {
  return (
    isRecord(value) &&
    isCount(value.runs) &&
    isNumberOrNullFinite(value.cost_usd) &&
    isNumberOrNullFinite(value.latency_seconds)
  );
}

function isSavings(value: unknown): value is Savings {
  return (
    isRecord(value) &&
    isNumberOrNullFinite(value.cost_usd) &&
    isNumberOrNullFinite(value.cost_percent) &&
    isNumberOrNullFinite(value.latency_seconds) &&
    isNumberOrNullFinite(value.latency_percent)
  );
}

function isProjection(value: unknown): value is SavingsProjection {
  return (
    isRecord(value) &&
    isRank(value.window_days) &&
    typeof value.since === "string" &&
    isRank(value.invocations) &&
    isNumberOrNullFinite(value.cost_usd) &&
    isNumberOrNullFinite(value.latency_seconds)
  );
}

/** Returns whether a value is an experiment's winner beside what promoting it would replace. */
export function isExperimentComparison(value: unknown): value is ExperimentComparison {
  return (
    isRecord(value) &&
    typeof value.experiment_id === "string" &&
    typeof value.workflow_id === "string" &&
    (value.baseline === null ||
      value.baseline === "production" ||
      value.baseline === "configured") &&
    isTextOrNull(value.reason) &&
    isExperimentCandidate(value.winner) &&
    (value.baseline_candidate === null || isExperimentCandidate(value.baseline_candidate)) &&
    Array.isArray(value.steps) &&
    value.steps.every(
      (step) =>
        isRecord(step) &&
        typeof step.step_id === "string" &&
        isTextOrNull(step.winner_model) &&
        isTextOrNull(step.baseline_model) &&
        typeof step.differs === "boolean",
    ) &&
    Array.isArray(value.cases) &&
    value.cases.every(
      (compared) =>
        isRecord(compared) &&
        isTextOrNull(compared.case_id) &&
        isBooleanOrNull(compared.winner_passed) &&
        isBooleanOrNull(compared.baseline_passed) &&
        isNumberOrNullFinite(compared.winner_score) &&
        isNumberOrNullFinite(compared.baseline_score),
    ) &&
    isRunCosts(value.winner_runs) &&
    (value.baseline_runs === null || isRunCosts(value.baseline_runs)) &&
    typeof value.command === "string" &&
    (value.savings === null || isSavings(value.savings)) &&
    (value.projection === null || isProjection(value.projection))
  );
}

/** Returns whether a value says whether an experiment's winner can still be promoted. */
export function isPromotability(value: unknown): value is Promotability {
  return (
    isRecord(value) &&
    typeof value.experiment_id === "string" &&
    typeof value.workflow_id === "string" &&
    typeof value.promotable === "boolean" &&
    isTextOrNull(value.code) &&
    isTextOrNull(value.reason) &&
    typeof value.command === "string"
  );
}

function isGeneration(value: unknown): value is OptimizationGeneration {
  return (
    isRecord(value) &&
    isRank(value.generation) &&
    typeof value.experiment_id === "string" &&
    isTextList(value.winner_strategy_ids) &&
    isNumber(value.winner_score) &&
    isCount(value.proposed)
  );
}

/** Returns whether a value is what one optimization session measured. */
export function isOptimizationSummary(value: unknown): value is OptimizationSummary {
  return (
    isRecord(value) &&
    typeof value.workflow_id === "string" &&
    typeof value.benchmark_id === "string" &&
    Array.isArray(value.generations) &&
    value.generations.length > 0 &&
    value.generations.every(isGeneration) &&
    isTextOrNull(value.final_experiment_id) &&
    isTextOrNull(value.final_skipped) &&
    typeof value.winning_experiment_id === "string" &&
    isCount(value.judge_calls) &&
    isNumber(value.judge_cost_usd) &&
    typeof value.command === "string"
  );
}

/** Returns whether a value is one event of an optimization. */
export function isOptimizationEvent(value: unknown): value is OptimizationEvent {
  if (!isRecord(value) || !isRank(value.generation)) {
    return false;
  }
  switch (value.type) {
    case "generation_started":
      return isRank(value.candidates) && typeof value.final === "boolean";
    case "candidate_finished":
      return (
        typeof value.workflow_id === "string" &&
        isTextList(value.strategy_ids) &&
        isCount(value.cases_run) &&
        isCount(value.cases_passed) &&
        isNumber(value.overall_score)
      );
    case "generation_finished":
      return (
        typeof value.experiment_id === "string" &&
        isTextList(value.winner_strategy_ids) &&
        isNumber(value.winner_score) &&
        isCount(value.proposed)
      );
    default:
      return false;
  }
}

/** How long each period of a spend report is (Azathoth's ADR 0132). */
export type SpendPeriod = "day" | "week" | "month";

/** What a spend report's spend is grouped by within each period. */
export type SpendGroup = "workflow" | "model" | "provider" | "source";

/** Every period length, in the order the editor offers them. */
export const SPEND_PERIODS: readonly SpendPeriod[] = ["day", "week", "month"];

/** Every grouping, in the order the editor offers them. */
export const SPEND_GROUPS: readonly SpendGroup[] = ["workflow", "model", "provider", "source"];

/**
 * What some model calls cost: billed by their providers and estimated from
 * a configured price, never added into one, and how many had no price.
 */
export interface SpendTotals {
  readonly billed_usd: number;
  readonly estimated_usd: number;
  readonly calls: number;
  readonly unpriced_calls: number;
}

/** What one group's calls cost: a workflow's, a model's, a provider's or a source's. */
export interface SpendGroupTotals extends SpendTotals {
  /** A workflow's ID, `provider/model`, a provider, a source, or `unknown`. */
  readonly key: string;
  /** A workflow's name, or else the key. */
  readonly label: string;
}

/** One period of a report, cut to its range at either end. */
export interface SpendPeriodTotals {
  readonly start: string;
  readonly end: string;
  readonly totals: SpendTotals;
  readonly groups: readonly SpendGroupTotals[];
}

/** What an instance spent from `since` up to `until`, period by period, in a time zone. */
export interface SpendReport {
  readonly since: string;
  readonly until: string;
  readonly time_zone: string;
  readonly period: SpendPeriod;
  readonly group: SpendGroup;
  readonly workflow_id: string | null;
  readonly periods: readonly SpendPeriodTotals[];
  /** Each group's spend over every period. */
  readonly groups: readonly SpendGroupTotals[];
  readonly totals: SpendTotals;
  /** The `azathoth spend` command that prints this report. */
  readonly command: string;
}

function isDollars(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

function isSpendTotals(value: unknown): value is SpendTotals {
  return (
    isRecord(value) &&
    isDollars(value.billed_usd) &&
    isDollars(value.estimated_usd) &&
    isCount(value.calls) &&
    isCount(value.unpriced_calls)
  );
}

function isSpendGroupTotals(value: unknown): value is SpendGroupTotals {
  return (
    isSpendTotals(value) &&
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.label === "string"
  );
}

function isSpendPeriodTotals(value: unknown): value is SpendPeriodTotals {
  return (
    isRecord(value) &&
    typeof value.start === "string" &&
    typeof value.end === "string" &&
    isSpendTotals(value.totals) &&
    Array.isArray(value.groups) &&
    value.groups.every(isSpendGroupTotals)
  );
}

/** Returns whether a value is a spend report, as the server writes one. */
export function isSpendReport(value: unknown): value is SpendReport {
  return (
    isRecord(value) &&
    typeof value.since === "string" &&
    typeof value.until === "string" &&
    typeof value.time_zone === "string" &&
    SPEND_PERIODS.some((period) => period === value.period) &&
    SPEND_GROUPS.some((group) => group === value.group) &&
    isTextOrNull(value.workflow_id) &&
    Array.isArray(value.periods) &&
    value.periods.every(isSpendPeriodTotals) &&
    Array.isArray(value.groups) &&
    value.groups.every(isSpendGroupTotals) &&
    isSpendTotals(value.totals) &&
    typeof value.command === "string"
  );
}
