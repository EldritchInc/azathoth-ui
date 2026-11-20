# Changelog

## 1.5.0a1

The first pre-release of the editor for Azathoth 1.5, which brings the
editor to everything the command line does, on its own instance.

- The editor needs Azathoth 1.5, and builds on its pre-release 1.5.0b1,
  the first with its whole catalog in the service API: `make install` and CI
  name it, so pip takes Azathoth's pre-releases and no other package's.
- ADR 0009 records how the editor works on any instance. Every endpoint
  that acts on an instance is built once, for one instance, and mounted at
  `/api` for the editor's own; every call, query and link in the web app
  takes its instance from one scope; and from Azathoth 1.6 a remote is
  served the same way, under its name, with no page built again.
- `GET /api/commands` gives an instance's name and what goes before an
  `azathoth` command for it; `/api/editor` no longer carries the prefix.
- The rail names the instance a page acts on, in its colour, and its
  switcher lists the local instance and every remote named, each in a
  colour drawn from its name.
- Every button that imports, runs, saves, changes the portfolio, pushes or
  pulls names the action it takes, from Azathoth's ADR 0127 catalog, and
  disables itself, saying why, wherever that action is refused. On the
  editor's own instance, every action is allowed.
- ADR 0010 records how the editor shows and changes production.
- A workflow's page has tabs, each its own address: Revisions at
  `/workflows/:id`, Runs at `/workflows/:id/runs`, and Production at
  `/workflows/:id/production`.
- The Production tab shows what production runs now, its revision, who
  promoted or rolled it back and when, and each prompt step's models; every
  production revision, newest first, the active one marked; and the
  workflow's invocations, each with its outcome, its caller, its
  sensitivity label and when it was made.
- Promote and Roll back ask first, naming the instance they change and
  the models a rollback restores. A rollback refused because a model is no
  longer authorized links to that model's page.
- `/workflows/:id/invoke` invokes a workflow in production as a live run,
  on text, JSON or a file, with an idempotency key if one is named, as the
  editor's caller, `{"client": "azathoth-ui"}`. The live-run page shows an
  invocation's outcome: its result or production's code, whether it was
  replayed under its key, and where it is kept.
- `/invocations/:id` shows one invocation: its caller, label, key, input
  and result, any error with its code, and its run; an incomplete one can
  be resumed there, as a live run.
- The server serves production and invocations at the instance's
  endpoints: `/workflows/{id}/production`, `.../production/revisions`,
  `.../promote`, `.../rollback`, `.../invocations`, `/invocations/{id}`,
  `/live/invocations` and `/live/invocations/{id}/resume` (ADR 0003).
  `workflow_result_missing` answers 422, and `candidate_unavailable` 409.
- ADR 0011 records how the editor labels, guards and declares, on
  Azathoth's labels and policies (its ADR 0123), with nothing added to
  core.
- Run, Invoke and a step's trial offer Unlabelled, Public, Internal and
  Restricted beside the input, and send the label chosen. The run page asks
  readiness for that label; a restricted run that can't run names the
  models each step could otherwise use, linked to their pages.
- Every run, live run, invocation, benchmark and case shows its label, the
  same everywhere, restricted standing out; an unlabelled case counts as
  internal.
- A restricted run's input, result and steps, a restricted invocation's
  input and result, and a restricted case's input and expected output are
  hidden until shown. Showing them is the `read_restricted` action, lasts
  until the page is left, and is never remembered.
- A model's page shows its declared data policy, whether it may receive
  restricted input, and who declared it and when, as declared and never
  verified; Declare policy, the `declare_policy` action, asks first. The
  model list marks the models that may receive restricted input.
- The server takes a `sensitivity` on `/live/runs`, `/live/invocations`,
  `/live/steps`, `/workflows/readiness?sensitivity=` and `/models/matching`,
  refusing any other value as `invalid_argument`, and declares a model's
  policy at `/local/portfolio/policy` (ADR 0003).
- ADR 0012 records how the editor keeps judges and shows a run's evidence,
  on Azathoth 1.5.0a2's judges, feedback, annotations, children and
  interrupted runs (its ADR 0129).
