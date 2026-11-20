/**
 * Making a tool from a tool an MCP server serves (ADR 0015): what the form
 * says, as the body `POST /tools/from-mcp` takes, and which action
 * importing the document it makes takes.
 */

import type { Action } from "./permissions";

/** How the server is reached: over HTTP at a URL, or started by a command. */
export type McpServerKind = "url" | "command";

/** What the form holds, as typed. */
export interface McpToolForm {
  readonly tool: string;
  readonly server: McpServerKind;
  readonly url: string;
  readonly authorization: string;
  readonly command: string;
  readonly grants: string;
  readonly timeout: string;
}

/** The form, empty, reaching a server by URL. */
export const EMPTY_MCP_FORM: McpToolForm = {
  tool: "",
  server: "url",
  url: "",
  authorization: "",
  command: "",
  grants: "",
  timeout: "",
};

/** What `POST /tools/from-mcp` is sent. */
export interface McpToolRequest {
  readonly tool: string;
  readonly url?: string;
  readonly authorization?: string;
  readonly command?: readonly string[];
  readonly grants?: readonly string[];
  readonly timeout_seconds?: number;
}

/**
 * Returns a command's words as a shell would split it, without running
 * one: by spaces, a word in single or double quotes kept whole.
 */
export function splitCommand(text: string): string[] {
  const words: string[] = [];
  let word = "";
  let quote: string | null = null;
  let started = false;

  for (const character of text) {
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        word += character;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        words.push(word);
        word = "";
        started = false;
      }
    } else {
      word += character;
      started = true;
    }
  }

  if (started) {
    words.push(word);
  }

  return words;
}

/** Returns the variable names a list holds, separated by commas or spaces. */
export function splitVariables(text: string): string[] {
  return text.split(/[\s,]+/).filter((name) => name !== "");
}

/** Returns the timeout the form names: `null` for none, `undefined` when it is not one. */
export function timeoutOf(text: string): number | null | undefined {
  const trimmed = text.trim();

  if (trimmed === "") {
    return null;
  }

  const seconds = Number(trimmed);

  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** Returns why the form can't make a tool yet, or `null` when it can. */
export function problemOf(form: McpToolForm): string | null {
  if (form.tool.trim() === "") {
    return "Name the tool the server serves.";
  }

  if (form.server === "url" && form.url.trim() === "") {
    return "Give the server's URL.";
  }

  if (form.server === "command" && splitCommand(form.command).length === 0) {
    return "Give the command that starts the server.";
  }

  if (timeoutOf(form.timeout) === undefined) {
    return "A timeout is a number of seconds above 0.";
  }

  return null;
}

/** Returns the body that asks for the tool the form names, only what its server takes. */
export function mcpRequest(form: McpToolForm): McpToolRequest {
  const timeout = timeoutOf(form.timeout);
  const timed = typeof timeout === "number" ? { timeout_seconds: timeout } : {};
  const tool = form.tool.trim();

  if (form.server === "url") {
    const authorization = form.authorization.trim();

    return {
      tool,
      url: form.url.trim(),
      ...(authorization === "" ? {} : { authorization }),
      ...timed,
    };
  }

  const grants = splitVariables(form.grants);

  return {
    tool,
    command: splitCommand(form.command),
    ...(grants.length === 0 ? {} : { grants }),
    ...timed,
  };
}

/**
 * Returns the action importing the document takes: a tool a started
 * process serves is `import_process_tool`, as Azathoth keeps them apart.
 */
export function importActionOf(server: McpServerKind): Action {
  return server === "command" ? "import_process_tool" : "import_tool";
}
