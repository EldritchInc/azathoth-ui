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
  side by side, and each layer after the deepest step its steps depend on. A
  workflow that cannot be layered is listed in its document's order.
