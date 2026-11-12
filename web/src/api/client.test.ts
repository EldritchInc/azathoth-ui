import { describe, expect, it } from "vitest";

import { WORKFLOW_DETAIL } from "../test/documents";
import {
  BENCHMARK,
  EDITOR,
  LARGE_ENTRY,
  LARGE_MODEL,
  LISTED_AT,
  SMALL_MODEL,
  SQLITE_INSTANCE,
  TOOL,
  WORKFLOW,
  answering,
} from "../test/instances";
import {
  ApiFailure,
  INVALID_RESPONSE_MESSAGE,
  UNREACHABLE_MESSAGE,
  addToPortfolio,
  fetchBenchmarks,
  fetchEditor,
  fetchInstance,
  fetchModel,
  fetchModels,
  fetchPortfolio,
  fetchTools,
  fetchWorkflows,
  getJson,
  importDocument,
  modelApiPath,
  removeFromPortfolio,
} from "./client";

async function failure(promise: Promise<unknown>): Promise<ApiFailure> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiFailure) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a failure");
}

describe("getJson", () => {
  it("asks the server for JSON with its cookie", async () => {
    const seen: [string, RequestInit | undefined][] = [];
    const fetcher: typeof fetch = (input, init) => {
      seen.push([input instanceof Request ? input.url : input.toString(), init]);
      return answering(200, { ok: true })(input, init);
    };

    expect(await getJson("/api/thing", { fetcher })).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toBe("/api/thing");
    expect(seen[0]?.[1]?.credentials).toBe("same-origin");
    expect(seen[0]?.[1]?.headers).toEqual({ accept: "application/json" });
    expect(seen[0]?.[1]?.method).toBe("GET");
    expect(seen[0]?.[1]?.body).toBeNull();
  });

  it("turns an API error into a failure with its code, message and status", async () => {
    const fetcher = answering(503, {
      error: { code: "instance_closed", message: "This Azathoth instance is closed." },
    });
    const error = await failure(getJson("/api/thing", { fetcher }));

    expect(error.code).toBe("instance_closed");
    expect(error.message).toBe("This Azathoth instance is closed.");
    expect(error.status).toBe(503);
  });

  it("calls a server that does not answer unreachable", async () => {
    const fetcher: typeof fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    const error = await failure(getJson("/api/thing", { fetcher }));

    expect(error.code).toBe("unreachable");
    expect(error.message).toBe(UNREACHABLE_MESSAGE);
    expect(error.status).toBeNull();
  });

  it("calls an error without the API's shape an invalid response", async () => {
    const fetcher: typeof fetch = () =>
      Promise.resolve(new Response("Bad Gateway", { status: 502 }));
    const error = await failure(getJson("/api/thing", { fetcher }));

    expect(error.code).toBe("invalid_response");
    expect(error.message).toBe(INVALID_RESPONSE_MESSAGE);
    expect(error.status).toBe(502);
  });

  it("calls JSON that is not the API's error an invalid response", async () => {
    const fetcher = answering(500, { detail: "Internal Server Error" });
    const error = await failure(getJson("/api/thing", { fetcher }));

    expect(error.code).toBe("invalid_response");
    expect(error.status).toBe(500);
  });

  it("lets an abort through as it is", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("Aborted", "AbortError");
    const fetcher: typeof fetch = () => {
      controller.abort();
      return Promise.reject(aborted);
    };

    await expect(getJson("/api/thing", { fetcher, signal: controller.signal })).rejects.toBe(
      aborted,
    );
  });
});

describe("fetchInstance", () => {
  it("returns the instance the server describes", async () => {
    const instance = await fetchInstance({ fetcher: answering(200, SQLITE_INSTANCE) });

    expect(instance).toEqual(SQLITE_INSTANCE);
  });

  it("refuses a description missing what the editor shows", async () => {
    const partial = Object.fromEntries(
      Object.entries(SQLITE_INSTANCE).filter(([key]) => key !== "schema_version"),
    );
    const error = await failure(fetchInstance({ fetcher: answering(200, partial) }));

    expect(error.code).toBe("invalid_response");
  });

  it("refuses a backend it does not know", async () => {
    const fetcher = answering(200, { ...SQLITE_INSTANCE, backend: "oracle" });

    expect((await failure(fetchInstance({ fetcher }))).code).toBe("invalid_response");
  });
});

