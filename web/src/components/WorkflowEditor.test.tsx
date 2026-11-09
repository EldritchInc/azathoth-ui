import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { ComponentDetail } from "../api/types";
import { draftKey, readDraft, saveDraft } from "../drafts";
import { setMetadata } from "../editing";
import { answering, SERVER, type Answers } from "../test/instances";
import { uuid, VALID_DOCUMENT, WORKFLOW_DETAIL } from "../test/documents";
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

/** Renders the editor's pages at one address, recording every request the editor sends. */
function open(path: string, answers: Answers = {}): Sent[] {
  const sent: Sent[] = [];
  const all: Answers = { ...SERVER, [`/api/workflows/${ID}`]: [200, DETAIL], ...answers };

  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      "http://127.0.0.1",
    );
    const body = typeof init?.body === "string" ? init.body : null;

    sent.push({ path: url.pathname, method: init?.method ?? "GET", body });

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
    expect(screen.getByRole("heading", { name: "Ready to save" })).toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: "1 thing to fix" })).toBeInTheDocument();
    expect(screen.getByText("The workflow needs a description.")).toBeInTheDocument();
  });

  it("composes the workflow on its graph, and undoes it", async () => {
    open(`/workflows/${ID}/edit`);

    fireEvent.click(await screen.findByRole("button", { name: "+ Prompt step" }));

    expect(
      within(screen.getByRole("region", { name: "2 things to fix" })).getByText(
        "It needs a prompt.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "What to fix" })).toHaveTextContent(
      "It needs a prompt.",
    );
    expect(status()).toHaveTextContent("Unsaved changes, kept in this browser");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByRole("heading", { name: "Ready to save" })).toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "2 things to fix" })).toBeInTheDocument();
  });

  it("goes back to the list when a new workflow is discarded", async () => {
    open("/workflows/new");

    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(await screen.findByText("The workflows")).toBeInTheDocument();
    expect(window.localStorage.getItem(draftKey(uuid(101)))).toBeNull();
  });
});
