# Changelog

## Unreleased

- The package, `azathoth-ui`, requiring Azathoth 1.4 from PyPI, with its
  gates and CI.
- The `azathoth-ui` command: it creates and opens the editor's own
  instance, serves it on `127.0.0.1` only, and opens the browser with a key
  for this launch, which the server exchanges for a cookie. The server checks
  every request's host and origin, and sets a strict content security policy
  (ADR 0001).
- `GET /api/instance` describes the instance the editor serves. Service API
  errors answer in JSON with their code and message.
- The editor's web app: React and TypeScript, built by Vite into the package
  with `make build-web`, and checked by `make check-web` (ESLint, Prettier,
  TypeScript and Vitest). Its overview shows the instance the editor serves,
  says when the server stops answering or the browser's key is out of date,
  and offers light and dark themes (ADR 0002).
- The wheel holds the built web app: `make wheel` builds both, and building a
  wheel refuses without it. CI checks the web app, the server and the wheel in
  separate jobs, and starts the editor the wheel installs.
- The browsing API: workflows, tools and benchmarks in the editor's own
  instance, any revision of each and its history, and importing a document as
  its component's next revision. `GET /api/editor` gives the prefix that
  names the editor's database in the commands it shows. Links into the web
  app's own pages now open the web app (ADR 0003).
- The web app browses the local instance: the rail opens Workflows, Tools and
  Benchmarks, each with how many the instance holds, and each list filters as
  you type. Every command the editor shows names its own database, ready to
  copy. React Router gives each page its own address, and TanStack Query
  keeps the data.
- Each workflow, tool version and benchmark has its own page: its version,
  revision and digest, the command for exactly that revision, a readable
  view of its document (a workflow's steps with their inputs, outputs,
  conditions and model needs; a tool's fields, implementations and tests; a
  benchmark's cases), the document itself to copy or download, and every
  revision to move between.
- Import workflow, tool and benchmark documents from the editor: choose files,
  or drop them anywhere on a list. Each becomes its component's next revision,
  and the editor says which revision it made, whether it was identical to one
  already there, or why Azathoth refused it.
- The Eldritch, Inc. logo replaces the orbit mark in the rail, the browser
  tab and the server's own pages, in the theme's own colours.
- A workflow's steps are laid out in layers: the steps that can run at once
  side by side, and each layer after the deepest step its steps depend on or
  read a named step's output from. A workflow that cannot be layered is listed
  in its document's order.
- The web app models a workflow as a graph: its input, its steps in a column
  per layer, and its result, with an edge for each value, condition or
  dependency between them. A value read from the context by name comes from
  every step the reader depends on that declares it, as Azathoth resolves
  it; an edge that spans columns passes each through a lane of
  its own, clear of the steps, and each column's rows and lanes are ordered so
  edges cross as little as they can.
- A workflow's page draws its steps as that graph, with React Flow: the input,
  a card for each step with its kind, what it writes and the constants it
  reads, and the result, joined by arrows for values, dashed arrows labelled
  with the conditions they decide, and dotted arrows for order alone. It pans,
  zooms and has a map of the whole; a wide graph opens at its start. The
  graph and the layered outline are a click apart: the graph is the default,
  the outline on a phone-narrow window, and the choice is remembered.
- Choosing a step on the graph lights every path that leads to it and from
  it, dims the rest, and opens its details beside the graph (below it on a
  narrow canvas): what it comes from and leads to, each a link to that step,
  the constants it reads, the writers of a name it reads that it does not
  depend on and so never reads from, its model's needs, retries and prompt. The arrow keys move
  between steps, Enter chooses the step in focus and Escape lets it go. The
  chosen step is named in the address as `?step=`, so a link opens the graph
  on it, and the outline marks it.
- Wide graphs stay readable: as the canvas zooms out a step shows its name
  alone, then its shape; a layer of six or more steps can be folded into one
  node that names a few of them, and unfolded again; edges from one node
  share their lanes until they part; and a graph of more than 150 nodes
  draws only what is in view. ADR 0004 records how the graph is drawn.
- The web app can edit a workflow document: each edit, from its name and
  result to a step's prompt, inputs, outputs, conditions, dependencies,
  retries and failure, returns a new document and leaves every field it does
  not know alone. A prompt's `{variables}` bind to the inputs of their names
  as the prompt or its inputs change; removing a step keeps what read from
  it as near to working as it can. Edits can be undone and redone, typing in
  one field undoing as one change, and `problems` says, step by step, what
  Azathoth would refuse.
- Workflows can be edited in the web app: **Edit** on a workflow's page,
  or **New workflow** on the list, opens `/workflows/:id/edit`, with the
  workflow's name, description and version, its steps, and what Azathoth
  would refuse. Edits are kept in this browser until they are saved or
  discarded, so leaving or reloading loses nothing, and the list shows every
  draft kept. **Save** (⌘S) imports the document into the local instance as
  the workflow's next revision, or shows Azathoth's refusal and keeps the
  edits; undo (⌘Z) and redo (⇧⌘Z) reach back 200 changes, and a draft
  started from an older revision says so.
- A workflow is composed on its graph in the editor: a bar adds a prompt or
  tool step at the start or after the chosen step, and removes the chosen
  step or link (Delete does too). Dragging from a step's right edge to
  another runs the second after the first, refusing a circle, and offers to
  pass one of the first's outputs; dragging from the input makes a step
  read it, and to the result offers which output it is. Each step shows
  how many things Azathoth would refuse in it, and a workflow without steps
  starts with one.
- While composing, the chosen step's details are a form: its name, what it
  does and what it says as it runs; its prompt, each `{variable}` lit
  green when an input fills it and amber when none does, with a button to
  add that input; whether it answers in text or JSON and what its model
  needs; for a tool step, the tool, its version and runtime, suggested from
  the instance's tools. Every input says where it comes from: the
  workflow's input, a step's output (reading one runs the step after it),
  a name from a step it runs after, or a constant typed as text or JSON.
  Outputs have their paths and can become the result; conditions, tries,
  waits and what happens once it has failed are there too, and the step's
  ids under Advanced. Typing in one field undoes as one change, and the
  canvas grows while composing so the form has room.
- The whole workflow, and each step under its details' Advanced, can be
  edited as JSON: what reads as a JSON object changes the workflow as it is
  typed and undoes as one change, and what does not says on which line and
  column it stops reading, and why. The editor says when the version is
  still the saved revision's. ADR 0005 records how workflows are composed.
- The models API: `GET /api/models` lists what the providers serve now,
  each marked by whether the editor's local portfolio holds it, and
  `GET /api/models/{identifier}` gives one. The editor keeps what the
  providers said for ten minutes, or until a refresh. `/api/local/portfolio`
  lists, adds and removes models in the local portfolio, which never
  touches a shared instance; removing one that local production uses is
  refused, naming the workflows and steps, unless it is forced.
  `GET /api/editor` names the providers the editor was opened with, never
  their keys.
