# ADR 0009: One Editor, Any Instance

## Status

Accepted

## Context

The editor's rule is parity: every `azathoth` command has a counterpart in
the editor, on its own local instance and on any remote. Azathoth 1.5 brings
the editor to full parity locally. Azathoth 1.6 makes a remote serve the
whole service API, reached through `api.connect(url, token)`, which returns
the same `Instance` that `api.open(database)` does
([ADR 0127](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0127-the-remote-serves-the-service-api.md)).

Every page 1.5 builds should then work on a remote without being built
again. That holds only if no page assumes the instance it shows is the
editor's own: not in its address, not in the endpoints it calls, not in the
server's handlers, not in the commands it shows, and not in whether its
buttons may be pressed.

Today the editor has one instance. Its handlers read
`request.app.state.instance` as an `api.Azathoth`, the web app calls
`/api/...` paths directly, and every command shown is prefixed with
`AZATHOTH_DATABASE`. A remote has a place of its own already: the Remotes
page at `/remotes/:name`, and `/api/remotes/{name}/status`, `push` and
`pull` ([ADR 0008](0008-shipping-to-a-remote.md)). A remote's name is
letters, digits, `_` and `-`, so `local` is a name a remote may have.

## Decision

- **The instance is in the address.** The local instance keeps the
  addresses it has: `/api/workflows`, and the page `/workflows/:id`. A
  remote serves the same paths under its name: `/api/remotes/{name}/workflows`,
  and the page `/remotes/{name}/workflows/:id`. Links and reloads keep the
  instance they were on, a link names its instance to whoever is sent it,
  and no remote's name can be mistaken for a local path. `/remotes/:name`
  becomes that remote's overview, as `/` is the local instance's, and its
  status, push and pull stay where ADR 0008 put them.

- **The server builds its endpoints once, for an `Instance`.** One builder
  returns the routes that act on an instance, given how a request finds its
  `Instance`. It is mounted at `/api` for the instance `api.open` opened,
  and in 1.6 at `/api/remotes/{name}` for the one `api.connect` reaches
  with that name's token. A handler is given its `Instance`; none reads
  `app.state` for it, names `api.Azathoth`, or knows the database's path.
  The endpoints that belong to the editor, not to an instance, stay apart:
  `/api/editor`, the remotes' names, and shipping between instances.

- **The web app has one instance scope.** A context gives every page the
  instance it is on: its name, the base of its endpoints, and the base of
  its pages. Every client call that acts on an instance takes its endpoint
  from the scope, and every link to a page takes its address from it, so no
  component writes `/api/` or `/workflows/` for itself. In 1.5 the scope is
  always the local instance.

- **Every button that acts names its action.** Each one names the action
  of ADR 0127's catalog that it takes, such as `promote` or
  `edit_benchmark`, and asks `useAllowed(action, resource)` whether it may.
  The answer is allowed, or not with the reason, which the button shows as
  it disables itself. On the local instance the answer is always allowed;
  in 1.6, on a remote, it comes from the remote's `/v1/permissions`, asked
  again on every switch and refresh and kept only for that remote, briefly.
  A button that acts without naming its action does not pass review, so 1.5
  never builds one that 1.6 cannot gate.

- **Commands are written for their instance.** A command shown on the
  local instance carries the `AZATHOTH_DATABASE` prefix, as now. On a remote
  it carries `--remote <name>` instead. The server writes both, as it writes
  the prefix now, so the web app never quotes anything itself.

- **Where you are acting is always shown.** Every page's header has an
  instance switcher: the local instance and every remote it names. Each
  remote has a colour drawn from its name, so the same name has the same
  colour on every computer and nothing is stored; the local instance has a
  colour no remote is given. The header carries the colour and the name of
  the instance the page is on. A confirm for anything that changes a remote
  names the remote. In 1.5 the switcher lists the remotes and takes each to
  its overview.

- **Long-running work is watched one way.** A run, a benchmark run or an
  optimization is watched on one page, from one event stream of Azathoth's
  run events: the editor's own live runs on the local instance, and in 1.6
  the remote's job events. Pages are written against the stream, not
  against where it comes from.

- **Nothing a remote sends is kept.** The editor's server holds what a
  remote answers only for the request that asked, and the web app keeps it
  only as long as its page shows it. Restricted data is never cached.

## Consequences

- Each 1.5 page is a 1.6 remote page: 1.6 mounts the same routes and
  scope for a remote, rather than building pages again.
- Every 1.5 button has its permission check from the start, and every 1.5
  command its instance, even while both have only one answer.
- The editor's endpoints for an instance are whatever its pages need, and
  each calls the service API through an `Instance`, so a remote that serves
  the service API serves every page.
- Moving the existing handlers onto the builder, and the existing calls and
  links onto the scope, is part of 1.5's first editor change, before any
  new page.
- A remote's colour changes only with its name. Two remotes may draw close
  colours; their names tell them apart.

## Alternatives Considered

- **The instance in a request header.** One set of paths would serve every
  instance, and the address bar would no longer say which: a reload, a
  bookmark or a link could land on another instance than the one it was made
  on.
- **A prefix for every instance, `/api/{instance}/...`.** It would move
  every local address, and since `local` is a name a remote may have, it
  would need a name no remote can take. Local addresses as they are, and
  remotes under `/remotes/{name}`, need neither.
- **Building each page twice.** Pages for the local instance and pages for
  a remote would drift apart, and every feature would be built twice.
- **Colours chosen and stored.** A colour kept on one computer would differ
  on the next, and a stored setting would need a home the editor does not
  have; a colour drawn from the name needs neither.
