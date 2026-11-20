/**
 * The editor's client of its own server's JSON API.
 *
 * Every failure is an `ApiFailure` with a stable code: the API's own codes,
 * `unreachable` when the server does not answer, and `invalid_response` when
 * it answers with something the editor cannot read. An abort is passed on as
 * it is, so a caller that gave up can tell.
 *
 * Every call that acts on an instance takes its endpoint from the
 * `base` its options give, the local instance's `/api` by default (ADR
 * 0009). The editor's own endpoints, its description and its remotes, are
 * always at `/api`.
 */

import {
  isAnnotations,
  isBenchmarkCaseChange,
  isBenchmarkCaseDetail,
  isBenchmarkCaseSummary,
  isBenchmarkExecutionDetail,
  isBenchmarkExecutionSummary,
  isBenchmarkSummary,
  isExperimentComparison,
  isExperimentDetail,
  isExperimentSummary,
  isPromotability,
  isSpendReport,
  isInterruptedRun,
  isJudgeSummary,
  isRunChildSummary,
  isRunFeedback,
  importOf,
  isComponentDetail,
  isEditorDescription,
  isErrorBody,
  isInstanceCommands,
  isInstanceDescription,
  isInvocationDetail,
  isInvocationSummary,
  isProductionAnswer,
  isProductionRevisionSummary,
  isLiveRun,
  isRunDetail,
  isRunSummary,
  isWorkflowCheck,
  isWorkflowReadiness,
  isModelListing,
  isModelSummary,
  isNamedRemote,
  isPortfolioEntry,
  isPortfolioRemoval,
  isPullReport,
  isPushReport,
  isRemoteStatus,
  isSummary,
  isToolSummary,
  itemsOf,
  type Annotations,
  type BenchmarkCaseChange,
  type BenchmarkCaseDetail,
  type BenchmarkCaseSummary,
  type BenchmarkExecutionDetail,
  type BenchmarkExecutionSummary,
  type BenchmarkSummary,
  type CaseCitations,
  type ExperimentComparison,
  type ExperimentDetail,
  type ExperimentSummary,
  type Promotability,
  type SpendGroup,
  type SpendPeriod,
  type SpendReport,
  type CaseComparison,
  type FeedbackDisposition,
  type InterruptedRun,
  type JudgeSummary,
  type RunChildSummary,
  type RunFeedback,
  type ComponentDetail,
  type ComponentImport,
  type EditorDescription,
  type InstanceCommands,
  type InstanceDescription,
  type DataPolicy,
  type InvocationDetail,
  type InvocationSummary,
  type ProductionRevisionSummary,
  type ProductionState,
  type LiveRun,
  type RunDetail,
  type RunSummary,
  type WorkflowCheck,
  type WorkflowReadiness,
  type ModelListing,
  type ModelSummary,
  type NamedRemote,
  type PortfolioEntry,
  type PortfolioRemoval,
  type PullReport,
  type PushReport,
  type RemoteStatus,
  type Sensitivity,
  type Summary,
  type ToolSummary,
  type WorkflowSummary,
} from "./types";

export const UNREACHABLE_MESSAGE = "The editor's server isn't answering.";

export const INVALID_RESPONSE_MESSAGE = "The editor's server sent an answer the editor can't read.";

/**
 * A request to the server that did not get the answer it asked for. What
 * else the server said of the error, past its code and message, is in
 * `details`, such as the workflows that use a model it would not remove.
 */
export class ApiFailure extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    status: number | null,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "ApiFailure";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Where the local instance's endpoints are, and the editor's own. */
export const API_BASE = "/api";

/**
 * How one request is made: the fetch to use, a signal to give up on it, and,
 * for a call that acts on an instance, where that instance's endpoints are.
 */
export interface RequestOptions {
  readonly fetcher?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly base?: string;
}

/** Returns where one instance endpoint is, below the base the options give. */
function at(options: RequestOptions, path: string): string {
  return `${options.base ?? API_BASE}${path}`;
}

function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

/** Returns the JSON one request to the API answers with, or throws an `ApiFailure`. */
async function requestJson(
  path: string,
  init: { readonly method: "GET" | "POST"; readonly body?: string },
  options: RequestOptions,
): Promise<unknown> {
  const { fetcher = browserFetch, signal } = options;
  let response: Response;

  try {
    response = await fetcher(path, {
      method: init.method,
      credentials: "same-origin",
      headers:
        init.body === undefined
          ? { accept: "application/json" }
          : { accept: "application/json", "content-type": "application/json" },
      body: init.body ?? null,
      signal: signal ?? null,
    });
  } catch (error) {
    if (signal?.aborted === true) {
      throw error;
    }
    throw new ApiFailure("unreachable", UNREACHABLE_MESSAGE, null);
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, response.status);
  }

  if (!response.ok) {
    if (isErrorBody(body)) {
      const { code, message, ...details } = body.error;

      throw new ApiFailure(code, message, response.status, details);
    }
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, response.status);
  }

  return body;
}

/** Returns the JSON one API path answers a `GET` with, or throws an `ApiFailure`. */
export function getJson(path: string, options: RequestOptions = {}): Promise<unknown> {
  return requestJson(path, { method: "GET" }, options);
}

