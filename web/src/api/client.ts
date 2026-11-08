/**
 * The editor's client of its own server's JSON API.
 *
 * Every failure is an `ApiFailure` with a stable code: the API's own codes,
 * `unreachable` when the server does not answer, and `invalid_response` when
 * it answers with something the editor cannot read. An abort is passed on as
 * it is, so a caller that gave up can tell.
 */

import { isErrorBody, isInstanceDescription, type InstanceDescription } from "./types";

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