- `/judges`, in the rail with its count, lists the judge rotation in the
  order judges are tried and marks a judge the portfolio no longer
  authorizes. Add judge offers the authorized models that are not judges
  yet; Remove asks first, naming the instance. Both are the
  `manage_judges` action.
- A run's page has a Judgment section: the latest judgment, every
  judgment newest first with its reason and corrected output, and Good or
  Bad to record another, a bad one only with a reason and, if given, a
  corrected output that reads as JSON. Recording is the `annotate_run`
  action. A workflow's runs say how each was last judged.
- A run's page shows its citations, each quote with where it was found and
  how many checks were left out, with the command that exports them, and
  its child runs, each with the step and attempt that started it, how it
  ended, and a link to it once it finished or to its invocation. A
  restricted run's judgments and citations are hidden with its other data.
- A workflow's Runs tab lists its interrupted runs above its finished
  ones, with when each started, when its journal last recorded anything
  and how often it was resumed. Resume, the `run_workflow` action, opens it
  as a live run that names the run it picks up; an invocation's run is
  resumed as its invocation, the `invoke` action.
- The server serves `/judges`, `/judges/remove`, `/runs/{id}/feedback`,
  `/runs/{id}/annotations`, `/invocations/{id}/annotations`,
  `/runs/{id}/children`, `/workflows/{id}/interrupted` and
  `/live/runs/{id}/resume`, which refuses any run its workflow does not
  list as interrupted before anything runs (ADR 0003).
  `content_unavailable` answers 502, and `run_not_resumable` 409.
- ADR 0012's amendment records how the editor builds, runs and reads
  benchmarks, on Azathoth 1.5.0a3's benchmarks in the service API (its
  ADR 0130).
- A benchmark's page has tabs: Cases at `/benchmarks/:id`, its document
  and revisions at `/benchmarks/:id/document`, and Executions at
  `/benchmarks/:id/executions`.
- New benchmark, on the Benchmarks list, creates an empty one from a name
  and a description. Cases lists each case with where it came from, its
  comparison, whether it names citations, and its label; Add case takes
  text, JSON or a file, a comparison, an expected value, a description
  and a label.
- A case's page shows its input, what it expects and what its run must
  cite, a restricted case's hidden until shown. Edit sends only what
  changed, and a label can only be raised; Remove asks first, naming the
  instance. Earlier revisions keep every case. All three are the
  `edit_benchmark` action.
- A run's page adds the run to a benchmark as a case, with a comparison,
  expecting its latest correction or a value given; the case keeps the
  run's label.
- Run and Compare, the `run_benchmark` action, run one workflow against a
  benchmark, or compare two or more against latency and cost targets, as a
  live run. Its page shows each workflow's cases as they start and finish,
  how many passed, and Cancel, which stops it between cases and keeps the
  case runs that finished; once it ends, it links to the execution.
- An execution's page, `/benchmark-executions/:id`, shows its scoring
  targets, its workflows ranked with their scorecards, and each case's
  result, score and reason, linking to its run; a restricted execution's
  results are hidden until shown.
- The server serves `/benchmarks` (create), a benchmark's `/cases`, each
  case, its edit and `/remove`, its `/executions`,
  `/benchmark-executions/{id}`, `/live/benchmarks` and
  `/live/comparisons`, telling a left-out key from `null` as Azathoth does
  (ADR 0003). `judge_unavailable` answers 409.
- ADR 0013 records how the editor optimizes workflows and reads, compares
  and promotes what they measured, on Azathoth 1.5.0a4's optimization in
  the service API (its ADR 0131).
- Optimize, beside Run on a workflow's page, is the `optimize` action: a
  benchmark, latency and cost targets, and generations, 1 by default. Its
  live page shows each generation, and the final evaluation, as it starts,
  each candidate's passes and score as it finishes, and each generation's
  winner, how many candidates it proposes and its experiment. Cancel stops
  it between candidates and keeps the experiments that finished; once it
  ends, it links to the winning experiment.
- A workflow's page has an Experiments tab, at
  `/workflows/:id/experiments`, listing each experiment newest first with
  its benchmark revision, candidates, cases, winner's score and label.
