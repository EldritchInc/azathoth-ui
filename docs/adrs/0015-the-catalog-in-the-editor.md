# ADR 0015: The Catalog in the Editor

## Status

Accepted

## Context

Azathoth 1.5.0b1 brings the rest of its catalog to the service API
([ADR 0133](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0133-the-catalog-through-the-service-api.md)):
`tools.versions` lists a tool's versions; `workflows.export`,
`tools.export` and `benchmarks.export` return a `DocumentExport`, the
exact text the `export` commands print and a file name for it;
`models.usage` and `tools.usage` say where a model or a tool is
configured, in production and in run history; `compare_revisions` says
what differs between two revisions of a workflow, a tool version or a
benchmark, by JSON Pointer, a restricted case's values withheld unless
they may be read; `instance.goals` lists, shows and imports goals, the new
`import_goal` action; and `tools.from_mcp` makes the document of a tool an
MCP server serves, importing nothing. Azathoth 1.5.0b1 also installs
`tzdata` on Windows itself.

The editor can do none of these. Its Download button saves JSON the web
app formats itself, which is not promised to be the bytes `export` prints;
a model's page says only which steps could run on it; a tool's page shows
one version and cannot reach the others; nothing says what changed between
two revisions; goals and MCP servers are the command line's alone.

## Decision

- **The editor needs Azathoth 1.5.0b1,** the first with the whole catalog
  in the service API, and its own `tzdata` requirement goes, since
  Azathoth's brings it. `import_goal` joins the actions the web app knows.
  It requires Azathoth with its `mcp` extra, `azathoth-ai[mcp]`, so a tool
  can be made from an MCP server, and called, wherever the editor is
  installed, with nothing more to install.

- **The instance's endpoints reach each call.**

  | Endpoint | Answer |
  | --- | --- |
  | `GET /tools/{id}/versions` | Each version of a tool at its latest revision |
  | `GET /workflows/{id}/export?revision=` | The export's text, as a download named by its file name |
  | `GET /tools/{id}/versions/{version}/export?revision=` | The same, of one tool version |
  | `GET /benchmarks/{id}/export?revision=` | The same, of a benchmark |
  | `GET /workflows/{id}/diff?before=&after=` | A `RevisionComparison` |
  | `GET /tools/{id}/versions/{version}/diff?before=&after=` | The same, of one tool version |
  | `GET /benchmarks/{id}/diff?before=&after=` | The same, of a benchmark |
  | `GET /model-usage?identifier=` | A `ModelUsage` |
  | `GET /tools/{id}/usage` | A `ToolUsage` |
  | `GET /goals`, `GET /goals/{id}` | Each `GoalSummary`; one `GoalDetail` |
  | `POST /goals/import` | A `GoalImport` |
  | `POST /tools/from-mcp` | A `DocumentExport` |

  A model's identifier holds slashes, and `/models/{identifier}` already
  takes the rest of the path, so its usage is asked by query. `diff`, not
  `compare`, names a comparison of revisions, since a benchmark's
  `/compare` already compares workflows on it. A revision number that is
  not a positive whole number is `invalid_argument` before Azathoth is
  asked; `mcp_unavailable` is answered 502, a server the instance could
  not use, as `provider_unavailable` is (ADR 0003).

- **A download is Azathoth's export.** Download asks the instance for the
  revision shown and saves exactly what `azathoth … export` prints, under
  the file name Azathoth suggests, so importing it again appends nothing.
  A restricted benchmark's download says that the file holds restricted
  data, as the command warns.

- **Two revisions are compared on their own page.** A workflow's
  revisions, a tool version's and a benchmark's each have a Compare link,
  to `…/diff?before=&after=`: the revision shown and the one before it,
  either changeable, both kept in the address. Each change is its path,
  marked added, removed or changed, with its value before and after; two
  revisions with the same content are said to be identical, and the
  `azathoth … diff` command that prints the comparison is shown beside it.
  The server asks for a restricted case's values only where
  `read_restricted` is allowed; where they are withheld, the page says so
  in their place.

- **A tool's page names every version.** Its header lists the tool's
  versions, each opening its own page, so a tool's other versions are a
  click away rather than a return to the list.

- **A model's page and a tool's page say where it is used.** Each
  workflow that configures it, the production steps that use it and the
  role each gives it, and the runs that called it, each linking to its
  page. It sits beside a model's "Steps that could run on it", which is a
  different question: what could choose the model, not what does. Usage
  reads the catalog and the runs, so it is shown only where `read_catalog`
  and `read_runs` are both allowed, as spend is (ADR 0014): a section a
  person may never read is not shown to refuse them.

- **Goals have pages.** **Goals**, in the rail, lists them and takes goal
  documents chosen or dropped on it, as the `import_goal` action; a goal
  imported again unchanged is said to be unchanged, and another goal with
  its ID is refused. `/goals/:id` shows a goal's success criteria,
  constraints, document and the `azathoth goal show` command.

- **A tool is made from an MCP server on its own page.** `/tools/from-mcp`,
  linked from Tools, names the tool, the server, by its URL or by the
  command that starts it, never both, the variable holding a URL server's
  token, what a started server is granted, and a timeout. Make document is
  the `tool_from_mcp` action, and shows the document to read and download;
  importing it is a separate step, `import_tool` for a server reached by
  URL and `import_process_tool` for one started by a command, as Azathoth
  keeps them apart, so a person reads what they import and a policy may
  allow one without the other.

## Consequences

- Everything the command line does with the catalog, the editor does on
  its own instance, through the service API alone.
- A document downloaded from the editor and one exported on the command
  line are the same bytes.
- What changed between two revisions is said exactly, and a restricted
  case's values are no easier to read in a comparison than anywhere else.
- Once a team's policy decides `read_runs`, people who may not read runs
  see no usage, rather than a section refusing them.
