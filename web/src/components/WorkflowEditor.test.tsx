import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { ComponentDetail, DocumentProblem, WorkflowCheck } from "../api/types";
import { draftKey, readDraft, saveDraft } from "../drafts";
import {
  asObject,
  asText,
  idOf,
  isObject,
  setMetadata,
  stepsOf,
  type JsonObject,
  type JsonValue,
} from "../editing";
import { answering, SERVER, urlOf, type Answers } from "../test/instances";
import { uuid, VALID_DOCUMENT, WORKFLOW_DETAIL } from "../test/documents";
import { NOT_READY, READY } from "../test/runs";
import { NewWorkflow, WorkflowEditor } from "./WorkflowEditor";

const ID = uuid(1);

const DETAIL: ComponentDetail = {
  ...WORKFLOW_DETAIL,
  id: ID,
  name: "summarize ticket",
  document: VALID_DOCUMENT,
};

const SAVED: ComponentDetail = {
  ...DETAIL,
  revision: { ...DETAIL.revision, number: 4 },
  latest_number: 4,
};

interface Sent {
  readonly path: string;
  readonly method: string;
  readonly body: string | null;
}

function Where() {
  const location = useLocation();

  return <output aria-label="Address">{`${location.pathname}${location.search}`}</output>;
}

const EMPTY = "String should have at least 1 character";

/** Returns a JSON body sent, as an object. */
function parsed(body: string | null): JsonObject {
  return asObject(JSON.parse(body ?? "null") as JsonValue);
}

/**
 * A stand-in for Azathoth's `workflows.check`: it refuses an empty
 * description, and a prompt step with no prompt.
 */
function judged(document: JsonObject): WorkflowCheck {
  const problems: DocumentProblem[] = [];

  if (asText(asObject(document.metadata).description) === "") {
    problems.push({ message: EMPTY, location: ["metadata", "description"], step_id: null });
  }
  stepsOf(document).forEach((step, index) => {
    const template = asObject(step.specification).template;

    if (isObject(template) && asText(template.text) === "") {
      problems.push({
        message: EMPTY,
        location: ["steps", index, "specification", "template", "text"],
        step_id: idOf(step),
      });
    }
  });
  return { valid: problems.length === 0, problems };
}

/** Renders the editor's pages at one address, recording every request the editor sends. */
function open(path: string, answers: Answers = {}): Sent[] {
  const sent: Sent[] = [];
  const all: Answers = { ...SERVER, [`/api/workflows/${ID}`]: [200, DETAIL], ...answers };

  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    const body = typeof init?.body === "string" ? init.body : null;

    sent.push({ path: url.pathname, method: init?.method ?? "GET", body });

    if (url.pathname === "/api/workflows/check" && !(url.pathname in answers)) {
      return answering(200, judged(parsed(body)))(input, init);
    }

    const [status, answer] = all[url.pathname] ?? [
      404,
      { error: { code: "not_found", message: `No workflow with id ${url.pathname}.` } },
    ];

    return answering(status, answer)(input, init);
  });

  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/workflows" element={<p>The workflows</p>} />
          <Route path="/workflows/new" element={<NewWorkflow makeId={ids()} />} />
          <Route path="/workflows/:id" element={<p>The workflow&apos;s page</p>} />
          <Route path="/workflows/:id/edit" element={<WorkflowEditor />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return sent;
}

function ids(): () => string {
  let next = 100;

  return () => {
    next += 1;
    return uuid(next);
  };
}

function nameField(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>("textbox", { name: "Name" });
}

function status(): HTMLElement {
  return within(screen.getByRole("toolbar", { name: "Editing" })).getByText(
    /^(Unsaved|Saved|Not saved|Saving)/,
  );
}

