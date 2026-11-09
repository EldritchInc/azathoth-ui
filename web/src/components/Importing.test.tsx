import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MAX_DOCUMENT_BYTES } from "../api/client";
import { TOO_LARGE_MESSAGE } from "../importing";
import { WORKFLOW_DETAIL } from "../test/documents";
import { SERVER, serving, type Answers } from "../test/instances";
import { renderAt } from "../test/render";
import { ComponentList } from "./ComponentList";

const IMPORTED = { ...WORKFLOW_DETAIL, revision: { ...WORKFLOW_DETAIL.revision, number: 4 } };

const ANSWERS: Answers = { ...SERVER, "/api/workflows/import": [201, IMPORTED] };

/** Renders the workflows list, recording every request the page makes. */
function workflows(answers: Answers = ANSWERS): { path: string; init?: RequestInit }[] {
  renderAt(<ComponentList kind="workflows" />, { answers });
  const requests: { path: string; init?: RequestInit }[] = [];
  const server = serving(answers);

  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push({ path: new URL(url, "http://127.0.0.1").pathname, init });
    return server(input, init);
  });

  return requests;
}

function jsonFile(name: string, text = '{"steps": []}', type = "application/json"): File {
  return new File([text], name, { type });
}

function choose(...files: File[]): void {
  fireEvent.change(screen.getByLabelText("Choose workflow documents"), { target: { files } });
}

describe("importing", () => {
  it("imports a chosen document and says which revision it made", async () => {
    const requests = workflows();
    await screen.findByRole("table");

    choose(jsonFile("summarize.json"));

    const imports = await screen.findByRole("list", { name: "Imports" });
    expect(
      await within(imports).findByText("Imported summarize 1.0.0 as revision 4."),
    ).toBeVisible();
    expect(within(imports).getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      `/workflows/${WORKFLOW_DETAIL.id}`,
    );

    const posted = requests.find((request) => request.init?.method === "POST");
    expect(posted?.path).toBe("/api/workflows/import");
    expect(posted?.init?.body).toBe('{"steps": []}');
  });

  it("asks for the list again once a document is in", async () => {
    const requests = workflows();
    await screen.findByRole("table");

    choose(jsonFile("summarize.json"));

    await waitFor(() => {
      expect(requests.filter((request) => request.path === "/api/workflows")).toHaveLength(1);
    });
  });

  it("says when a document is identical to a revision already there", async () => {
    const identical = { ...IMPORTED, revision: { ...IMPORTED.revision, identical_to: 3 } };
    workflows({ ...SERVER, "/api/workflows/import": [201, identical] });
    await screen.findByRole("table");

    choose(jsonFile("summarize.json"));

    expect(
      await screen.findByText(
        "Imported summarize 1.0.0 as revision 4, identical to revision 3: the workflow is unchanged.",
      ),
    ).toBeVisible();
  });

  it("says why Azathoth refused a document", async () => {
    workflows({
      ...SERVER,
      "/api/workflows/import": [
        422,
        { error: { code: "invalid_document", message: "Workflow document is not valid." } },
      ],
    });
    await screen.findByRole("table");

    choose(jsonFile("broken.json"));

    const imports = await screen.findByRole("list", { name: "Imports" });
    expect(await within(imports).findByText("Workflow document is not valid.")).toBeVisible();
    expect(within(imports).getByText("Couldn't import broken.json")).toBeVisible();
    expect(within(imports).queryByRole("link")).toBeNull();
  });

  it("refuses a document too large to send, without sending it", async () => {
    const requests = workflows();
    await screen.findByRole("table");
    const large = jsonFile("large.json");
    Object.defineProperty(large, "size", { value: MAX_DOCUMENT_BYTES + 1 });

    choose(large);

    expect(await screen.findByText(TOO_LARGE_MESSAGE)).toBeVisible();
    expect(requests.some((request) => request.init?.method === "POST")).toBe(false);
  });

  it("imports each of several documents, newest outcome first", async () => {
    workflows();
    await screen.findByRole("table");

    choose(jsonFile("one.json"), jsonFile("two.json"));

    const imports = await screen.findByRole("list", { name: "Imports" });
    await waitFor(() => {
      expect(within(imports).getAllByRole("link", { name: "Open it" })).toHaveLength(2);
    });
    expect(within(imports).getAllByRole("listitem")).toHaveLength(2);
  });

  it("forgets an outcome once dismissed", async () => {
    workflows();
    await screen.findByRole("table");

    choose(jsonFile("summarize.json"));
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss summarize.json" }));

    expect(screen.queryByRole("list", { name: "Imports" })).toBeNull();
  });

  it("takes documents dropped anywhere on the page", async () => {
    workflows();
    const table = await screen.findByRole("table");
    const files = [jsonFile("dropped.json")];

    fireEvent.dragEnter(table, { dataTransfer: { types: ["Files"], files } });
    expect(screen.getByText(/Drop to import workflow documents/)).toBeInTheDocument();

    fireEvent.drop(table, { dataTransfer: { types: ["Files"], files } });

    expect(screen.queryByText(/Drop to import workflow documents/)).toBeNull();
    expect(await screen.findByText("Imported summarize 1.0.0 as revision 4.")).toBeVisible();
  });

  it("offers to choose a document when the instance has none", async () => {
    workflows({ ...ANSWERS, "/api/workflows": [200, { items: [] }] });

    expect(await screen.findByText("No workflows yet")).toBeVisible();
    expect(screen.getByRole("button", { name: "Import workflow" })).toBeEnabled();
    expect(screen.getByText("azathoth workflow import <file>")).toBeVisible();
  });
});