describe("fetchEditor", () => {
  it("returns how the editor names its database in commands", async () => {
    expect(await fetchEditor({ fetcher: answering(200, EDITOR) })).toEqual(EDITOR);
  });

  it("refuses a shell it does not know", async () => {
    const fetcher = answering(200, { ...EDITOR, shell: "fish" });

    expect((await failure(fetchEditor({ fetcher }))).code).toBe("invalid_response");
  });

  it("refuses a provider it does not know, or no list of them", async () => {
    const unknown = answering(200, { ...EDITOR, providers: ["openrouter", "acme"] });
    const missing = answering(200, { ...EDITOR, providers: "openrouter" });

    expect((await failure(fetchEditor({ fetcher: unknown }))).code).toBe("invalid_response");
    expect((await failure(fetchEditor({ fetcher: missing }))).code).toBe("invalid_response");
  });
});

/** Returns a fetch that answers with one status and body, recording each request it gets. */
function recording(status: number, body: unknown) {
  const seen: { path: string; method: string; body: string | null }[] = [];
  const fetcher: typeof fetch = (input, init) => {
    seen.push({
      path: input instanceof Request ? input.url : input.toString(),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    return answering(status, body)(input, init);
  };

  return { seen, fetcher };
}

describe("the models", () => {
  it("are listed with when the providers were asked, again when refreshed", async () => {
    const listing = { items: [LARGE_MODEL, SMALL_MODEL], listed_at: LISTED_AT };
    const { seen, fetcher } = recording(200, listing);

    expect(await fetchModels({}, { fetcher })).toEqual(listing);
    expect(await fetchModels({ refresh: true }, { fetcher })).toEqual(listing);
    expect(seen.map((request) => request.path)).toEqual([
      "/api/models",
      "/api/models?refresh=true",
    ]);
  });

  it("refuse a listing with a model the editor cannot show", async () => {
    const broken = { ...LARGE_MODEL, context_window_tokens: "200K" };
    const fetcher = answering(200, { items: [broken], listed_at: LISTED_AT });

    expect((await failure(fetchModels({}, { fetcher }))).code).toBe("invalid_response");
    expect((await failure(fetchModels({}, { fetcher: answering(200, { items: [] }) }))).code).toBe(
      "invalid_response",
    );
  });

  it("are found one at a time by identifier, each part encoded", async () => {
    const { seen, fetcher } = recording(200, SMALL_MODEL);

    expect(await fetchModel(SMALL_MODEL.identifier, { fetcher })).toEqual(SMALL_MODEL);
    expect(seen[0]?.path).toBe("/api/models/openrouter/acme/small%3Afree");
    expect(modelApiPath("bedrock/zeta.mini-v1")).toBe("/api/models/bedrock/zeta.mini-v1");
  });
});

describe("the local portfolio", () => {
  it("is listed", async () => {
    const fetcher = answering(200, { items: [LARGE_ENTRY] });

    expect(await fetchPortfolio({ fetcher })).toEqual([LARGE_ENTRY]);
  });

  it("gains a model by posting its identifier", async () => {
    const { seen, fetcher } = recording(201, LARGE_ENTRY);

    expect(await addToPortfolio(LARGE_MODEL.identifier, { fetcher })).toEqual(LARGE_ENTRY);
    expect(seen).toEqual([
      {
        path: "/api/local/portfolio",
        method: "POST",
        body: JSON.stringify({ identifier: LARGE_MODEL.identifier }),
      },
    ]);
  });

  it("loses a model by posting its identifier, forced when asked", async () => {
    const removal = { identifier: LARGE_MODEL.identifier, dependents: [], command: "c" };
    const { seen, fetcher } = recording(200, removal);

    expect(await removeFromPortfolio(LARGE_MODEL.identifier, {}, { fetcher })).toEqual(removal);
    await removeFromPortfolio(LARGE_MODEL.identifier, { force: true }, { fetcher });

    expect(seen.map((request) => [request.path, request.method, request.body])).toEqual([
      [
        "/api/local/portfolio/remove",
        "POST",
        JSON.stringify({ identifier: LARGE_MODEL.identifier, force: false }),
      ],
      [
        "/api/local/portfolio/remove",
        "POST",
        JSON.stringify({ identifier: LARGE_MODEL.identifier, force: true }),
      ],
    ]);
  });

  it("says which workflows use a model it keeps", async () => {
    const dependents = [
      {
        workflow_id: WORKFLOW.id,
        workflow_name: "summarize",
        steps: [{ step_id: "s", role: "primary" }],
      },
    ];
    const fetcher = answering(409, {
      error: { code: "model_in_use", message: "In use.", dependents },
    });
    const error = await failure(removeFromPortfolio(LARGE_MODEL.identifier, {}, { fetcher }));

    expect([error.code, error.message, error.status]).toEqual(["model_in_use", "In use.", 409]);
    expect(error.details).toEqual({ dependents });
  });
});

describe("the lists", () => {
  it("return each kind's items", async () => {
    expect(await fetchWorkflows({ fetcher: answering(200, { items: [WORKFLOW] }) })).toEqual([
      WORKFLOW,
    ]);
    expect(await fetchTools({ fetcher: answering(200, { items: [TOOL] }) })).toEqual([TOOL]);
    expect(await fetchBenchmarks({ fetcher: answering(200, { items: [BENCHMARK] }) })).toEqual([
      BENCHMARK,
    ]);
  });

  it("ask for each kind at its own path", async () => {
    const seen: string[] = [];
    const fetcher: typeof fetch = (input, init) => {
      seen.push(input instanceof Request ? input.url : input.toString());
      return answering(200, { items: [] })(input, init);
    };

    await fetchWorkflows({ fetcher });
    await fetchTools({ fetcher });
    await fetchBenchmarks({ fetcher });

    expect(seen).toEqual(["/api/workflows", "/api/tools", "/api/benchmarks"]);
  });

  it("refuse a list that is not one", async () => {
    const error = await failure(fetchWorkflows({ fetcher: answering(200, [WORKFLOW]) }));

    expect(error.code).toBe("invalid_response");
  });

  it("refuse an item that is not its kind", async () => {
    const fetcher = answering(200, { items: [WORKFLOW] });

    expect((await failure(fetchTools({ fetcher }))).code).toBe("invalid_response");
    expect((await failure(fetchBenchmarks({ fetcher }))).code).toBe("invalid_response");
  });

  it("refuse a revision that is not whole", async () => {
    const broken = { ...WORKFLOW, revision: { ...WORKFLOW.revision, number: 1.5 } };
    const error = await failure(fetchWorkflows({ fetcher: answering(200, { items: [broken] }) }));

    expect(error.code).toBe("invalid_response");
  });
});

describe("importDocument", () => {
  it("posts the document as JSON to its kind's import, and returns the revision made", async () => {
    const seen: [string, RequestInit | undefined][] = [];
    const fetcher: typeof fetch = (input, init) => {
      seen.push([input instanceof Request ? input.url : input.toString(), init]);
      return answering(201, { created: true, workflow: WORKFLOW_DETAIL })(input, init);
    };

    expect(await importDocument("workflows", '{"steps": []}', { fetcher })).toEqual({
      created: true,
      detail: WORKFLOW_DETAIL,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toBe("/api/workflows/import");
    expect(seen[0]?.[1]?.method).toBe("POST");
    expect(seen[0]?.[1]?.body).toBe('{"steps": []}');
    expect(seen[0]?.[1]?.headers).toEqual({
      accept: "application/json",
      "content-type": "application/json",
    });
  });

  it("passes on what Azathoth says is wrong with a document", async () => {
    const fetcher = answering(422, {
      error: { code: "invalid_document", message: "Workflow document is not valid." },
    });
    const error = await failure(importDocument("tools", "{}", { fetcher }));

    expect(error.code).toBe("invalid_document");
    expect(error.message).toBe("Workflow document is not valid.");
  });

  it("reads an import that made no revision, under its kind's key", async () => {
    const fetcher = answering(200, { created: false, tool: WORKFLOW_DETAIL });

    expect(await importDocument("tools", "{}", { fetcher })).toEqual({
      created: false,
      detail: WORKFLOW_DETAIL,
    });
  });

  it.each([
    ["nothing", {}],
    ["a bare revision", WORKFLOW_DETAIL],
    ["another kind's key", { created: true, workflow: WORKFLOW_DETAIL }],
    ["no created", { benchmark: WORKFLOW_DETAIL }],
    ["a broken revision", { created: true, benchmark: { ...WORKFLOW_DETAIL, document: null } }],
  ])("refuses an answer that is %s", async (_, body) => {
    const error = await failure(
      importDocument("benchmarks", "{}", { fetcher: answering(201, body) }),
    );

    expect(error.code).toBe("invalid_response");
  });
});
