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
  isComponentDetail,
  isEditorDescription,
  isErrorBody,
  isInstanceDescription,
  isSummary,
  isToolSummary,
  itemsOf,
  type BenchmarkSummary,
  type ComponentDetail,
  type EditorDescription,
  type InstanceDescription,
  type Summary,
  type ToolSummary,
  type WorkflowSummary,
} from "./types";

export const UNREACHABLE_MESSAGE = "The editor's server isn't answering.";

export const INVALID_RESPONSE_MESSAGE = "The editor's server sent an answer the editor can't read.";

/** A request to the server that did not get the answer it asked for. */
export class ApiFailure extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, message: string, status: number | null) {
    super(message);
    this.name = "ApiFailure";
    this.code = code;
    this.status = status;
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

/** Returns the JSON one API path answers with, or throws an `ApiFailure`. */
export async function getJson(path: string, options: RequestOptions = {}): Promise<unknown> {
  const { fetcher = browserFetch, signal } = options;
  let response: Response;

  try {
    response = await fetcher(path, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
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
      throw new ApiFailure(body.error.code, body.error.message, response.status);
    }
    throw new ApiFailure("invalid_response", INVALID_RESPONSE_MESSAGE, response.status);
  }

  return body;
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
