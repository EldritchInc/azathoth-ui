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
- The Models page lists what the providers serve now: each model's name and
  identifier, context window, prices for a million tokens, what it reads
  and what it can do, with what a provider does not publish said as
  unknown. Filter by name, provider, what a model reads and can do, its
  context and its prices, or to the local portfolio, and order by name,
  price or context; the filters live in the page's address. A switch on
  each row adds the model to the local portfolio or removes it, and a model
  this instance's production uses is kept until it is removed anyway,
  naming the workflows that use it. Refresh asks the providers again. With
  no provider turned on, the page says how to turn one on. The rail counts
  the models in the local portfolio.
- Each model has its own page at `/models/<identifier>`: its context
  window, longest answer, prices, what it reads, writes and can do, its
  command, and whether the local portfolio holds it, with a button to add
  or remove it. The page lists the prompt steps of local workflows that
  could run on it: those whose needs it meets, by Azathoth's rules, and
  those that always run on it. A model the providers no longer serve still
  shows while the local portfolio holds it, so it can be removed.
- While composing, a prompt step's model needs say which models in the
  local portfolio meet them, by Azathoth's rules, as they are changed, and
  how many more the providers serve, linking to the catalog filtered as
  near to those needs as it can be; with none in the local portfolio, the
  step says it can't run here yet. A step that always runs on one model
  says whether the providers serve it, and whether the local portfolio
  holds it.
- ADR 0006 records how the editor keeps its local portfolio apart from a
  shared server's, and says which models a step could run on.
- The editor needs Azathoth 1.4.0b1. Importing a document identical to the
  latest revision makes no revision, as Azathoth now decides: the import
  answers `{"created", "<kind>"}`, 201 when a revision was made and 200
  when none was, and the editor says the component is unchanged. A revision
  that returns to an earlier one says so.
- The remotes API: `GET /api/remotes` lists the remotes the editor's
  instance names, each with its URL, the variable its token is read from,
  and whether that variable is set in the editor's environment, never its
  value; `POST /api/remotes` names one, and `POST /api/remotes/remove`
  forgets one. A remote that cannot be reached, or speaks another protocol,
  answers 502, and one that refuses 403.
- `POST /api/remotes/{name}/status` says how the workflows, tool versions
  and benchmarks named, or everything either side holds, relate to the
  remote's, which revision is in production there, and where each model is
  authorized; a remote that cannot be reached is a status whose remote side
  is unknown. `POST /api/remotes/{name}/push` and `.../pull` push and pull
  what is named, answering Azathoth's report with its warnings, and what a
  pull forked or withheld. Only a name the instance gives is reached, with
  the token its variable holds when the request comes.
- The web app's Remotes page, under Sharing in the rail: the remotes the
  editor's instance names, each with its URL and whether its token is set,
  with the line that sets it for this computer's shell when it is not; a
  form names another, and each can be forgotten. A remote's own page says
  how everything either side holds relates, grouped by what needs doing
  (diverged first, in sync folded away last), each side's revision, what is
  in production there, and where each model is authorized. It asks again
  when it is opened, when its tab is come back to after half a minute, and
  every minute while its tab is visible, and says how old what it shows is;
  a remote that isn't answering says so, with how old its models are.
- Ship, on every workflow, tool version and benchmark page: choose a named
  remote, see where the component stands there (its relation, each side's
  revision, what is in production there), and push its latest revision with
  what it needs, after confirming, since a pushed revision stays at the
  remote. The report says what the remote received and already held, and
  each of Azathoth's warnings of what would stop it running there. A push
  that has diverged, or a status that says so, offers a pull instead, whose
  report says what it saved and forked here.
- A remote's page pulls: each component the remote holds revisions of that
  this instance lacks (behind, only there, or diverged) has a Pull, and each
  such group pulls all of its components at once. The report says what was
  saved and forked here, and what was withheld as restricted, which can then
  be pulled too, after confirming that restricted data will be kept in the
  editor's own database.
- ADR 0008 records how the editor ships to a remote: by name only, never
  handling a token, with a remote's errors keeping their statuses, status
  asked again while someone is looking, and divergence pulled, never
  overwritten.
- The editor is version 1.4.0b1, with Azathoth 1.4.0b1.