/** Returns the instance: `GET {base}/instance`. */
export async function fetchInstance(options: RequestOptions = {}): Promise<InstanceDescription> {
  const body = await getJson(at(options, "/instance"), options);

  if (!isInstanceDescription(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/**
 * Returns the instance's name, and what goes before an `azathoth` command so
 * that it acts on that instance, as the server writes it: `GET {base}/commands`.
 */
export async function fetchCommands(options: RequestOptions = {}): Promise<InstanceCommands> {
  const body = await getJson(at(options, "/commands"), options);

  if (!isInstanceCommands(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** Returns the editor, its shell and its providers: `GET /api/editor`. */
export async function fetchEditor(options: RequestOptions = {}): Promise<EditorDescription> {
  const body = await getJson("/api/editor", options);

  if (!isEditorDescription(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

async function fetchItems<T>(
  path: string,
  guard: (item: unknown) => item is T,
  options: RequestOptions,
): Promise<T[]> {
  const items = itemsOf(await getJson(path, options), guard);

  if (items === null) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return items;
}

/** Returns every workflow in the editor's instance, at its latest revision. */
export function fetchWorkflows(options: RequestOptions = {}): Promise<WorkflowSummary[]> {
  return fetchItems(at(options, "/workflows"), isSummary, options);
}

/** Returns every tool version in the editor's instance, at its latest revision. */
export function fetchTools(options: RequestOptions = {}): Promise<ToolSummary[]> {
  return fetchItems(at(options, "/tools"), isToolSummary, options);
}

/** Returns every benchmark in the editor's instance, at its latest revision. */
export function fetchBenchmarks(options: RequestOptions = {}): Promise<BenchmarkSummary[]> {
  return fetchItems(at(options, "/benchmarks"), isBenchmarkSummary, options);
}

/** Returns one revision of a component with its document, from its path in the API. */
export async function fetchDetail(
  path: string,
  options: RequestOptions = {},
): Promise<ComponentDetail> {
  const body = await getJson(path, options);

  if (!isComponentDetail(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** Returns a component's revisions, newest first, from its history's path in the API. */
export function fetchHistory(path: string, options: RequestOptions = {}): Promise<Summary[]> {
  return fetchItems(path, isSummary, options);
}

/** The largest document the server imports, as it says in ADR 0003. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * Imports one document into the local instance as its component's next
 * revision: `POST /api/{kind}/import`. Returns whether it made one, and the
 * revision it is: a document identical to the latest revision makes none.
 */
export async function importDocument(
  kind: "workflows" | "tools" | "benchmarks",
  document: string,
  options: RequestOptions = {},
): Promise<ComponentImport> {
  const body = await requestJson(
    at(options, `/${kind}/import`),
    { method: "POST", body: document },
    options,
  );
  const imported = importOf(body, kind);

  if (imported === null) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 201);
  }

  return imported;
}

/** Returns the path of one model in the API: its identifier's parts, each encoded. */
export function modelApiPath(identifier: string, base: string = API_BASE): string {
  return `${base}/models/${identifier.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Returns every model the providers serve, marked by the local portfolio:
 * `GET /api/models`. With `refresh`, the server asks the providers again
 * rather than answering with what it kept.
 */
export async function fetchModels(
  { refresh = false }: { readonly refresh?: boolean } = {},
  options: RequestOptions = {},
): Promise<ModelListing> {
  const body = await getJson(at(options, refresh ? "/models?refresh=true" : "/models"), options);

  if (!isModelListing(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** Returns one model the providers serve: `GET /api/models/{identifier}`. */
export async function fetchModel(
  identifier: string,
  options: RequestOptions = {},
): Promise<ModelSummary> {
  const body = await getJson(modelApiPath(identifier, options.base), options);

  if (!isModelSummary(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** Returns the models the local portfolio authorizes: `GET /api/local/portfolio`. */
export function fetchPortfolio(options: RequestOptions = {}): Promise<PortfolioEntry[]> {
  return fetchItems(at(options, "/local/portfolio"), isPortfolioEntry, options);
}

/** Adds one model to the local portfolio: `POST /api/local/portfolio`. */
export async function addToPortfolio(
  identifier: string,
  options: RequestOptions = {},
): Promise<PortfolioEntry> {
  const body = await requestJson(
    at(options, "/local/portfolio"),
    { method: "POST", body: JSON.stringify({ identifier }) },
    options,
  );

  if (!isPortfolioEntry(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 201);
  }

  return body;
}

/**
 * Declares what one authorized model's provider does with data:
 * `POST /api/local/portfolio/policy`. Returns its entry, saying who declared
 * it and when (ADR 0011).
 */
export async function declareModelPolicy(
  identifier: string,
  policy: DataPolicy,
  options: RequestOptions = {},
): Promise<PortfolioEntry> {
  const body = await requestJson(
    at(options, "/local/portfolio/policy"),
    { method: "POST", body: JSON.stringify({ identifier, ...policy }) },
    options,
  );

  if (!isPortfolioEntry(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/**
 * Removes one model from the local portfolio: `POST /api/local/portfolio/remove`.
 * A model local production uses is kept, with a `model_in_use` failure whose
 * details name its dependents, unless `force` is set.
 */
export async function removeFromPortfolio(
  identifier: string,
  { force = false }: { readonly force?: boolean } = {},
  options: RequestOptions = {},
): Promise<PortfolioRemoval> {
  const body = await requestJson(
    at(options, "/local/portfolio/remove"),
    { method: "POST", body: JSON.stringify({ identifier, force }) },
    options,
  );

  if (!isPortfolioRemoval(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** The largest file a run takes, as Azathoth holds it: 10 MB. */
export const MAX_INPUT_FILE_BYTES = 10 * 1024 * 1024;

/** A file as the server takes one: its media type, and its content in base64. */
export interface SentFile {
  readonly media_type: string;
  readonly content: string;
}

/** What a run is given: JSON, a file, or nothing. */
export type RunGiven =
  | { readonly kind: "json"; readonly value: unknown }
  | { readonly kind: "file"; readonly file: SentFile }
  | { readonly kind: "none" };

/** Returns what a start sends of a label: the label when one is chosen, and nothing otherwise. */
function labelled(sensitivity: Sensitivity | null | undefined): Record<string, unknown> {
  return sensitivity === null || sensitivity === undefined ? {} : { sensitivity };
}

/**
 * Returns the body that starts a run of a workflow, given what it is given,
 * and its input's label when one is chosen (ADR 0011).
 */
export function startBody(
  workflowId: string,
  given: RunGiven,
  sensitivity: Sensitivity | null = null,
): Record<string, unknown> {
  const label = labelled(sensitivity);

  switch (given.kind) {
    case "json":
      return { workflow_id: workflowId, input: given.value, ...label };
    case "file":
      return { workflow_id: workflowId, file: given.file, ...label };
    case "none":
      return { workflow_id: workflowId, ...label };
  }
}

async function liveRunOf(path: string, body: string | undefined, options: RequestOptions) {
  const answer = await requestJson(
    path,
    body === undefined ? { method: "GET" } : { method: "POST", body },
    options,
  );

  if (!isLiveRun(answer)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return answer;
}

/** What a run is started with: its workflow, what it is given, and that input's label. */
export interface RunStart {
  readonly workflowId: string;
  readonly given: RunGiven;
  readonly sensitivity?: Sensitivity | null;
}

/** Starts a live run of a workflow: `POST /api/live/runs`. Returns it, running. */
export function startRun(
  { workflowId, given, sensitivity = null }: RunStart,
  options: RequestOptions = {},
): Promise<LiveRun> {
  return liveRunOf(
    at(options, "/live/runs"),
    JSON.stringify(startBody(workflowId, given, sensitivity)),
    options,
  );
}

/**
 * What trying one step alone is sent (ADR 0007): the document as it stands,
 * the step, the values and files its inputs are given by name, and the run's
 * input, for an input left to read it.
 */
export interface TrialStart {
  readonly document: unknown;
  readonly step_id: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly files: Readonly<Record<string, SentFile>>;
  readonly input?: unknown;
  readonly file?: SentFile;
  /** The label of everything the step is given, when one is chosen. */
  readonly sensitivity?: Sensitivity;
}

/** Starts trying one step alone: `POST /api/live/steps`. Returns its live run, running. */
export function startTrial(start: TrialStart, options: RequestOptions = {}): Promise<LiveRun> {
  return liveRunOf(at(options, "/live/steps"), JSON.stringify(start), options);
}

/** Returns one live run: `GET /api/live/{handle}`. */
export function fetchLiveRun(handle: string, options: RequestOptions = {}): Promise<LiveRun> {
  return liveRunOf(at(options, `/live/${encodeURIComponent(handle)}`), undefined, options);
}

/** Returns every live run the editor remembers, newest first: `GET /api/live`. */
export function fetchLiveRuns(options: RequestOptions = {}): Promise<LiveRun[]> {
  return fetchItems(at(options, "/live"), isLiveRun, options);
}

/** Asks a live run to stop: `POST /api/live/{handle}/cancel`. Returns it as it stands. */
export function cancelLiveRun(handle: string, options: RequestOptions = {}): Promise<LiveRun> {
  return liveRunOf(at(options, `/live/${encodeURIComponent(handle)}/cancel`), "{}", options);
}

/** Returns the path of a live run's event stream. */
export function liveEventsPath(handle: string, base: string = API_BASE): string {
  return `${base}/live/${encodeURIComponent(handle)}/events`;
}

/** How many of a workflow's runs the editor lists at once. */
export const RUNS_LISTED = 20;

/** Returns a workflow's kept runs, newest first: `GET /api/workflows/{id}/runs`. */
export function fetchWorkflowRuns(
  workflowId: string,
  options: RequestOptions = {},
): Promise<RunSummary[]> {
  return fetchItems(
    at(options, `/workflows/${encodeURIComponent(workflowId)}/runs?limit=${String(RUNS_LISTED)}`),
    isRunSummary,
    options,
  );
}

/** Returns one kept run with its steps: `GET /api/runs/{run_id}`. */
export async function fetchRun(runId: string, options: RequestOptions = {}): Promise<RunDetail> {
  const body = await getJson(at(options, `/runs/${encodeURIComponent(runId)}`), options);

  if (!isRunDetail(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/**
 * Returns what Azathoth makes of a workflow document, saving nothing:
 * `POST /api/workflows/check`.
 */
export async function checkWorkflow(
  document: unknown,
  options: RequestOptions = {},
): Promise<WorkflowCheck> {
  const body = await requestJson(
    at(options, "/workflows/check"),
    { method: "POST", body: JSON.stringify(document) },
    options,
  );

  if (!isWorkflowCheck(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/**
 * Returns whether each step of a workflow document could run here now, as
 * Azathoth resolves it, asking the providers: `POST /api/workflows/readiness`.
 * With `sensitivity`, each step is judged for input so labelled (ADR 0011).
 */
export async function fetchReadiness(
  document: unknown,
  options: RequestOptions = {},
  sensitivity: Sensitivity | null = null,
): Promise<WorkflowReadiness> {
  const query = sensitivity === null ? "" : `?sensitivity=${sensitivity}`;
  const body = await requestJson(
    at(options, `/workflows/readiness${query}`),
    { method: "POST", body: JSON.stringify(document) },
    options,
  );

  if (!isWorkflowReadiness(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/**
 * Returns the local portfolio's models that meet a step's requirements, in
 * the order a run tries them, by Azathoth's own rules: `POST /api/models/matching`.
 * With `sensitivity`, only those that may receive input so labelled (ADR 0011).
 */
export async function matchModels(
  requirements: Readonly<Record<string, unknown>>,
  options: RequestOptions = {},
  sensitivity: Sensitivity | null = null,
): Promise<ModelSummary[]> {
  const body = await requestJson(
    at(options, "/models/matching"),
    { method: "POST", body: JSON.stringify({ requirements, ...labelled(sensitivity) }) },
    options,
  );
  const items = itemsOf(body, isModelSummary);

  if (items === null) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return items;
}

/** Returns every remote the editor's instance names, by name: `GET /api/remotes`. */
export function fetchRemotes(options: RequestOptions = {}): Promise<NamedRemote[]> {
  return fetchItems("/api/remotes", isNamedRemote, options);
}

/** A remote to name: its name, URL, and the variable its token is read from, if not the usual. */
export interface RemoteToAdd {
  readonly name: string;
  readonly url: string;
  readonly tokenVariable?: string;
}

/** Names one remote in the editor's instance: `POST /api/remotes`. */
export async function addRemote(
  { name, url, tokenVariable }: RemoteToAdd,
  options: RequestOptions = {},
): Promise<NamedRemote> {
  const sent =
    tokenVariable === undefined || tokenVariable === ""
      ? { name, url }
      : { name, url, token_variable: tokenVariable };
  const body = await requestJson(
    "/api/remotes",
    { method: "POST", body: JSON.stringify(sent) },
    options,
  );

  if (!isNamedRemote(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 201);
  }

  return body;
}

/** Forgets one remote's name: `POST /api/remotes/remove`. Nothing at the remote changes. */
export async function removeRemote(
  name: string,
  options: RequestOptions = {},
): Promise<NamedRemote> {
  const body = await requestJson(
    "/api/remotes/remove",
    { method: "POST", body: JSON.stringify({ name }) },
    options,
  );

  if (!isNamedRemote(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** One tool version, as a selection names it. */
export interface ToolVersion {
  readonly id: string;
  readonly version: string;
}

/** What a status, push or pull is about; nothing named means everything, for a status. */
export interface Selection {
  readonly workflows?: readonly string[];
  readonly tools?: readonly ToolVersion[];
  readonly benchmarks?: readonly string[];
}

/** Returns where the API serves one action on a named remote. */
export function remoteApiPath(name: string, action: "status" | "push" | "pull"): string {
  return `/api/remotes/${encodeURIComponent(name)}/${action}`;
}

/**
 * Asks how what is selected relates to a named remote's:
 * `POST /api/remotes/{name}/status`. A remote that cannot be reached
 * answers a status whose remote side is unknown.
 */
export async function fetchRemoteStatus(
  name: string,
  selection: Selection = {},
  options: RequestOptions = {},
): Promise<RemoteStatus> {
  const body = await requestJson(
    remoteApiPath(name, "status"),
    { method: "POST", body: JSON.stringify(selection) },
    options,
  );

  if (!isRemoteStatus(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/**
 * Pushes what is selected, with what it needs, to a named remote:
 * `POST /api/remotes/{name}/push`. A push that has diverged fails as
 * `remote_diverged`; its warnings never refuse it.
 */
export async function pushToRemote(
  name: string,
  selection: Selection,
  options: RequestOptions = {},
): Promise<PushReport> {
  const body = await requestJson(
    remoteApiPath(name, "push"),
    { method: "POST", body: JSON.stringify(selection) },
    options,
  );

  if (!isPushReport(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/**
 * Pulls what is selected from a named remote into the editor's instance:
 * `POST /api/remotes/{name}/pull`. A restricted benchmark is withheld
 * unless `includeRestricted`.
 */
export async function pullFromRemote(
  name: string,
  selection: Selection,
  { includeRestricted = false }: { readonly includeRestricted?: boolean } = {},
  options: RequestOptions = {},
): Promise<PullReport> {
  const sent = includeRestricted ? { ...selection, include_restricted: true } : selection;
  const body = await requestJson(
    remoteApiPath(name, "pull"),
    { method: "POST", body: JSON.stringify(sent) },
    options,
  );

  if (!isPullReport(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** How many of a workflow's production revisions, and of its invocations, the editor lists. */
export const PRODUCTION_LISTED = 20;

function workflowPath(workflowId: string, path: string): string {
  return `/workflows/${encodeURIComponent(workflowId)}${path}`;
}

/**
 * Returns what a workflow's production runs now, or `null` when it is not
 * in production: `GET {base}/workflows/{id}/production`.
 */
export async function fetchProduction(
  workflowId: string,
  options: RequestOptions = {},
): Promise<ProductionState | null> {
  const body = await getJson(at(options, workflowPath(workflowId, "/production")), options);

  if (!isProductionAnswer(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body.production;
}

/** Returns a workflow's production revisions, newest first, the active one marked. */
export function fetchProductionRevisions(
  workflowId: string,
  options: RequestOptions = {},
): Promise<ProductionRevisionSummary[]> {
  return fetchItems(
    at(
      options,
      workflowPath(workflowId, `/production/revisions?limit=${String(PRODUCTION_LISTED)}`),
    ),
    isProductionRevisionSummary,
    options,
  );
}

async function productionChange(
  path: string,
  sent: Readonly<Record<string, unknown>>,
  options: RequestOptions,
): Promise<ProductionRevisionSummary> {
  const body = await requestJson(
    at(options, path),
    { method: "POST", body: JSON.stringify(sent) },
    options,
  );

  if (!isProductionRevisionSummary(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 201);
  }

  return body;
}

/**
 * Promotes a workflow's latest revision, or an experiment's winner:
 * `POST {base}/workflows/{id}/promote`. Returns the revision it saved.
 */
export function promoteWorkflow(
  workflowId: string,
  { experimentId }: { readonly experimentId?: string } = {},
  options: RequestOptions = {},
): Promise<ProductionRevisionSummary> {
  return productionChange(
    workflowPath(workflowId, "/promote"),
    experimentId === undefined ? {} : { experiment_id: experimentId },
    options,
  );
}

/**
 * Restores an earlier production revision as a new one, the previous one
 * unless `to` names another: `POST {base}/workflows/{id}/rollback`.
 */
export function rollBackWorkflow(
  workflowId: string,
  { to }: { readonly to?: string } = {},
  options: RequestOptions = {},
): Promise<ProductionRevisionSummary> {
  return productionChange(
    workflowPath(workflowId, "/rollback"),
    to === undefined ? {} : { to },
    options,
  );
}

/** Returns a workflow's invocations, newest first: `GET {base}/workflows/{id}/invocations`. */
export function fetchWorkflowInvocations(
  workflowId: string,
  options: RequestOptions = {},
): Promise<InvocationSummary[]> {
  return fetchItems(
    at(options, workflowPath(workflowId, `/invocations?limit=${String(PRODUCTION_LISTED)}`)),
    isInvocationSummary,
    options,
  );
}

/** Returns one invocation, with its input, outcome and run: `GET {base}/invocations/{id}`. */
export async function fetchInvocation(
  invocationId: string,
  options: RequestOptions = {},
): Promise<InvocationDetail> {
  const body = await getJson(
    at(options, `/invocations/${encodeURIComponent(invocationId)}`),
    options,
  );

  if (!isInvocationDetail(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** What an invocation is given: its workflow, its input, and its key if one is named. */
export interface InvocationStart {
  readonly workflowId: string;
  readonly given: RunGiven;
  readonly idempotencyKey?: string;
  readonly sensitivity?: Sensitivity | null;
}

/**
 * Invokes a workflow in production, as a live run: `POST {base}/live/invocations`.
 * Returns it, running; its end carries the invocation's outcome.
 */
export function startInvocation(
  { workflowId, given, idempotencyKey, sensitivity = null }: InvocationStart,
  options: RequestOptions = {},
): Promise<LiveRun> {
  const body = startBody(workflowId, given, sensitivity);
  const sent =
    idempotencyKey === undefined || idempotencyKey === ""
      ? body
      : { ...body, idempotency_key: idempotencyKey };

  return liveRunOf(at(options, "/live/invocations"), JSON.stringify(sent), options);
}

/** Resumes an incomplete invocation, as a live run: `POST {base}/live/invocations/{id}/resume`. */
export function resumeInvocation(
  invocationId: string,
  options: RequestOptions = {},
): Promise<LiveRun> {
  return liveRunOf(
    at(options, `/live/invocations/${encodeURIComponent(invocationId)}/resume`),
    "{}",
    options,
  );
}

/** Returns the judge rotation, in the order judges are tried: `GET {base}/judges`. */
export function fetchJudges(options: RequestOptions = {}): Promise<JudgeSummary[]> {
  return fetchItems(at(options, "/judges"), isJudgeSummary, options);
}

async function judgeChange(
  path: string,
  identifier: string,
  options: RequestOptions,
): Promise<JudgeSummary> {
  const body = await requestJson(
    at(options, path),
    { method: "POST", body: JSON.stringify({ identifier }) },
    options,
  );

  if (!isJudgeSummary(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/**
 * Appends one served model the portfolio authorizes to the rotation:
 * `POST {base}/judges`. Returns it, in its place.
 */
export function addJudge(identifier: string, options: RequestOptions = {}): Promise<JudgeSummary> {
  return judgeChange("/judges", identifier, options);
}

/** Takes one model out of the rotation: `POST {base}/judges/remove`. Returns what it was. */
export function removeJudge(
  identifier: string,
  options: RequestOptions = {},
): Promise<JudgeSummary> {
  return judgeChange("/judges/remove", identifier, options);
}

function runPath(runId: string, path: string): string {
  return `/runs/${encodeURIComponent(runId)}${path}`;
}

/** Returns every judgment of a run, newest first: `GET {base}/runs/{id}/feedback`. */
export function fetchRunFeedback(
  runId: string,
  options: RequestOptions = {},
): Promise<RunFeedback[]> {
  return fetchItems(at(options, runPath(runId, "/feedback")), isRunFeedback, options);
}

/**
 * One judgment of a run, as a person gives it. Azathoth decides what it may
 * be: a bad one needs a reason, and only a bad one takes a corrected output.
 */
export interface Judgment {
  readonly disposition: FeedbackDisposition;
  readonly reason?: string;
  /** What the run should have produced; sent whenever it is given, even as `null`. */
  readonly correctedOutput?: unknown;
}

/** Records one judgment of a run: `POST {base}/runs/{id}/feedback`. Returns it. */
export async function recordFeedback(
  runId: string,
  { disposition, reason, correctedOutput }: Judgment,
  options: RequestOptions = {},
): Promise<RunFeedback> {
  const sent: Record<string, unknown> = { disposition };

  if (reason !== undefined) {
    sent.reason = reason;
  }
  if (correctedOutput !== undefined) {
    sent.corrected_output = correctedOutput;
  }
  const body = await requestJson(
    at(options, runPath(runId, "/feedback")),
    { method: "POST", body: JSON.stringify(sent) },
    options,
  );

  if (!isRunFeedback(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 201);
  }

  return body;
}

async function annotationsAt(path: string, options: RequestOptions): Promise<Annotations> {
  const body = await getJson(at(options, path), options);

  if (!isAnnotations(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** Returns a run's verified citations, as Web Annotations: `GET {base}/runs/{id}/annotations`. */
export function fetchRunAnnotations(
  runId: string,
  options: RequestOptions = {},
): Promise<Annotations> {
  return annotationsAt(runPath(runId, "/annotations"), options);
}

/** Returns an invocation's run's citations: `GET {base}/invocations/{id}/annotations`. */
export function fetchInvocationAnnotations(
  invocationId: string,
  options: RequestOptions = {},
): Promise<Annotations> {
  return annotationsAt(`/invocations/${encodeURIComponent(invocationId)}/annotations`, options);
}

/** Returns the runs a run's steps started, oldest first: `GET {base}/runs/{id}/children`. */
export function fetchRunChildren(
  runId: string,
  options: RequestOptions = {},
): Promise<RunChildSummary[]> {
  return fetchItems(at(options, runPath(runId, "/children")), isRunChildSummary, options);
}

/**
 * Returns a workflow's runs that started and never finished, newest first:
 * `GET {base}/workflows/{id}/interrupted`, the newest `RUNS_LISTED` of them.
 */
export function fetchInterruptedRuns(
  workflowId: string,
  options: RequestOptions = {},
): Promise<InterruptedRun[]> {
  return fetchItems(
    at(options, workflowPath(workflowId, `/interrupted?limit=${String(RUNS_LISTED)}`)),
    isInterruptedRun,
    options,
  );
}

/** An interrupted run to resume, and the workflow it is a run of (ADR 0012). */
export interface RunResumption {
  readonly runId: string;
  readonly workflowId: string;
}

/**
 * Resumes an interrupted run from its journal, as a live run that names it:
 * `POST {base}/live/runs/{id}/resume`. An invocation's run is resumed as its
 * invocation, with `resumeInvocation`.
 */
export function resumeRun(
  { runId, workflowId }: RunResumption,
  options: RequestOptions = {},
): Promise<LiveRun> {
  return liveRunOf(
    at(options, `/live/runs/${encodeURIComponent(runId)}/resume`),
    JSON.stringify({ workflow_id: workflowId }),
    options,
  );
}

function benchmarkPath(benchmarkId: string, path: string): string {
  return `/benchmarks/${encodeURIComponent(benchmarkId)}${path}`;
}

function casePath(benchmarkId: string, caseId: string, path = ""): string {
  return benchmarkPath(benchmarkId, `/cases/${encodeURIComponent(caseId)}${path}`);
}

function atRevision(revision: number | null): string {
  return revision === null ? "" : `?revision=${String(revision)}`;
}

/** What a new benchmark is created with; Azathoth gives it 1.0.0 when no version is given. */
export interface NewBenchmark {
  readonly name: string;
  readonly description: string;
  readonly version?: string;
}

/**
 * Creates an empty benchmark: `POST {base}/benchmarks`. Returns it, as an
 * import answers; it cannot be run until a case is added.
 */
export async function createBenchmark(
  { name, description, version }: NewBenchmark,
  options: RequestOptions = {},
): Promise<ComponentImport> {
  const sent = version === undefined ? { name, description } : { name, description, version };
  const body = await requestJson(
    at(options, "/benchmarks"),
    { method: "POST", body: JSON.stringify(sent) },
    options,
  );
  const created = importOf(body, "benchmarks");

  if (created === null) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 201);
  }

  return created;
}

/**
 * Returns a benchmark's cases, in order: `GET {base}/benchmarks/{id}/cases`,
 * at its latest revision when `revision` is `null`.
 */
export function fetchBenchmarkCases(
  benchmarkId: string,
  revision: number | null,
  options: RequestOptions = {},
): Promise<BenchmarkCaseSummary[]> {
  return fetchItems(
    at(options, benchmarkPath(benchmarkId, `/cases${atRevision(revision)}`)),
    isBenchmarkCaseSummary,
    options,
  );
}

/** Returns one case, with its input and what it expects: `GET {base}/benchmarks/{id}/cases/{case}`. */
export async function fetchBenchmarkCase(
  benchmarkId: string,
  caseId: string,
  revision: number | null,
  options: RequestOptions = {},
): Promise<BenchmarkCaseDetail> {
  const body = await getJson(
    at(options, casePath(benchmarkId, caseId, atRevision(revision))),
    options,
  );

  if (!isBenchmarkCaseDetail(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** What a new case is made from: a kept run, JSON, or a file. */
export type CaseFrom =
  | { readonly kind: "run"; readonly runId: string }
  | { readonly kind: "json"; readonly value: unknown }
  | { readonly kind: "file"; readonly file: SentFile };

/**
 * One case to add. What is left out is not sent: a case from a run with no
 * `expected` expects the run's latest correction, as Azathoth decides.
 */
export interface NewCase {
  readonly from: CaseFrom;
  readonly comparison: CaseComparison;
  /** What it expects; sent whenever it is given, even as `null`. */
  readonly expected?: unknown;
  readonly description?: string;
  readonly citations?: CaseCitations | null;
  readonly sensitivity?: Sensitivity | null;
}

function fromOf(from: CaseFrom): Record<string, unknown> {
  switch (from.kind) {
    case "run":
      return { run_id: from.runId };
    case "json":
      return { input: from.value };
    case "file":
      return { file: from.file };
  }
}

/** Returns what a body sends of the fields given, leaving out each that is `undefined`. */
function given(fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

async function caseChange(
  path: string,
  sent: Readonly<Record<string, unknown>>,
  status: number,
  options: RequestOptions,
): Promise<BenchmarkCaseChange> {
  const body = await requestJson(
    at(options, path),
    { method: "POST", body: JSON.stringify(sent) },
    options,
  );

  if (!isBenchmarkCaseChange(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, status);
  }

  return body;
}

/**
 * Adds a case to a benchmark: `POST {base}/benchmarks/{id}/cases`. Returns
 * it, and the benchmark's revision that holds it.
 */
export function addBenchmarkCase(
  benchmarkId: string,
  { from, comparison, expected, description, citations, sensitivity }: NewCase,
  options: RequestOptions = {},
): Promise<BenchmarkCaseChange> {
  const sent = {
    ...fromOf(from),
    ...given({ comparison, expected, description, citations }),
    ...labelled(sensitivity),
  };

  return caseChange(benchmarkPath(benchmarkId, "/cases"), sent, 201, options);
}

/**
 * One edit of a case: only what is given changes. `citations: null` stops
 * requiring citations, and `expected: null` expects null. A label may only
 * be raised.
 */
export interface CaseEdit {
  readonly comparison?: CaseComparison;
  readonly expected?: unknown;
  readonly description?: string;
  readonly citations?: CaseCitations | null;
  readonly sensitivity?: Sensitivity;
}

/** Edits a case into the benchmark's next revision: `POST {base}/benchmarks/{id}/cases/{case}`. */
export function editBenchmarkCase(
  benchmarkId: string,
  caseId: string,
  edit: CaseEdit,
  options: RequestOptions = {},
): Promise<BenchmarkCaseChange> {
  return caseChange(casePath(benchmarkId, caseId), given({ ...edit }), 200, options);
}

/**
 * Removes a case from the benchmark's next revision:
 * `POST {base}/benchmarks/{id}/cases/{case}/remove`. Earlier revisions still hold it.
 */
export function removeBenchmarkCase(
  benchmarkId: string,
  caseId: string,
  options: RequestOptions = {},
): Promise<BenchmarkCaseChange> {
  return caseChange(casePath(benchmarkId, caseId, "/remove"), {}, 200, options);
}

/** How many of a benchmark's executions the editor lists. */
export const EXECUTIONS_LISTED = 20;

/**
 * Returns a benchmark's runs and comparisons, newest first:
 * `GET {base}/benchmarks/{id}/executions`, the newest `EXECUTIONS_LISTED` of them.
 */
export function fetchBenchmarkExecutions(
  benchmarkId: string,
  options: RequestOptions = {},
): Promise<BenchmarkExecutionSummary[]> {
  return fetchItems(
    at(options, benchmarkPath(benchmarkId, `/executions?limit=${String(EXECUTIONS_LISTED)}`)),
    isBenchmarkExecutionSummary,
    options,
  );
}

/** Returns one execution, with every workflow and case: `GET {base}/benchmark-executions/{id}`. */
export async function fetchBenchmarkExecution(
  executionId: string,
  options: RequestOptions = {},
): Promise<BenchmarkExecutionDetail> {
  const body = await getJson(
    at(options, `/benchmark-executions/${encodeURIComponent(executionId)}`),
    options,
  );

  if (!isBenchmarkExecutionDetail(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** One workflow to run against a benchmark. */
export interface BenchmarkRunStart {
  readonly benchmarkId: string;
  readonly workflowId: string;
}

/**
 * Runs a workflow against a benchmark, as a live run told case by case:
 * `POST {base}/live/benchmarks`. Its end carries the execution.
 */
export function startBenchmarkRun(
  { benchmarkId, workflowId }: BenchmarkRunStart,
  options: RequestOptions = {},
): Promise<LiveRun> {
  return liveRunOf(
    at(options, "/live/benchmarks"),
    JSON.stringify({ benchmark_id: benchmarkId, workflow_id: workflowId }),
    options,
  );
}

/** Workflows to compare against a benchmark, and the targets they are scored against. */
export interface ComparisonStart {
  readonly benchmarkId: string;
  readonly workflowIds: readonly string[];
  readonly targetLatencySeconds: number;
  readonly targetCostUsd: number;
}

/**
 * Compares workflows against a benchmark, as a live run told case by case:
 * `POST {base}/live/comparisons`. Its end carries the execution, best first.
 */
export function startComparison(
  { benchmarkId, workflowIds, targetLatencySeconds, targetCostUsd }: ComparisonStart,
  options: RequestOptions = {},
): Promise<LiveRun> {
  return liveRunOf(
    at(options, "/live/comparisons"),
    JSON.stringify({
      benchmark_id: benchmarkId,
      workflow_ids: workflowIds,
      target_latency_seconds: targetLatencySeconds,
      target_cost_usd: targetCostUsd,
    }),
    options,
  );
}

/** How many of a workflow's experiments the editor lists. */
export const EXPERIMENTS_LISTED = 20;

function experimentPath(experimentId: string, path = ""): string {
  return `/experiments/${encodeURIComponent(experimentId)}${path}`;
}

async function oneOf<T>(
  path: string,
  guard: (value: unknown) => value is T,
  options: RequestOptions,
): Promise<T> {
  const body = await getJson(at(options, path), options);

  if (!guard(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/**
 * Returns a workflow's experiments, newest first:
 * `GET {base}/workflows/{id}/experiments`, the newest `EXPERIMENTS_LISTED` of them.
 */
export function fetchWorkflowExperiments(
  workflowId: string,
  options: RequestOptions = {},
): Promise<ExperimentSummary[]> {
  return fetchItems(
    at(options, workflowPath(workflowId, `/experiments?limit=${String(EXPERIMENTS_LISTED)}`)),
    isExperimentSummary,
    options,
  );
}

/** Returns one experiment, its candidates ranked: `GET {base}/experiments/{id}`. */
export function fetchExperiment(
  experimentId: string,
  options: RequestOptions = {},
): Promise<ExperimentDetail> {
  return oneOf(experimentPath(experimentId), isExperimentDetail, options);
}

/**
 * Returns an experiment's winner beside what promoting it would replace, with
 * the saving and the projection: `GET {base}/experiments/{id}/compare`.
 */
export function fetchComparison(
  experimentId: string,
  options: RequestOptions = {},
): Promise<ExperimentComparison> {
  return oneOf(experimentPath(experimentId, "/compare"), isExperimentComparison, options);
}

/**
 * Returns whether an experiment's winner can still be promoted, and why not:
 * `GET {base}/experiments/{id}/promotable`. Nothing is saved.
 */
export function fetchPromotability(
  experimentId: string,
  options: RequestOptions = {},
): Promise<Promotability> {
  return oneOf(experimentPath(experimentId, "/promotable"), isPromotability, options);
}

/** A workflow to optimize against a benchmark, the targets it is scored against, and how long. */
export interface OptimizationStart {
  readonly workflowId: string;
  readonly benchmarkId: string;
  readonly targetLatencySeconds: number;
  readonly targetCostUsd: number;
  readonly generations: number;
}

/**
 * Optimizes a workflow against a benchmark, as a live run told generation by
 * generation: `POST {base}/live/optimizations`. Its end carries the session.
 */
export function startOptimization(
  { workflowId, benchmarkId, targetLatencySeconds, targetCostUsd, generations }: OptimizationStart,
  options: RequestOptions = {},
): Promise<LiveRun> {
  return liveRunOf(
    at(options, "/live/optimizations"),
    JSON.stringify({
      workflow_id: workflowId,
      benchmark_id: benchmarkId,
      target_latency_seconds: targetLatencySeconds,
      target_cost_usd: targetCostUsd,
      generations,
    }),
    options,
  );
}

/** What a spend report is asked of: its range, each time with its offset, and its choices. */
export interface SpendQuery {
  readonly since: string;
  readonly until: string;
  readonly period: SpendPeriod;
  readonly group: SpendGroup;
  readonly timeZone: string;
  readonly workflowId: string | null;
}

/**
 * Returns the query string that asks for a spend report, every value
 * encoded, so an offset's `+` never reaches the server as a space.
 */
export function spendSearch(query: SpendQuery): string {
  const search = new URLSearchParams({
    since: query.since,
    until: query.until,
    period: query.period,
    group: query.group,
    time_zone: query.timeZone,
  });

  if (query.workflowId !== null) {
    search.set("workflow_id", query.workflowId);
  }

  return `?${search.toString()}`;
}

/** Returns what an instance spent: `GET {base}/spend?...` (ADR 0014). */
export function fetchSpend(query: SpendQuery, options: RequestOptions = {}): Promise<SpendReport> {
  return oneOf(`/spend${spendSearch(query)}`, isSpendReport, options);
}

/** Returns where the same report is, as Azathoth writes it as CSV: `{base}/spend.csv?...`. */
export function spendCsvPath(query: SpendQuery, base: string = API_BASE): string {
  return `${base}/spend.csv${spendSearch(query)}`;
}