- An experiment's page, `/experiments/:id`, ranks its candidates, each with
  its steps' models, its scorecard and its cases linked to their runs. It
  compares the winner with what production runs, or else the workflow as
  configured, or says why nothing is: each step whose model changes, each
  case on both sides, each side's cost and time per run, and what the
  winner saves, a negative saving said as a cost, with the saving over
  production's last 30 days labelled as a projection. A restricted
  experiment's cases are hidden until shown.
- Promote the winner asks first whether it can still be promoted, and says
  why when it can't; when it can, it asks to be confirmed, naming the
  instance and the model each step will be pinned to, promotes it as the
  `promote` action, and links to the Production tab.
- The server serves a workflow's `/experiments`, `/experiments/{id}`, its
  `/compare` and `/promotable`, and `/live/optimizations`, whose
  `generations` must be a whole number (ADR 0003).
- ADR 0014 records how the editor shows what an instance spent, on
  Azathoth 1.5.0a5's spend report (its ADR 0132), and that spend is shown
  only where it may be read.
- `/spend`, in the rail, reports what the instance spent: the last 7 or 30
  days, this month, last month or two dates, read in the browser's time
  zone unless another is named, by day, week or month, and by workflow,
  model, provider or source, every choice kept in its address. It shows
  the totals, billed and estimated apart and never added, and the calls
  that had no price, counted and never taken as free; each period in words
  and as a bar; each group over the range; and each period's groups.
  Download CSV takes the same report as Azathoth writes it, and the
  `azathoth spend` command that prints it is shown.
- A workflow's page has a Spend tab, at `/workflows/:id/spend`, its last 30
  days by model, and a model's page a Spend section, what was spent on it
  in the last 30 days; each opens the Spend page with the same choices.
- Where `read_spend` is refused, the rail has no Spend, a workflow no Spend
  tab and a model no Spend section, and `/spend` is the page for an address
  the editor does not have; nothing is asked and no refusal is shown. What
  one run, execution or experiment cost is still shown with it.
- The server serves `/spend` and `/spend.csv`, its range required as exact
  times with their offsets, refusing what Azathoth could not use before it
  is asked (ADR 0003).
- On Windows, which keeps no IANA time zone database, Azathoth installs
  `tzdata`, so spend can be read in any time zone, UTC included.
- ADR 0015 records how the editor brings that catalog to its pages: tool
  versions, downloads that are Azathoth's exports, where a model or a tool
  is used, a comparison of two revisions, goals, and a tool made from an
  MCP server.
- The editor requires Azathoth with its `mcp` extra, so a tool can be
  made from an MCP server, and called, with nothing more to install.
- A tool version's page names every version of the tool, each opening its
  own page, the one shown marked.
- Download saves a revision exactly as `azathoth … export` prints it, from
  the instance, under the file name Azathoth suggests, so importing it
  again makes no revision; a restricted benchmark's says the file holds
  restricted data.
- Two revisions of a workflow, a tool version or a benchmark are compared
  at `…/diff?before=&after=`: each value added, removed or changed, by its
  path, with its value before and after, or that the two are identical; a
  restricted case's values withheld where they may not be read; and the
  `azathoth … diff` command that prints the same. A revision's list links
  to its comparison with the one before it.

## 1.4.0

The first release of the editor, for Azathoth 1.4. It keeps an Azathoth
instance of its own on your computer and opens it in your browser: browse
and import workflows, tools and benchmarks; see a workflow as a graph and
compose it there; keep a local portfolio from the models the providers
serve; run a workflow on text, JSON or a file and watch it run; and ship
what you made to a shared remote, or pull what others shipped. It drives
Azathoth only through its public service API, `azathoth.api`, and serves
only `127.0.0.1`, with a key for each launch.

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
  app's own pages open the web app (ADR 0003).
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
- The Eldritch, Inc. logo marks the rail, the browser tab and the server's
  own pages, in the theme's own colours.
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
- Importing a document identical to the latest revision makes no revision,
  as Azathoth decides: the import answers `{"created", "<kind>"}`, 201 when
  a revision was made and 200 when none was, and the editor says the
  component is unchanged. A revision that returns to an earlier one says so.
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