describe("WorkflowEditor", () => {
  it("opens a workflow's latest revision, with nothing to save or fix", async () => {
    open(`/workflows/${ID}/edit`);

    expect(await screen.findByDisplayValue("summarize ticket")).toBe(nameField());
    expect(status()).toHaveTextContent("Saved as revision 3");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(await screen.findByRole("heading", { name: "Ready to save" })).toBeInTheDocument();
    expect(screen.getByText("Azathoth finds nothing it would refuse.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
      "Summarize a ticket's text.",
    );
    expect(screen.getByRole("textbox", { name: "Version" })).toHaveValue("1.0.0");
  });

  it("keeps an edit in this browser, and undoes and redoes it", async () => {
    open(`/workflows/${ID}/edit`);

    fireEvent.change(await screen.findByDisplayValue("summarize ticket"), {
      target: { value: "summarize tickets" },
    });

    expect(status()).toHaveTextContent("Unsaved changes, kept in this browser");
    expect(readDraft(window.localStorage, ID)).toEqual({
      document: setMetadata(VALID_DOCUMENT, { name: "summarize tickets" }),
      base: 3,
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(nameField()).toHaveValue("summarize ticket");
    expect(status()).toHaveTextContent("Saved as revision 3");
    expect(window.localStorage.getItem(draftKey(ID))).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));

    expect(nameField()).toHaveValue("summarize tickets");
  });

  it("undoes the letters typed into one field as one change", async () => {
    open(`/workflows/${ID}/edit`);
    const field = await screen.findByDisplayValue("summarize ticket");

    fireEvent.change(field, { target: { value: "summarize ticket!" } });
    fireEvent.change(field, { target: { value: "summarize ticket!!" } });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(nameField()).toHaveValue("summarize ticket");
  });

  it("saves the document as the workflow's next revision", async () => {
    const sent = open(`/workflows/${ID}/edit`, { "/api/workflows/import": [201, SAVED] });

    fireEvent.change(await screen.findByDisplayValue("summarize ticket"), {
      target: { value: "summarize tickets" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("link", { name: "View it" })).toBeInTheDocument();
    expect(status()).toHaveTextContent("Saved as revision 4");
    expect(screen.getByRole("note")).toHaveTextContent("Saved as revision 4");
    expect(screen.getByRole("link", { name: "View it" })).toHaveAttribute(
      "href",
      `/workflows/${ID}?revision=4`,
    );
    expect(window.localStorage.getItem(draftKey(ID))).toBeNull();

    const imported = sent.find((request) => request.path === "/api/workflows/import");

    expect(imported?.method).toBe("POST");
    expect(JSON.parse(imported?.body ?? "null")).toEqual(
      setMetadata(VALID_DOCUMENT, { name: "summarize tickets" }),
    );
  });

  it("shows Azathoth's refusal, and keeps the edits", async () => {
    open(`/workflows/${ID}/edit`, {
      "/api/workflows/import": [
        422,
        {
          error: {
            code: "invalid_document",
            message: "Workflow step identifiers must be unique.",
          },
        },
      ],
    });

    fireEvent.change(await screen.findByDisplayValue("summarize ticket"), {
      target: { value: "other" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const refusal = await screen.findByRole("alert");

    expect(refusal).toHaveTextContent("Azathoth refused this workflow");
    expect(refusal).toHaveTextContent("Workflow step identifiers must be unique.");
    expect(status()).toHaveTextContent("Unsaved changes, kept in this browser");
    expect(readDraft(window.localStorage, ID)?.document).toEqual(
      setMetadata(VALID_DOCUMENT, { name: "other" }),
    );
  });

  it("saves with ⌘S, undoes with ⌘Z and redoes with ⇧⌘Z", async () => {
    const sent = open(`/workflows/${ID}/edit`, { "/api/workflows/import": [201, SAVED] });

    fireEvent.change(await screen.findByDisplayValue("summarize ticket"), {
      target: { value: "x" },
    });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(nameField()).toHaveValue("summarize ticket");
    fireEvent.keyDown(window, { key: "Z", metaKey: true, shiftKey: true });
    expect(nameField()).toHaveValue("x");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    await waitFor(() => {
      expect(sent.some((request) => request.path === "/api/workflows/import")).toBe(true);
    });
    expect(await screen.findByRole("link", { name: "View it" })).toBeInTheDocument();
  });

  it("goes on from a kept draft, and says when the workflow moved on since", async () => {
    saveDraft(window.localStorage, ID, {
      document: setMetadata(VALID_DOCUMENT, { name: "from the draft" }),
      base: 1,
    });
    open(`/workflows/${ID}/edit`);

    expect(await screen.findByDisplayValue("from the draft")).toBe(nameField());
    expect(status()).toHaveTextContent("Unsaved changes, kept in this browser");
    expect(screen.getByText("These edits started from revision 1")).toBeInTheDocument();
    expect(screen.getByText(/The latest is revision 3 now/)).toBeInTheDocument();
  });

  it("discards the edits once asked twice, and goes back to the workflow", async () => {
    open(`/workflows/${ID}/edit`);

    fireEvent.change(await screen.findByDisplayValue("summarize ticket"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.getByText("Discard your unsaved edits?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(await screen.findByText("The workflow's page")).toBeInTheDocument();
    expect(window.localStorage.getItem(draftKey(ID))).toBeNull();
  });

  it("bumps the version a release on", async () => {
    open(`/workflows/${ID}/edit`);

    fireEvent.click(await screen.findByRole("button", { name: "+ minor" }));

    expect(screen.getByRole("textbox", { name: "Version" })).toHaveValue("1.1.0");
  });

  it("says when the version is still the saved revision's", async () => {
    open(`/workflows/${ID}/edit`);
    const hint = "Still 1.0.0, as revision 3 is.";

    expect(await screen.findByDisplayValue("summarize ticket")).toBe(nameField());
    expect(screen.queryByText(hint, { exact: false })).toBeNull();

    fireEvent.change(nameField(), { target: { value: "x" } });

    expect(screen.getByText(hint, { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ patch" }));

    expect(screen.queryByText(hint, { exact: false })).toBeNull();
  });

  it("edits the whole document as JSON, undone as one change", async () => {
    open(`/workflows/${ID}/edit`);
    const json = await screen.findByLabelText<HTMLTextAreaElement>("The workflow's document");

    expect(JSON.parse(json.value)).toEqual(VALID_DOCUMENT);

    fireEvent.change(json, {
      target: { value: JSON.stringify(setMetadata(VALID_DOCUMENT, { name: "from JSON" })) },
    });
    fireEvent.change(json, {
      target: { value: JSON.stringify(setMetadata(VALID_DOCUMENT, { name: "from JSON!" })) },
    });

    expect(nameField()).toHaveValue("from JSON!");

    fireEvent.change(json, { target: { value: "{" } });

    expect(nameField()).toHaveValue("from JSON!");
    expect(json).toHaveAttribute("aria-invalid", "true");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(nameField()).toHaveValue("summarize ticket");
    expect(JSON.parse(json.value)).toEqual(VALID_DOCUMENT);
  });

  it("lists what Azathoth would refuse, and moves to the step it is about", async () => {
    open(`/workflows/${ID}/edit`);

    fireEvent.change(await screen.findByRole("textbox", { name: "Description" }), {
      target: { value: "" },
    });

    expect(await screen.findByRole("heading", { name: "1 thing to fix" })).toBeInTheDocument();
    expect(screen.getByText("The workflow’s description can’t be empty.")).toBeInTheDocument();
  });

  it("says when Azathoth could not be asked", async () => {
    open(`/workflows/${ID}/edit`, {
      "/api/workflows/check": [
        502,
        { error: { code: "azathoth_unavailable", message: "Azathoth isn't answering." } },
      ],
    });

    expect(
      await screen.findByRole("heading", { name: "Couldn’t ask Azathoth" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Azathoth isn't answering.")).toBeInTheDocument();
  });

  it("asks Azathoth only once the document has stayed the same a moment", async () => {
    const sent = open(`/workflows/${ID}/edit`);
    const field = await screen.findByRole("textbox", { name: "Description" });
    const asked = () => sent.filter((request) => request.path === "/api/workflows/check");

    await screen.findByRole("heading", { name: "Ready to save" });
    fireEvent.change(field, { target: { value: "S" } });
    fireEvent.change(field, { target: { value: "" } });

    expect(await screen.findByRole("heading", { name: "1 thing to fix" })).toBeInTheDocument();
    expect(asked().map((request) => parsed(request.body))).toEqual([
      VALID_DOCUMENT,
      setMetadata(VALID_DOCUMENT, { description: "" }),
    ]);
  });

  it("asks whether the workflow could run here, and says when it has changed since", async () => {
    const sent = open(`/workflows/${ID}/edit`, { "/api/workflows/readiness": [200, READY] });
    const panel = await screen.findByRole("region", { name: "Can it run here?" });

    expect(sent.some((request) => request.path === "/api/workflows/readiness")).toBe(false);

    fireEvent.click(within(panel).getByRole("button", { name: "Ask Azathoth" }));

    expect(await within(panel).findByText("Every step could run here now.")).toBeInTheDocument();
    expect(within(panel).getByRole("list", { name: "Each step" })).toHaveTextContent(
      "Runs on openai/gpt-large, or 1 more if it fails.",
    );
    expect(within(panel).getByText("Runs its tool here.")).toBeInTheDocument();

    fireEvent.change(nameField(), { target: { value: "x" } });

    expect(within(panel).getByText(/It has changed since\./)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Ask again" })).toBeEnabled();
  });

  it("asks whether it could run here only once Azathoth would take it", async () => {
    open(`/workflows/${ID}/edit`, { "/api/workflows/readiness": [200, READY] });

    fireEvent.change(await screen.findByRole("textbox", { name: "Description" }), {
      target: { value: "" },
    });

    const panel = screen.getByRole("region", { name: "Can it run here?" });

    await waitFor(() => {
      expect(within(panel).getByRole("button", { name: "Ask Azathoth" })).toBeDisabled();
    });
    expect(within(panel).getByText(/Once nothing is left to fix/)).toBeInTheDocument();
  });

  it("says which steps could not run here, and why", async () => {
    open(`/workflows/${ID}/edit`, { "/api/workflows/readiness": [200, NOT_READY] });
    const panel = await screen.findByRole("region", { name: "Can it run here?" });

    fireEvent.click(within(panel).getByRole("button", { name: "Ask Azathoth" }));

    expect(await within(panel).findByText("Some steps couldn’t run here now.")).toBeInTheDocument();
    expect(
      within(panel).getByText("No model in the portfolio meets this step's needs."),
    ).toBeInTheDocument();
  });

  it("gives a step pasted into the JSON with no id, or a repeated one, an id of its own", async () => {
    open(`/workflows/${ID}/edit`);
    const json = await screen.findByLabelText<HTMLTextAreaElement>("The workflow's document");
    const [, summarize] = stepsOf(VALID_DOCUMENT);
    const pasted = { ...summarize, id: uuid(11) };

    fireEvent.change(json, {
      target: {
        value: JSON.stringify({ ...VALID_DOCUMENT, steps: [...stepsOf(VALID_DOCUMENT), pasted] }),
      },
    });

    const ids = stepsOf(readDraft(window.localStorage, ID)?.document ?? {}).map(idOf);

    expect(ids.slice(0, 2)).toEqual([uuid(11), uuid(12)]);
    expect(new Set(ids).size).toBe(3);
  });

  it("composes the workflow on its graph, and undoes it", async () => {
    open(`/workflows/${ID}/edit`);

    fireEvent.click(await screen.findByRole("button", { name: "+ Prompt step" }));

    expect(
      within(await screen.findByRole("region", { name: "1 thing to fix" })).getByText(
        "Prompt › text can’t be empty.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "What to fix" })).toHaveTextContent(
      "Prompt › text can’t be empty.",
    );
    expect(status()).toHaveTextContent("Unsaved changes, kept in this browser");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByRole("heading", { name: "Ready to save" })).toBeInTheDocument();
  });

  it("changes the chosen step in its details, and undoes the typing as one", async () => {
    open(`/workflows/${ID}/edit?step=${uuid(12)}`);
    const field = await screen.findByRole("textbox", { name: "Its name" });

    fireEvent.change(field, { target: { value: "Summarize it" } });
    fireEvent.change(field, { target: { value: "Summarize it all" } });

    expect(
      screen.getByRole("complementary", { name: "Step: Summarize it all" }),
    ).toBeInTheDocument();
    expect(readDraft(window.localStorage, ID)?.document).toMatchObject({
      steps: [{}, { specification: { metadata: { name: "Summarize it all" } } }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByRole("textbox", { name: "Its name" })).toHaveValue("Summarize");
    expect(status()).toHaveTextContent("Saved as revision 3");
  });

  it("says when there is no workflow to edit", async () => {
    open(`/workflows/${uuid(9)}/edit`);

    expect(await screen.findByText("No workflow at this address")).toBeInTheDocument();
  });
});

describe("NewWorkflow", () => {
  it("starts a new workflow with ids of its own, kept as a draft until it is saved", async () => {
    open("/workflows/new");

    expect(await screen.findByDisplayValue("New workflow")).toBe(nameField());
    expect(screen.getByLabelText("Address")).toHaveTextContent(`/workflows/${uuid(101)}/edit`);
    expect(status()).toHaveTextContent("Unsaved changes, kept in this browser");
    expect(readDraft(window.localStorage, uuid(101))?.base).toBeNull();
    expect(await screen.findByRole("heading", { name: "1 thing to fix" })).toBeInTheDocument();
  });

  it("goes back to the list when a new workflow is discarded", async () => {
    open("/workflows/new");

    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(await screen.findByText("The workflows")).toBeInTheDocument();
    expect(window.localStorage.getItem(draftKey(uuid(101)))).toBeNull();
  });
});
