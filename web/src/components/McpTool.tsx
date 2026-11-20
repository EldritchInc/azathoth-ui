import { useId, useMemo, useState } from "react";

import type { DocumentExport } from "../api/types";
import { detailPath } from "../kinds";
import {
  EMPTY_MCP_FORM,
  importActionOf,
  mcpRequest,
  problemOf,
  type McpServerKind,
  type McpToolForm,
} from "../mcpTools";
import { useImportToolDocument, useMakeMcpTool } from "../queries";
import { ActionButton } from "./ActionButton";
import styles from "./Benchmarks.module.css";
import buttons from "./Buttons.module.css";
import { DocumentView } from "./DocumentView";
import { InstanceLink } from "./InstanceLink";
import { Notice } from "./Notice";
import judgment from "./RunJudgment.module.css";
import layout from "./RunWorkflow.module.css";

/** Saves one text as a file the browser downloads, under its name. */
function save(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Returns a document's values, to show; `null` when it is not JSON, which Azathoth's always is. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** The document made, to read, download and, as a separate step, import. */
function Made({
  exported,
  server,
}: {
  readonly exported: DocumentExport;
  readonly server: McpServerKind;
}) {
  const imported = useImportToolDocument();
  const document = useMemo(() => parsed(exported.text), [exported.text]);

  return (
    <section className={layout.form} aria-labelledby="made-heading">
      <h2 id="made-heading" className={styles.heading}>
        The tool&apos;s document
      </h2>
      <p className={styles.quiet}>
        Pinned to the schemas the server serves now. Nothing is imported until you import it.
      </p>
      <DocumentView document={document} label={exported.file_name} />
      {imported.isError && (
        <Notice title="The tool wasn't imported">{imported.error.message}</Notice>
      )}
      {imported.isSuccess && (
        <Notice title={imported.data.created ? "Imported" : "Already imported"} tone="note">
          <p>
            {imported.data.created
              ? `Imported ${imported.data.detail.name} ${imported.data.detail.version} as revision ${String(imported.data.detail.revision.number)}.`
              : `${imported.data.detail.name} ${imported.data.detail.version} is unchanged: it is its latest revision's document.`}{" "}
            <InstanceLink to={detailPath("tools", imported.data.detail)}>Open it</InstanceLink>
          </p>
        </Notice>
      )}
      <div className={layout.actions}>
        <ActionButton
          action={importActionOf(server)}
          type="button"
          className={buttons.primary}
          disabled={imported.isPending}
          aria-busy={imported.isPending}
          onClick={() => {
            imported.mutate(exported.text);
          }}
        >
          {imported.isPending ? "Importing…" : "Import"}
        </ActionButton>
        <button
          type="button"
          className={buttons.quiet}
          onClick={() => {
            save(exported.text, exported.file_name);
          }}
        >
          Download
        </button>
      </div>
    </section>
  );
}

/**
 * `/tools/from-mcp`: a tool's document made from a tool an MCP server
 * serves, as the `tool_from_mcp` action (ADR 0015). The server is reached at
 * a URL, with the variable that holds its token, or started by a command,
 * with what it is granted; either may take a timeout. The document is shown
 * to read and download, and importing it is a separate step: `import_tool`
 * for a server reached by URL, `import_process_tool` for one started.
 */
export function McpTool() {
  const [form, setForm] = useState<McpToolForm>(EMPTY_MCP_FORM);
  const [madeFrom, setMadeFrom] = useState<McpServerKind>("url");
  const make = useMakeMcpTool();
  const ids = {
    tool: useId(),
    server: useId(),
    url: useId(),
    authorization: useId(),
    command: useId(),
    grants: useId(),
    timeout: useId(),
    hint: useId(),
  };
  const problem = problemOf(form);

  const change = (field: keyof McpToolForm, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className={layout.page}>
      <nav className={layout.crumbs} aria-label="Breadcrumb">
        <InstanceLink to="/tools">Tools</InstanceLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">From an MCP server</span>
      </nav>
      <header className={layout.header}>
        <h1 className={layout.title}>A tool from an MCP server</h1>
        <p className={layout.lead}>
          Ask a server for one of its tools, and read the document Azathoth makes of it before you
          import it.
        </p>
      </header>
      <form
        className={layout.form}
        aria-label="A tool from an MCP server"
        onSubmit={(event) => {
          event.preventDefault();

          if (problem !== null || make.isPending) {
            return;
          }

          setMadeFrom(form.server);
          make.mutate(mcpRequest(form));
        }}
      >
        <div className={styles.field}>
          <label htmlFor={ids.tool}>Tool</label>
          <input
            id={ids.tool}
            className={styles.input}
            value={form.tool}
            autoComplete="off"
            spellCheck={false}
            placeholder="The name the server lists it under"
            onChange={(event) => {
              change("tool", event.target.value);
            }}
          />
        </div>
        <fieldset className={judgment.dispositions}>
          <legend className={judgment.legend}>The server is</legend>
          <label className={judgment.choice}>
            <input
              type="radio"
              name={ids.server}
              checked={form.server === "url"}
              onChange={() => {
                change("server", "url");
              }}
            />
            Reached at a URL
          </label>
          <label className={judgment.choice}>
            <input
              type="radio"
              name={ids.server}
              checked={form.server === "command"}
              onChange={() => {
                change("server", "command");
              }}
            />
            Started by a command
          </label>
        </fieldset>
        {form.server === "url" ? (
          <>
            <div className={styles.field}>
              <label htmlFor={ids.url}>URL</label>
              <input
                id={ids.url}
                className={styles.input}
                type="url"
                value={form.url}
                autoComplete="off"
                spellCheck={false}
                placeholder="https://mcp.example.com/mcp"
                onChange={(event) => {
                  change("url", event.target.value);
                }}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.authorization}>Token variable</label>
              <input
                id={ids.authorization}
                className={styles.input}
                value={form.authorization}
                autoComplete="off"
                spellCheck={false}
                placeholder="Optional, such as SEARCH_TOKEN"
                onChange={(event) => {
                  change("authorization", event.target.value);
                }}
              />
            </div>
          </>
        ) : (
          <>
            <div className={styles.field}>
              <label htmlFor={ids.command}>Command</label>
              <input
                id={ids.command}
                className={styles.input}
                value={form.command}
                autoComplete="off"
                spellCheck={false}
                placeholder="npx -y @acme/search-server"
                onChange={(event) => {
                  change("command", event.target.value);
                }}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.grants}>Granted variables</label>
              <input
                id={ids.grants}
                className={styles.input}
                value={form.grants}
                autoComplete="off"
                spellCheck={false}
                placeholder="Optional, such as LANG, SEARCH_*"
                onChange={(event) => {
                  change("grants", event.target.value);
                }}
              />
            </div>
          </>
        )}
        <div className={styles.field}>
          <label htmlFor={ids.timeout}>Timeout, in seconds</label>
          <input
            id={ids.timeout}
            className={styles.input}
            inputMode="decimal"
            value={form.timeout}
            autoComplete="off"
            aria-describedby={ids.hint}
            onChange={(event) => {
              change("timeout", event.target.value);
            }}
          />
          <span id={ids.hint} className={styles.hint}>
            Optional: how long each call may take, and listing now; 30 seconds to list when empty.
          </span>
        </div>
        {problem !== null && form.tool !== "" && <p className={styles.quiet}>{problem}</p>}
        {make.isError && <Notice title="No document was made">{make.error.message}</Notice>}
        <div className={layout.actions}>
          <ActionButton
            action="tool_from_mcp"
            type="submit"
            className={buttons.primary}
            disabled={problem !== null || make.isPending}
            aria-busy={make.isPending}
          >
            {make.isPending ? "Asking the server…" : "Make document"}
          </ActionButton>
          <InstanceLink className={buttons.quiet} to="/tools">
            Cancel
          </InstanceLink>
        </div>
      </form>
      {make.isSuccess && <Made key={make.data.text} exported={make.data} server={madeFrom} />}
    </div>
  );
}
