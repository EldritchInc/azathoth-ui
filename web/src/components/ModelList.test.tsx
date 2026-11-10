import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import type { ModelSummary } from "../api/types";
import {
  BEDROCK_MODEL,
  EDITOR,
  LARGE_MODEL,
  LISTED_AT,
  SERVER,
  SMALL_MODEL,
  WORKFLOW,
  answering,
  serving,
} from "../test/instances";
import { renderAt } from "../test/render";
import { ModelList } from "./ModelList";

const MODELS: readonly ModelSummary[] = [LARGE_MODEL, SMALL_MODEL, BEDROCK_MODEL];

const DEPENDENTS = [
  {
    workflow_id: WORKFLOW.id,
    workflow_name: WORKFLOW.name,
    steps: [{ step_id: "00000000-0000-4000-8000-000000000012", role: "primary" }],
  },
];

interface Sent {
  readonly path: string;
  readonly method: string;
  readonly body: unknown;
}

/**
 * A server whose local portfolio changes as the editor asks: it holds the
 * models `held` names, and production uses those `inUse` names.
 */
function portfolioServer({
  held = [LARGE_MODEL.identifier],
  inUse = [],
  editor = EDITOR,
}: {
  readonly held?: readonly string[];
  readonly inUse?: readonly string[];
  readonly editor?: typeof EDITOR;
} = {}) {
  const portfolio = new Set(held);
  const sent: Sent[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString(), "http://x");
    const method = init?.method ?? "GET";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const identifier =
      typeof body === "object" &&
      body !== null &&
      "identifier" in body &&
      typeof body.identifier === "string"
        ? body.identifier
        : "";
    const force = typeof body === "object" && body !== null && "force" in body && body.force;

    sent.push({ path: `${url.pathname}${url.search}`, method, body });

    if (url.pathname === "/api/editor") {
      return answering(200, editor)(input, init);
    }
    if (url.pathname === "/api/models") {
      return answering(200, {
        items: MODELS.map((model) => ({ ...model, authorized: portfolio.has(model.identifier) })),
        listed_at: LISTED_AT,
      })(input, init);
    }
    if (url.pathname === "/api/local/portfolio" && method === "POST") {
      portfolio.add(identifier);
      return answering(201, { identifier, provider: "p", model: "m", command: "c" })(input, init);
    }
    if (url.pathname === "/api/local/portfolio/remove") {
      if (inUse.includes(identifier) && force !== true) {
        return answering(409, {
          error: { code: "model_in_use", message: "In use.", dependents: DEPENDENTS },
        })(input, init);
      }
      portfolio.delete(identifier);
      return answering(200, { identifier, dependents: [], command: "c" })(input, init);
    }
    return serving(SERVER)(input, init);
  };

  return { fetcher, sent, portfolio };
}

function Where() {
  const location = useLocation();

  return <output aria-label="Address">{`${location.pathname}${location.search}`}</output>;
}

function open(path = "/models", server = portfolioServer()) {
  renderAt(
    <>
      <ModelList />
      <Where />
    </>,
    { path, fetcher: server.fetcher },
  );
  return server;
}

/** Returns the names of the models the table shows, in its order. */
function shownNames(): string[] {
  const table = screen.getByRole("table");

  return within(table)
    .getAllByRole("link")
    .map((link) => link.textContent);
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByRole("link", { name }).closest("tr");

  if (row === null) {
    throw new Error(`No row for ${name}`);
  }
  return row;
}

function toggle(name: string): HTMLElement {
  return screen.getByRole("button", { name: `${name} in your local portfolio` });
}

