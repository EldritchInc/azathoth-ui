import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type { DocumentExport } from "../api/types";
import type { Action, Permissions } from "../permissions";
import { TOOL_DETAIL, TOOL_DOCUMENT } from "../test/documents";
import { SERVER, serving, urlOf, type Answers } from "../test/instances";
import { renderAt } from "../test/render";

const MADE: DocumentExport = {
  text: `${JSON.stringify(TOOL_DOCUMENT, null, 2)}\n`,
  file_name: "count-words-1.0.0.tool.json",
  sensitivity: null,
};

const ANSWERS: Answers = {
  ...SERVER,
  "/api/tools/from-mcp": [200, MADE],
  "/api/tools/import": [201, { created: true, tool: TOOL_DETAIL }],
};

/** Opens the page, recording each request sent with a body. */
function open(
  answers: Answers = ANSWERS,
  permissions?: Permissions,
): { path: string; body: unknown }[] {
  const sent: { path: string; body: unknown }[] = [];
  const server = serving(answers);

  renderAt(<App />, {
    path: "/tools/from-mcp",
    ...(permissions === undefined ? {} : { permissions }),
    fetcher: (input, init) => {
      if (typeof init?.body === "string") {
        sent.push({ path: urlOf(input).pathname, body: JSON.parse(init.body) as unknown });
      }

      return server(input, init);
    },
  });

  return sent;
}

function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function refusing(refused: Action): Permissions {
  return (_instance, action) =>
    action === refused ? { allowed: false, reason: "Not on this instance." } : { allowed: true };
}

describe("a tool from an MCP server", () => {
  it("is linked from the tools", async () => {
    renderAt(<App />, { path: "/tools" });

    expect(await screen.findByRole("link", { name: "From an MCP server" })).toHaveAttribute(
      "href",
      "/tools/from-mcp",
    );
  });

  it("can't be asked for until the tool and its server are named", async () => {
    open();

    const make = await screen.findByRole("button", { name: "Make document" });

    expect(make).toBeDisabled();

    type("Tool", "count_words");
    expect(make).toBeDisabled();
    expect(screen.getByText("Give the server's URL.")).toBeVisible();

    type("URL", "https://mcp.example.com/mcp");
    expect(make).toBeEnabled();
  });

  it("asks a URL server for the tool, and shows its document before importing it", async () => {
    const sent = open();

    type("Tool", "count_words");
    type("URL", "https://mcp.example.com/mcp");
    type("Token variable", "COUNT_TOKEN");
    type("Timeout, in seconds", "12");
    fireEvent.click(await screen.findByRole("button", { name: "Make document" }));

    const made = await screen.findByRole("region", { name: "The tool's document" });

    expect(sent).toEqual([
      {
        path: "/api/tools/from-mcp",
        body: {
          tool: "count_words",
          url: "https://mcp.example.com/mcp",
          authorization: "COUNT_TOKEN",
          timeout_seconds: 12,
        },
      },
    ]);
    expect(within(made).getByLabelText("count-words-1.0.0.tool.json, as JSON")).toHaveTextContent(
      TOOL_DOCUMENT.definition.name,
    );
    expect(within(made).getByRole("button", { name: "Download" })).toBeEnabled();
  });

  it("imports the document it made only when asked, and links to the tool", async () => {
    const sent = open();

    type("Tool", "count_words");
    type("URL", "https://mcp.example.com/mcp");
    fireEvent.click(await screen.findByRole("button", { name: "Make document" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import" }));

    expect(await screen.findByText(/Imported count_words 1\.0\.0 as revision 1\./)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      `/tools/${TOOL_DETAIL.id}/versions/1.0.0`,
    );
    await waitFor(() => {
      expect(sent.map((request) => request.path)).toEqual([
        "/api/tools/from-mcp",
        "/api/tools/import",
      ]);
    });
    expect(sent[1]?.body).toEqual(TOOL_DOCUMENT);
  });

  it("asks a started server with its command and grants, and imports it as a process tool", async () => {
    const sent = open(ANSWERS, refusing("import_process_tool"));

    type("Tool", "count_words");
    fireEvent.click(await screen.findByLabelText("Started by a command"));
    type("Command", `count-server --name "word count"`);
    type("Granted variables", "LANG, COUNT_*");
    fireEvent.click(screen.getByRole("button", { name: "Make document" }));

    const importing = await screen.findByRole("button", { name: "Import" });

    expect(sent[0]?.body).toEqual({
      tool: "count_words",
      command: ["count-server", "--name", "word count"],
      grants: ["LANG", "COUNT_*"],
    });
    expect(importing).toBeDisabled();
  });

  it("can't be asked for where tool_from_mcp is refused", async () => {
    open(ANSWERS, refusing("tool_from_mcp"));

    type("Tool", "count_words");
    type("URL", "https://mcp.example.com/mcp");

    expect(await screen.findByRole("button", { name: "Make document" })).toBeDisabled();
  });

  it("says why no document was made", async () => {
    open({
      ...ANSWERS,
      "/api/tools/from-mcp": [
        502,
        {
          error: {
            code: "mcp_unavailable",
            message: "MCP server https://mcp.example.com/mcp could not be listed.",
          },
        },
      ],
    });

    type("Tool", "count_words");
    type("URL", "https://mcp.example.com/mcp");
    fireEvent.click(await screen.findByRole("button", { name: "Make document" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be listed.");
  });

  it("downloads the document it made under Azathoth's file name", async () => {
    const saved: string[] = [];

    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:tool" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    open();

    type("Tool", "count_words");
    type("URL", "https://mcp.example.com/mcp");
    fireEvent.click(await screen.findByRole("button", { name: "Make document" }));
    fireEvent.click(await screen.findByRole("button", { name: "Download" }));

    expect(saved).toEqual(["count-words-1.0.0.tool.json"]);
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });
});
