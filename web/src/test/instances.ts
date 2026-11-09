import type {
  BenchmarkSummary,
  EditorDescription,
  InstanceDescription,
  ToolSummary,
  WorkflowSummary,
} from "../api/types";

/** An SQLite instance, as `GET /api/instance` describes it. */
export const SQLITE_INSTANCE: InstanceDescription = {
  database: "/Users/eris/Library/Application Support/Azathoth/ui.db",
  backend: "sqlite",
  azathoth_version: "1.4.0a1",
  schema_version: 2,
  api_stability: "provisional",
};

/** The editor, as `GET /api/editor` describes it on macOS. */
export const EDITOR: EditorDescription = {
  version: "1.4.0.dev0",
  shell: "posix",
  command_prefix: "AZATHOTH_DATABASE='/Users/eris/Library/Application Support/Azathoth/ui.db' ",
};

/** A workflow imported twice, identically. */
export const WORKFLOW: WorkflowSummary = {
  id: "a1000000-0000-4000-8000-000000000001",
  name: "summarize",
  version: "1.0.0",
  description: "Summarize a text in one sentence.",
  revision: {
    number: 2,
    content_digest: "50a55979a67a7105abce50131b692a1aa94d55d274866f283de2f8be9f80a58e",
    imported_at: "2026-11-08T23:58:45.171349Z",
    identical_to: 1,
  },
  command: "azathoth workflow show a1000000-0000-4000-8000-000000000001",
};

/** A second workflow, imported once. */
export const REVIEW_WORKFLOW: WorkflowSummary = {
  id: "d2000000-0000-4000-8000-000000000010",
  name: "review change",
  version: "1.2.0",
  description: "Review a code change with three reviewers at once.",
  revision: {
    number: 1,
    content_digest: "7d0c51c0b0d1cbd1a2f9c3e43b8f6f0b5c1b7a3e9b4c2d1e0f9a8b7c6d5e4f3a",
    imported_at: "2026-11-07T15:00:00Z",
    identical_to: null,
  },
  command: "azathoth workflow show d2000000-0000-4000-8000-000000000010",
};

/** A tool version with one implementation. */
export const TOOL: ToolSummary = {
  id: "a2000000-0000-4000-8000-000000000001",
  name: "count_words",
  version: "1.0.0",
  description: "Count the words in a text.",
  revision: {
    number: 1,
    content_digest: "bd2af2a373bd220f04450aa6e3a6bbf82310fd634b7c83fb4f46645d10e4241e",
    imported_at: "2026-11-08T23:58:45.164227Z",
    identical_to: null,
  },
  implementation_count: 1,
  test_case_count: 3,
  command: "azathoth tool show a2000000-0000-4000-8000-000000000001 --version 1.0.0",
};

/** A benchmark with one case. */
export const BENCHMARK: BenchmarkSummary = {
  id: "b1000000-0000-4000-8000-000000000001",
  name: "word count",
  version: "1.0.0",
  description: "Count the words in a text.",
  case_count: 1,
  revision: {
    number: 1,
    content_digest: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0",
    imported_at: "2026-11-08T23:58:45.180000Z",
    identical_to: null,
  },
  command: "azathoth benchmark show b1000000-0000-4000-8000-000000000001",
};

/** Returns a fetch that answers every request with one status and JSON body. */
export function answering(status: number, body: unknown): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}

/** What a fake server answers each path with: a status and a JSON body. */
export type Answers = Readonly<Record<string, readonly [number, unknown]>>;

/** The answers of an editor whose instance holds one workflow, one tool and one benchmark. */
export const SERVER: Answers = {
  "/api/instance": [200, SQLITE_INSTANCE],
  "/api/editor": [200, EDITOR],
  "/api/workflows": [200, { items: [WORKFLOW, REVIEW_WORKFLOW] }],
  "/api/tools": [200, { items: [TOOL] }],
  "/api/benchmarks": [200, { items: [BENCHMARK] }],
};

/** Returns a fetch that answers each path as `answers` says, and 404 for any other. */
export function serving(answers: Answers): typeof fetch {
  return (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    const path = new URL(url, "http://127.0.0.1").pathname;
    const [status, body] = answers[path] ?? [
      404,
      { error: { code: "not_found", message: `No API endpoint at ${path}.` } },
    ];

    return answering(status, body)(input);
  };
}
