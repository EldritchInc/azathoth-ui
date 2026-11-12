/**
 * The editor's client of its own server's JSON API.
 *
 * Every failure is an `ApiFailure` with a stable code: the API's own codes,
 * `unreachable` when the server does not answer, and `invalid_response` when
 * it answers with something the editor cannot read. An abort is passed on as
 * it is, so a caller that gave up can tell.
 */

import {
  isBenchmarkSummary,
  importOf,
  isComponentDetail,
  isEditorDescription,
  isErrorBody,
  isInstanceDescription,
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
  isRemoteStatus,
  isSummary,
  isToolSummary,
  itemsOf,
  type BenchmarkSummary,
  type ComponentDetail,
  type ComponentImport,
  type EditorDescription,
  type InstanceDescription,
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
  type RemoteStatus,
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

/** How one request is made: the fetch to use, and a signal to give up on it. */
export interface RequestOptions {
  readonly fetcher?: typeof fetch;
  readonly signal?: AbortSignal;
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

/** Returns the instance the editor serves: `GET /api/instance`. */
export async function fetchInstance(options: RequestOptions = {}): Promise<InstanceDescription> {
  const body = await getJson("/api/instance", options);

  if (!isInstanceDescription(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** Returns the editor and how its commands name its database: `GET /api/editor`. */
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
  return fetchItems("/api/workflows", isSummary, options);
}

/** Returns every tool version in the editor's instance, at its latest revision. */
export function fetchTools(options: RequestOptions = {}): Promise<ToolSummary[]> {
  return fetchItems("/api/tools", isToolSummary, options);
}

/** Returns every benchmark in the editor's instance, at its latest revision. */
export function fetchBenchmarks(options: RequestOptions = {}): Promise<BenchmarkSummary[]> {
  return fetchItems("/api/benchmarks", isBenchmarkSummary, options);
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
    `/api/${kind}/import`,
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
export function modelApiPath(identifier: string): string {
  return `/api/models/${identifier.split("/").map(encodeURIComponent).join("/")}`;
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
  const body = await getJson(refresh ? "/api/models?refresh=true" : "/api/models", options);

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
  const body = await getJson(modelApiPath(identifier), options);

  if (!isModelSummary(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 200);
  }

  return body;
}

/** Returns the models the local portfolio authorizes: `GET /api/local/portfolio`. */
export function fetchPortfolio(options: RequestOptions = {}): Promise<PortfolioEntry[]> {
  return fetchItems("/api/local/portfolio", isPortfolioEntry, options);
}

/** Adds one model to the local portfolio: `POST /api/local/portfolio`. */
export async function addToPortfolio(
  identifier: string,
  options: RequestOptions = {},
): Promise<PortfolioEntry> {
  const body = await requestJson(
    "/api/local/portfolio",
    { method: "POST", body: JSON.stringify({ identifier }) },
    options,
  );

  if (!isPortfolioEntry(body)) {
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, 201);
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
    "/api/local/portfolio/remove",
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

/** Returns the body that starts a run of a workflow, given what it is given. */
export function startBody(workflowId: string, given: RunGiven): Record<string, unknown> {
  switch (given.kind) {
    case "json":
      return { workflow_id: workflowId, input: given.value };
    case "file":
      return { workflow_id: workflowId, file: given.file };
    case "none":
      return { workflow_id: workflowId };
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

/** Starts a live run of a workflow: `POST /api/live/runs`. Returns it, running. */
export function startRun(
  workflowId: string,
  given: RunGiven,
  options: RequestOptions = {},
): Promise<LiveRun> {
  return liveRunOf("/api/live/runs", JSON.stringify(startBody(workflowId, given)), options);
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
}

/** Starts trying one step alone: `POST /api/live/steps`. Returns its live run, running. */
export function startTrial(start: TrialStart, options: RequestOptions = {}): Promise<LiveRun> {
  return liveRunOf("/api/live/steps", JSON.stringify(start), options);
}

/** Returns one live run: `GET /api/live/{handle}`. */
export function fetchLiveRun(handle: string, options: RequestOptions = {}): Promise<LiveRun> {
  return liveRunOf(`/api/live/${encodeURIComponent(handle)}`, undefined, options);
}

/** Returns every live run the editor remembers, newest first: `GET /api/live`. */
export function fetchLiveRuns(options: RequestOptions = {}): Promise<LiveRun[]> {
  return fetchItems("/api/live", isLiveRun, options);
}

/** Asks a live run to stop: `POST /api/live/{handle}/cancel`. Returns it as it stands. */
export function cancelLiveRun(handle: string, options: RequestOptions = {}): Promise<LiveRun> {
  return liveRunOf(`/api/live/${encodeURIComponent(handle)}/cancel`, "{}", options);
}

/** Returns the path of a live run's event stream. */
export function liveEventsPath(handle: string): string {
  return `/api/live/${encodeURIComponent(handle)}/events`;
}

/** How many of a workflow's runs the editor lists at once. */
export const RUNS_LISTED = 20;

/** Returns a workflow's kept runs, newest first: `GET /api/workflows/{id}/runs`. */
export function fetchWorkflowRuns(
  workflowId: string,
  options: RequestOptions = {},
): Promise<RunSummary[]> {
  return fetchItems(
    `/api/workflows/${encodeURIComponent(workflowId)}/runs?limit=${String(RUNS_LISTED)}`,
    isRunSummary,
    options,
  );
}

/** Returns one kept run with its steps: `GET /api/runs/{run_id}`. */
export async function fetchRun(runId: string, options: RequestOptions = {}): Promise<RunDetail> {
  const body = await getJson(`/api/runs/${encodeURIComponent(runId)}`, options);

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
    "/api/workflows/check",
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
 */
export async function fetchReadiness(
  document: unknown,
  options: RequestOptions = {},
): Promise<WorkflowReadiness> {
  const body = await requestJson(
    "/api/workflows/readiness",
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
 */
export async function matchModels(
  requirements: Readonly<Record<string, unknown>>,
  options: RequestOptions = {},
): Promise<ModelSummary[]> {
  const body = await requestJson(
    "/api/models/matching",
    { method: "POST", body: JSON.stringify({ requirements }) },
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
