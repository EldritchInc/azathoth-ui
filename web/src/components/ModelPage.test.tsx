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
import type { Permissions } from "../permissions";
import { renderAt } from "../test/render";
import { DECLARED_ENTRY } from "../test/sensitivity";
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

function open(
  path: string,
  answers: Answers = ANSWERS,
  fetcher?: typeof fetch,
  permissions?: Permissions,
) {
  renderAt(
    <Routes>
      <Route path="/models/*" element={<ModelPage />} />
    </Routes>,
    { path, answers, fetcher, ...(permissions === undefined ? {} : { permissions }) },
  );
}

/** Returns the model page's policy section, once it shows. */
async function policy() {
  return within(await screen.findByRole("region", { name: "Data policy" }));
}

/** Opens the large model with a server that answers a declaration with `declared`. */
function declaring(declared: readonly [number, unknown] = [200, DECLARED_ENTRY]) {
  const sent: unknown[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const path = new URL(input instanceof Request ? input.url : input.toString(), "http://x")
      .pathname;

    if (path === "/api/local/portfolio/policy" && typeof init?.body === "string") {
      sent.push(JSON.parse(init.body));
      return answering(declared[0], declared[1])(input, init);
    }
    return serving(ANSWERS)(input, init);
  };

  open("/models/openrouter/acme/large", ANSWERS, fetcher);

  return sent;
}

/** Chooses one answer of the policy being declared. */
function answer(question: string, choice: string) {
  fireEvent.click(
    within(screen.getByRole("radiogroup", { name: question })).getByRole("radio", {
      name: choice,
    }),
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

  it("says a policy was never declared, so the model takes no restricted input", async () => {
    open("/models/openrouter/acme/large");

    const section = await policy();

    expect(await section.findByText("Never declared")).toBeVisible();
    expect(section.getAllByText("Not declared")).toHaveLength(2);
    expect(section.getByText("It may not receive restricted input.")).toBeVisible();
    expect(section.getByText(/never verified/)).toBeVisible();
  });

  it("says what was declared, by whom, and that it may then take restricted input", async () => {
    open("/models/openrouter/acme/large", {
      ...ANSWERS,
      "/api/local/portfolio": [200, { items: [DECLARED_ENTRY] }],
    });

    const section = await policy();

    expect(await section.findByText("Eris Discordia")).toBeVisible();
    expect(section.getAllByText("No")).toHaveLength(2);
    expect(section.getByText("It may receive restricted input.")).toBeVisible();
  });

  it("declares a policy once it is confirmed, naming the instance", async () => {
    const sent = declaring();

    fireEvent.click(await (await policy()).findByRole("button", { name: "Declare policy…" }));

    const confirm = within(screen.getByRole("group", { name: "Declare policy" }));

    expect(
      confirm.getByText("Declare the policy of openrouter/acme/large on your local instance?"),
    ).toBeVisible();
    expect(confirm.getByText("It may not receive restricted input then.")).toBeVisible();

    answer("Retains data", "No");
    answer("Trains on data", "No");

    expect(confirm.getByText("It may then receive every restricted run’s input.")).toBeVisible();
    expect(sent).toEqual([]);

    fireEvent.click(confirm.getByRole("button", { name: "Declare" }));

    expect(await screen.findByText("Policy declared.")).toBeVisible();
    expect(sent).toEqual([
      { identifier: LARGE_MODEL.identifier, retains_data: "no", trains_on_data: "no" },
    ]);
  });

  it("says why a policy wasn't declared", async () => {
    declaring([404, { error: { code: "not_found", message: "Model is not authorized." } }]);

    fireEvent.click(await (await policy()).findByRole("button", { name: "Declare policy…" }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Declare policy" })).getByRole("button", {
        name: "Declare",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Model is not authorized.");
  });

  it("won't declare a policy where it may not, and says why", async () => {
    open("/models/openrouter/acme/large", ANSWERS, undefined, (_instance, action) =>
      action === "declare_policy"
        ? { allowed: false, reason: "Only owners declare policy." }
        : { allowed: true },
    );

    const declare = await (await policy()).findByRole("button", { name: "Declare policy…" });

    expect(declare).toBeDisabled();
    expect(declare).toHaveAccessibleDescription("Only owners declare policy.");
  });

  it("offers no policy for a model the portfolio doesn't hold", async () => {
    open("/models/openrouter/acme/small%3Afree");

    const section = await policy();

    expect(
      section.getByText("Add it to your local portfolio first, then declare its policy."),
    ).toBeVisible();
    expect(section.queryByRole("button", { name: "Declare policy…" })).toBeNull();
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
