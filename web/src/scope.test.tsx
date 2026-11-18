import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fetchWorkflows, liveEventsPath, modelApiPath } from "./api/client";
import { ComponentList } from "./components/ComponentList";
import { detailApiPath, historyApiPath } from "./kinds";
import { LOCAL_SCOPE, pageOf, scoped, type InstanceScope } from "./scope";
import { REVIEW_WORKFLOW, SERVER, WORKFLOW, serving, urlOf } from "./test/instances";
import { renderAt } from "./test/render";

const STAGING: InstanceScope = {
  name: "staging",
  api: "/api/remotes/staging",
  pages: "/remotes/staging",
};

describe("pageOf", () => {
  it("puts the local instance's pages at the top", () => {
    expect(pageOf(LOCAL_SCOPE, "/")).toBe("/");
    expect(pageOf(LOCAL_SCOPE, "/workflows/w")).toBe("/workflows/w");
  });

  it("puts another instance's pages under its own", () => {
    expect(pageOf(STAGING, "/")).toBe("/remotes/staging");
    expect(pageOf(STAGING, "/workflows/w")).toBe("/remotes/staging/workflows/w");
  });
});

describe("scoped", () => {
  it("keeps a query under the instance's name", () => {
    expect(scoped(LOCAL_SCOPE, ["workflows", "list"])).toEqual(["local", "workflows", "list"]);
    expect(scoped(STAGING, ["workflows", "list"])).toEqual(["staging", "workflows", "list"]);
  });
});

describe("an instance's endpoints", () => {
  it("are the local instance's unless a base is given", () => {
    expect(detailApiPath("workflows", { id: "w" }, null)).toBe("/api/workflows/w");
    expect(modelApiPath("openrouter/acme/large")).toBe("/api/models/openrouter/acme/large");
    expect(liveEventsPath("h")).toBe("/api/live/h/events");
  });

  it("are another instance's under its base", () => {
    expect(detailApiPath("workflows", { id: "w" }, 2, STAGING.api)).toBe(
      "/api/remotes/staging/workflows/w?revision=2",
    );
    expect(historyApiPath("workflows", { id: "w" }, STAGING.api)).toMatch(
      /^\/api\/remotes\/staging\/workflows\/w\/history\?/,
    );
    expect(modelApiPath("openrouter/acme/large", STAGING.api)).toBe(
      "/api/remotes/staging/models/openrouter/acme/large",
    );
    expect(liveEventsPath("h", STAGING.api)).toBe("/api/remotes/staging/live/h/events");
  });

  it("are asked of the base a call is given", async () => {
    const asked: string[] = [];
    const answers = { "/api/remotes/staging/workflows": [200, { items: [WORKFLOW] }] } as const;
    const fetcher: typeof fetch = (input, init) => {
      asked.push(urlOf(input).pathname);

      return serving(answers)(input, init);
    };

    expect(await fetchWorkflows({ fetcher, base: STAGING.api })).toEqual([WORKFLOW]);
    expect(asked).toEqual(["/api/remotes/staging/workflows"]);
  });
});

describe("a page on another instance", () => {
  it("asks that instance, and only the editor's own endpoints at /api", async () => {
    const asked: string[] = [];
    const answers = {
      ...SERVER,
      "/api/remotes/staging/workflows": [200, { items: [REVIEW_WORKFLOW] }],
    } as const;
    const fetcher: typeof fetch = (input, init) => {
      asked.push(urlOf(input).pathname);

      return serving(answers)(input, init);
    };

    renderAt(<ComponentList kind="workflows" />, { fetcher, scope: STAGING });

    expect(await screen.findByText(REVIEW_WORKFLOW.name)).toBeVisible();
    expect(screen.queryByText(WORKFLOW.name)).toBeNull();
    expect(asked.length).toBeGreaterThan(0);
    expect(
      asked.filter(
        (path) =>
          !path.startsWith(`${STAGING.api}/`) && path !== "/api/editor" && path !== "/api/remotes",
      ),
    ).toEqual([]);
  });
});

const SOURCES = import.meta.glob<string>(
  ["./**/*.ts", "./**/*.tsx", "!./**/*.test.*", "!./test/**"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);

describe("the web app's sources", () => {
  it("are read here", () => {
    expect(Object.keys(SOURCES)).toContain("./queries.ts");
  });

  it("write an API path only in the client, which takes each instance's from its base", () => {
    const writing = Object.entries(SOURCES)
      .filter(([path, text]) => path !== "./api/client.ts" && /["`]\/api\//.test(text))
      .map(([path]) => path);

    expect(writing).toEqual([]);
  });
});
