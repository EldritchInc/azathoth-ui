import type { ComponentStatus, NamedRemote, RemoteStatus } from "../api/types";
import { SERVER, TOOL, WORKFLOW, answering, serving, urlOf, type Answers } from "./instances";

/** A remote named `origin`, whose token is set. */
export const ORIGIN: NamedRemote = {
  name: "origin",
  url: "https://azathoth.example.com",
  token_variable: "AZATHOTH_REMOTE_TOKEN",
  added_at: "2026-11-12T15:00:00Z",
  token_set: true,
};

/** A remote named `staging`, whose token variable is not set. */
export const STAGING: NamedRemote = {
  name: "staging",
  url: "https://staging.example.com",
  token_variable: "AZATHOTH_STAGING_TOKEN",
  added_at: "2026-11-12T15:05:00Z",
  token_set: false,
};

const A = "a".repeat(64);
const B = "b".repeat(64);

/** The summarize workflow, ahead here: revision 2 here, 1 there, 1 in production there. */
export const AHEAD: ComponentStatus = {
  lineage: { kind: "workflow", id: WORKFLOW.id, version: null },
  relation: "ahead",
  local_digest: B,
  local_number: 2,
  remote_digest: A,
  remote_number: 1,
  remote_production_digest: A,
};

/** The count_words tool, the same on both sides. */
export const IN_SYNC: ComponentStatus = {
  lineage: { kind: "tool", id: TOOL.id, version: TOOL.version },
  relation: "in_sync",
  local_digest: A,
  local_number: 1,
  remote_digest: A,
  remote_number: 1,
  remote_production_digest: null,
};

/** A workflow only the remote holds. */
export const THEIRS: ComponentStatus = {
  lineage: { kind: "workflow", id: "e3000000-0000-4000-8000-000000000001", version: null },
  relation: "remote_only",
  local_digest: null,
  local_number: null,
  remote_digest: B,
  remote_number: 3,
  remote_production_digest: null,
};

/** `origin`'s status, reached: one workflow ahead, one only there, a tool in sync, two models. */
export const REACHED: RemoteStatus = {
  remote: ORIGIN.url,
  reachable: true,
  components: [IN_SYNC, AHEAD, THEIRS],
  models: [
    { identifier: "openrouter/acme/large", authorized_locally: true, authorized_remotely: false },
    { identifier: "bedrock/zeta.mini-v1", authorized_locally: false, authorized_remotely: true },
  ],
  portfolio_synced_at: "2026-11-12T15:30:00Z",
};

/** `origin`'s status when it does not answer, its models from the last portfolio it gave. */
export const UNREACHED: RemoteStatus = {
  remote: ORIGIN.url,
  reachable: false,
  components: [{ ...AHEAD, relation: null, remote_digest: null, remote_number: null }],
  models: [
    { identifier: "openrouter/acme/large", authorized_locally: true, authorized_remotely: false },
  ],
  portfolio_synced_at: "2026-11-12T15:30:00Z",
};

/** The editor's answers with `origin` and `staging` named. */
export const REMOTES: Answers = {
  ...SERVER,
  "/api/remotes": [200, { items: [ORIGIN, STAGING] }],
  "/api/remotes/origin/status": [200, REACHED],
};

/** One request the fake server was sent. */
export interface Sent {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

/**
 * Returns a fetch that answers a `POST` from `posts` by its path, and every
 * other request as `answers` says, recording each request it was sent.
 */
export function recording(answers: Answers, posts: Answers, sent: Sent[]): typeof fetch {
  const server = serving(answers);

  return (input, init) => {
    const method = init?.method ?? "GET";
    const path = urlOf(input).pathname;
    const text = typeof init?.body === "string" ? init.body : null;

    sent.push({ method, path, body: text === null ? null : (JSON.parse(text) as unknown) });

    const posted = method === "POST" ? posts[path] : undefined;

    return posted === undefined ? server(input, init) : answering(posted[0], posted[1])(input);
  };
}
