import { describe, expect, it } from "vitest";

import {
  EMPTY_MCP_FORM,
  importActionOf,
  mcpRequest,
  problemOf,
  splitCommand,
  splitVariables,
  timeoutOf,
} from "./mcpTools";

describe("splitCommand", () => {
  it("splits by spaces, keeping a quoted word whole", () => {
    expect(splitCommand("  npx -y  @acme/count-server ")).toEqual([
      "npx",
      "-y",
      "@acme/count-server",
    ]);
    expect(splitCommand(`count-server --name "word count" --mode 'a b'`)).toEqual([
      "count-server",
      "--name",
      "word count",
      "--mode",
      "a b",
    ]);
    expect(splitCommand(`run ""`)).toEqual(["run", ""]);
    expect(splitCommand("   ")).toEqual([]);
  });
});

describe("splitVariables", () => {
  it("splits by commas or spaces", () => {
    expect(splitVariables("LANG, HOME  PATH_*")).toEqual(["LANG", "HOME", "PATH_*"]);
    expect(splitVariables("")).toEqual([]);
  });
});

describe("timeoutOf", () => {
  it("reads seconds above 0, none when empty, and nothing else", () => {
    expect(timeoutOf("12.5")).toBe(12.5);
    expect(timeoutOf(" ")).toBeNull();
    expect(timeoutOf("0")).toBeUndefined();
    expect(timeoutOf("soon")).toBeUndefined();
  });
});

describe("problemOf", () => {
  it("asks for the tool, then the server, then a timeout that is one", () => {
    expect(problemOf(EMPTY_MCP_FORM)).toBe("Name the tool the server serves.");
    expect(problemOf({ ...EMPTY_MCP_FORM, tool: "count" })).toBe("Give the server's URL.");
    expect(problemOf({ ...EMPTY_MCP_FORM, tool: "count", server: "command" })).toBe(
      "Give the command that starts the server.",
    );
    expect(
      problemOf({
        ...EMPTY_MCP_FORM,
        tool: "count",
        url: "https://mcp.example.com",
        timeout: "-1",
      }),
    ).toBe("A timeout is a number of seconds above 0.");
    expect(
      problemOf({ ...EMPTY_MCP_FORM, tool: "count", url: "https://mcp.example.com" }),
    ).toBeNull();
  });
});

describe("mcpRequest", () => {
  it("sends a URL server its URL and token variable, never a command", () => {
    expect(
      mcpRequest({
        ...EMPTY_MCP_FORM,
        tool: " count ",
        url: "https://mcp.example.com/mcp",
        authorization: "COUNT_TOKEN",
        command: "ignored",
        grants: "IGNORED",
        timeout: "12",
      }),
    ).toEqual({
      tool: "count",
      url: "https://mcp.example.com/mcp",
      authorization: "COUNT_TOKEN",
      timeout_seconds: 12,
    });
  });

  it("sends a started server its command and grants, never a URL", () => {
    expect(
      mcpRequest({
        ...EMPTY_MCP_FORM,
        tool: "count",
        server: "command",
        url: "https://ignored.example.com",
        command: "count-server --stdio",
        grants: "LANG",
      }),
    ).toEqual({ tool: "count", command: ["count-server", "--stdio"], grants: ["LANG"] });
  });
});

describe("importActionOf", () => {
  it("imports a started server's tool as a process tool", () => {
    expect(importActionOf("url")).toBe("import_tool");
    expect(importActionOf("command")).toBe("import_process_tool");
  });
});