describe("ModelList", () => {
  it("lists what the providers serve, unknowns said as such, marked by the local portfolio", async () => {
    open();

    expect(await screen.findByRole("link", { name: "Acme Large" })).toHaveAttribute(
      "href",
      "/models/openrouter/acme/large",
    );
    expect(shownNames()).toEqual(["Acme Large", "Acme Small (free)", "zeta.mini-v1"]);

    const large = within(rowOf("Acme Large"));
    const bedrock = within(rowOf("zeta.mini-v1"));

    expect(large.getByText("200K")).toBeInTheDocument();
    expect(large.getByText("$3.00")).toBeInTheDocument();
    expect(large.getByText("Images")).toBeInTheDocument();
    expect(large.getByText("Tool use")).toBeInTheDocument();
    expect(bedrock.getAllByText("unknown")).toHaveLength(3);
    expect(bedrock.getByText("none known")).toBeInTheDocument();
    expect(toggle("Acme Large")).toHaveAttribute("aria-pressed", "true");
    expect(toggle("Acme Small (free)")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("3 models · 1 in your local portfolio")).toBeInTheDocument();
    expect(screen.getByText(/^Asked/)).toBeInTheDocument();
  });

  it("filters by what is typed, keeping the filter in the address", async () => {
    open();

    fireEvent.change(await screen.findByRole("searchbox", { name: "Filter models" }), {
      target: { value: "acme free" },
    });

    expect(shownNames()).toEqual(["Acme Small (free)"]);
    expect(screen.getByText("1 of 3 models · 1 in your local portfolio")).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toHaveTextContent("/models?q=acme+free");
  });

  it("narrows to what the models read and can do, and to the local portfolio", async () => {
    open();
    const reads = within(await screen.findByRole("group", { name: "Reads" }));

    fireEvent.click(reads.getByRole("button", { name: "Images" }));

    expect(reads.getByRole("button", { name: "Images" })).toHaveAttribute("aria-pressed", "true");
    expect(shownNames()).toEqual(["Acme Large"]);

    fireEvent.click(reads.getByRole("button", { name: "Images" }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Can" })).getByRole("button", {
        name: "Streaming",
      }),
    );

    expect(shownNames()).toEqual(["Acme Small (free)"]);

    fireEvent.click(screen.getByRole("button", { name: "Clear the filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Only my local portfolio" }));

    expect(shownNames()).toEqual(["Acme Large"]);
    expect(screen.getByLabelText("Address")).toHaveTextContent("/models?mine=1");
  });

  it("opens filtered as its address says, by provider, context and price", async () => {
    open("/models?context=32000&input=1");

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(shownNames()).toEqual(["Acme Small (free)"]);
    expect(screen.getByRole("combobox", { name: "Context" })).toHaveValue("32000");
    expect(screen.getByRole("combobox", { name: "Input price" })).toHaveValue("1");

    fireEvent.change(screen.getByRole("combobox", { name: "Context" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Input price" }), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), {
      target: { value: "bedrock" },
    });

    expect(shownNames()).toEqual(["zeta.mini-v1"]);
  });

  it("orders the models as asked", async () => {
    open();

    fireEvent.change(await screen.findByRole("combobox", { name: "Order" }), {
      target: { value: "context" },
    });

    expect(shownNames()).toEqual(["Acme Large", "Acme Small (free)", "zeta.mini-v1"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Order" }), {
      target: { value: "input" },
    });

    expect(shownNames()).toEqual(["Acme Small (free)", "Acme Large", "zeta.mini-v1"]);
    expect(screen.getByLabelText("Address")).toHaveTextContent("/models?sort=input");
  });

  it("says when no model matches, and clears the filters", async () => {
    open("/models?q=nothing&sort=context");

    expect(await screen.findByText("No models match")).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole("note")).getByRole("button", { name: "Clear the filters" }),
    );

    expect(shownNames()).toHaveLength(3);
    expect(screen.getByLabelText("Address")).toHaveTextContent("/models?sort=context");
  });

  it("adds a model to the local portfolio, and removes one", async () => {
    const server = open();

    fireEvent.click(
      await screen.findByRole("button", { name: "Acme Small (free) in your local portfolio" }),
    );

    await waitFor(() => {
      expect(toggle("Acme Small (free)")).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.getByText("3 models · 2 in your local portfolio")).toBeInTheDocument();

    fireEvent.click(toggle("Acme Large"));

    await waitFor(() => {
      expect(toggle("Acme Large")).toHaveAttribute("aria-pressed", "false");
    });
    expect(server.sent.filter((request) => request.method === "POST")).toEqual([
      {
        path: "/api/local/portfolio",
        method: "POST",
        body: { identifier: SMALL_MODEL.identifier },
      },
      {
        path: "/api/local/portfolio/remove",
        method: "POST",
        body: { identifier: LARGE_MODEL.identifier, force: false },
      },
    ]);
  });

  it("keeps a model local production uses until it is removed anyway", async () => {
    const server = open("/models", portfolioServer({ inUse: [LARGE_MODEL.identifier] }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Acme Large in your local portfolio" }),
    );

    const refusal = await screen.findByRole("alert");

    expect(refusal).toHaveTextContent("Acme Large is used by production in this local instance");
    expect(refusal).toHaveTextContent("Nothing changes on a shared server");
    expect(within(refusal).getByRole("link", { name: WORKFLOW.name })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW.id}`,
    );
    expect(refusal).toHaveTextContent("1 step");
    expect(toggle("Acme Large")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(refusal).getByRole("button", { name: "Remove anyway" }));

    await waitFor(() => {
      expect(toggle("Acme Large")).toHaveAttribute("aria-pressed", "false");
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(server.sent.filter((request) => request.method === "POST").at(-1)?.body).toEqual({
      identifier: LARGE_MODEL.identifier,
      force: true,
    });
  });

  it("keeps a model when asked to, after a refusal", async () => {
    open("/models", portfolioServer({ inUse: [LARGE_MODEL.identifier] }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Acme Large in your local portfolio" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Keep it" }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(toggle("Acme Large")).toHaveAttribute("aria-pressed", "true");
  });

  it("asks the providers again when refreshed", async () => {
    const server = open();

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(server.sent.map((request) => request.path)).toContain("/api/models?refresh=true");
    });
  });

  it("says how to turn a provider on when none is", async () => {
    open("/models", portfolioServer({ editor: { ...EDITOR, providers: [] } }));

    expect(await screen.findByText("No providers are turned on")).toBeInTheDocument();
    expect(screen.getByText(/export OPENROUTER_API_KEY=/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  it("says when the providers cannot be asked", async () => {
    renderAt(<ModelList />, {
      path: "/models",
      answers: {
        ...SERVER,
        "/api/models": [
          502,
          { error: { code: "provider_unavailable", message: "OpenRouter did not answer." } },
        ],
      },
    });

    const problem = await screen.findByRole("alert");

    expect(problem).toHaveTextContent("Couldn't list the models");
    expect(problem).toHaveTextContent("OpenRouter did not answer.");
  });
});
