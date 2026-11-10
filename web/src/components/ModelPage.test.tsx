import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import type { ComponentDetail } from "../api/types";
import { setRequirements } from "../editing";
import { uuid, VALID_DOCUMENT, WORKFLOW_DETAIL } from "../test/documents";
import {
  LARGE_ENTRY,
  LARGE_MODEL,
  LISTED_AT,
  REVIEW_WORKFLOW,
  SERVER,
  SMALL_MODEL,
  WORKFLOW,
  answering,
  serving,
  type Answers,
} from "../test/instances";
import { renderAt } from "../test/render";
import { ModelPage } from "./ModelPage";

const SUMMARIZE = uuid(12);

/** The first workflow: its prompt step needs vision, so only the large model meets it. */
const VISION: ComponentDetail = {
  ...WORKFLOW_DETAIL,
  document: setRequirements(VALID_DOCUMENT, SUMMARIZE, { required_capabilities: ["vision"] }),
};

/** The second workflow: its prompt step needs nothing past text. */
const PLAIN: ComponentDetail = {
  ...WORKFLOW_DETAIL,
  ...REVIEW_WORKFLOW,
  latest_number: 1,
  document: VALID_DOCUMENT,
};

const ANSWERS: Answers = {
  ...SERVER,
  [`/api/workflows/${WORKFLOW.id}`]: [200, VISION],
  [`/api/workflows/${REVIEW_WORKFLOW.id}`]: [200, PLAIN],
};

function open(path: string, answers: Answers = ANSWERS, fetcher?: typeof fetch) {
  renderAt(
    <Routes>
      <Route path="/models/*" element={<ModelPage />} />
    </Routes>,
    { path, answers, fetcher },
  );
}

describe("ModelPage", () => {
  it("shows everything known of a model, and that the local portfolio holds it", async () => {
    open("/models/openrouter/acme/large");

    expect(await screen.findByRole("heading", { level: 1, name: "Acme Large" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
      "Models/Acme Large",
    );
    expect(screen.getByText("openrouter/acme/large")).toBeInTheDocument();
    expect(screen.getByText("200K")).toBeInTheDocument();
    expect(screen.getByText("32K")).toBeInTheDocument();
    expect(screen.getByText("$15.00")).toBeInTheDocument();
    expect(screen.getByText("Vision")).toBeInTheDocument();
    expect(screen.getByText(LARGE_MODEL.command)).toBeInTheDocument();

    const panel = screen.getByRole("region", { name: "Local portfolio" });

    expect(panel).toHaveTextContent("In your local portfolio");
    expect(panel).toHaveTextContent("a shared server keeps its own");
    expect(
      within(panel).getByRole("button", { name: "Remove from local portfolio" }),
    ).toBeInTheDocument();
  });

  it("finds a model by an identifier with colons, and says what its provider does not publish", async () => {
    open("/models/bedrock/zeta.mini-v1");

    expect(await screen.findByRole("heading", { level: 1, name: "zeta.mini-v1" })).toBeVisible();
    expect(screen.getAllByText("Not published")).toHaveLength(4);
    expect(screen.getByText("None known")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Local portfolio" })).getByRole("button", {
        name: "Add to local portfolio",
      }),
    ).toBeInTheDocument();
  });

  it("lists the steps of local workflows whose needs the model meets", async () => {
    open("/models/openrouter/acme/small%3Afree");

    const uses = await screen.findByRole("region", { name: "Steps that could run on it" });

    await waitFor(() => {
      expect(within(uses).getByRole("link", { name: REVIEW_WORKFLOW.name })).toBeInTheDocument();
    });
    expect(within(uses).queryByRole("link", { name: WORKFLOW.name })).toBeNull();
    expect(within(uses).getByRole("link", { name: "Summarize" })).toHaveAttribute(
      "href",
      `/workflows/${REVIEW_WORKFLOW.id}?step=${SUMMARIZE}`,
    );
    expect(uses).toHaveTextContent("Add it to your local portfolio for them to choose it.");
  });

  it("lists every workflow a model with all that is asked could run in", async () => {
    open("/models/openrouter/acme/large");

    const uses = await screen.findByRole("region", { name: "Steps that could run on it" });

    await waitFor(() => {
      expect(within(uses).getAllByRole("link", { name: "Summarize" })).toHaveLength(2);
    });
    expect(uses).not.toHaveTextContent("Add it to your local portfolio");
  });

  it("adds the model to the local portfolio", async () => {
    let added: unknown = null;
    const fetcher: typeof fetch = (input, init) => {
      const path = new URL(input instanceof Request ? input.url : input.toString(), "http://x")
        .pathname;

      if (path === "/api/local/portfolio" && init?.method === "POST") {
        added = typeof init.body === "string" ? JSON.parse(init.body) : null;
        return answering(201, LARGE_ENTRY)(input, init);
      }
      return serving(ANSWERS)(input, init);
    };

    open("/models/openrouter/acme/small%3Afree", ANSWERS, fetcher);
    fireEvent.click(await screen.findByRole("button", { name: "Add to local portfolio" }));

    await waitFor(() => {
      expect(added).toEqual({ identifier: SMALL_MODEL.identifier });
    });
  });

  it("still shows a model the providers no longer serve while the local portfolio holds it", async () => {
    open("/models/openrouter/acme/large", {
      ...ANSWERS,
      "/api/models": [200, { items: [SMALL_MODEL], listed_at: LISTED_AT }],
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "openrouter/acme/large" }),
    ).toBeVisible();
    expect(screen.getByText(/your providers don't serve it now/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from local portfolio" })).toBeInTheDocument();
  });

  it("says when there is no model at an address", async () => {
    open("/models/openrouter/acme/gone");

    expect(await screen.findByText("No model at this address")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to models" })).toHaveAttribute("href", "/models");
  });

  it("says when some workflows could not be read", async () => {
    open("/models/openrouter/acme/large", {
      ...ANSWERS,
      [`/api/workflows/${WORKFLOW.id}`]: [500, { error: { code: "error", message: "Broken." } }],
    });

    expect(await screen.findByText("Some workflows couldn't be read")).toBeInTheDocument();
  });
});
