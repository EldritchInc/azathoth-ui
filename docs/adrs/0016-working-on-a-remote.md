# ADR 0016: Working on a Remote

## Status

Accepted

## Context

[ADR 0009](0009-one-editor-any-instance.md) made every page of the editor
one that works on any instance: each endpoint that acts on an instance is
built once, for an `Instance`; every call, query and link in the web app
takes its instance from one scope; every button names the action it takes;
and every command shown is written for its instance by the server. Until
now the only instance was the editor's own.

Azathoth 1.6 makes a remote serve the whole service API
([ADR 0127](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0127-the-remote-serves-the-service-api.md)),
every call over HTTP
([ADR 0136](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0136-the-service-api-over-http.md)),
reached as an `Instance` of its own with `instance.remote(name).connect()`
([ADR 0137](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0137-a-client-for-the-service-api.md)),
the calls that take minutes run as jobs
([ADR 0138](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0138-jobs-on-a-remote.md)).
A remote says what it serves at `/v1/service`: its Azathoth, its
protocol, the edition its policy names with what the policy says more of
it, and how its jobs stand. It says at `/v1/permissions` what its policy
lets a caller do, of the remote as a whole or of each resource asked
about, named as the policy names it: its kind and its ID, such as
`workflow <ID>`.

The editor imports only `azathoth.api`, and these two answers are no call
of the service API: their shapes are in `azathoth.remote`.

## Decision

- **The editor needs Azathoth 1.6.** It builds on its first pre-release,
  1.6.0b1, and requires httpx itself, as Azathoth does, for the requests it
  sends a remote of its own.

- **A remote's endpoints are its instance's, under its name.** Every
  endpoint the builder makes is served for each remote the editor's
  instance names, under `/api/remotes/{name}`, as it is for the editor's
  own instance under `/api`. Each request connects to the remote afresh,
  with the token its name's variable holds now, and closes what answered it
  once it is answered, so nothing a remote sends is kept (ADR 0009). A live
  run, which goes on after the request that starts it, connects an
  instance of its own and closes it when it ends; the live runs started on
  each remote are kept by its name, so its page can watch them. A remote's
  status, a push to it and a pull from it stay where
  [ADR 0008](0008-shipping-to-a-remote.md) put them.

  A name the editor's instance does not give is 404, and a name whose
  token is not set is refused as an invalid argument before anything is
  sent. A remote that cannot be reached is 502; what its policy refuses is
  403, in the policy's words; and a remote that cannot answer now, as when
  its audit is down, is 503.

- **A command on a remote ends with `--remote <name>`.**
  `GET {instance}/commands` gives what goes after a command as well as
  what goes before it: nothing after it on the editor's own instance, and
  `--remote <name>` on a remote, with nothing before it. The web app shows
  both dimmed, and copies them with the command.

- **What a remote says of itself and of its caller is relayed.**
  `GET /api/remotes/{name}/service` answers what the remote answers at
  `/v1/service`, and `/api/remotes/{name}/permissions` what it answers at
  `/v1/permissions`: `GET` of the remote as a whole, and `POST` of each
  resource named. The editor sends these requests itself, waiting up to
  30 seconds for each, and reads each answer as JSON, relaying it as the
  remote gave it. An ask that names no resources, or more than a remote
  answers about at once, is refused before anything is sent:

  ```text
  Send {"resources": [<resource>]}, 1 to 100, each a kind and an ID: "benchmark <ID>".
  ```

  A remote that answers 404 at either path serves no service API, and is
  502, saying so.

- **Restricted data is asked of the remote's policy.** Comparing a
  benchmark's revisions asks for a restricted case's values only where the
  remote's policy allows `read_restricted` on that benchmark; otherwise
  Azathoth withholds them and the page says so. On the editor's own
  instance they may always be read.

- **A remote's pages are under its name.** The web app takes the instance
  a page acts on from its address: a remote's at `/remotes/{name}` and
  every page below it, and the editor's own everywhere else, the list of
  remotes at `/remotes` included. The instance's pages are routed once,
  below where its pages are, and served for both, so
  `/remotes/{name}/workflows/:id` is the remote's workflow. The rail and
  the switcher follow the address, so a link or a reload keeps its
  instance.

- **A remote opens on its overview.** `/remotes/{name}` is the remote's
  first page, as `/` is the editor's own. It describes the instance there:
  where its data is kept, the Azathoth serving it and its service API, the
  edition its policy names with what it says more of it, its protocol, and
  how its jobs stand, how many wait and run and how many runners are
  alive, saying so when what waits has no runner alive to start it. Below,
  as before, it says how everything either side holds relates, and pulls
  what the remote holds that this instance lacks; that part names and
  links each component as the editor's own instance does.

- **A button on a remote asks the remote's policy.** The web app asks
  each remote it shows of itself as a whole in one `GET` of its
  permissions, and of every resource a page's buttons name in one `POST`,
  at most 100 at a time. Until it answers, a button waits, disabled,
  saying "Asking <name> what you may do."; then it is enabled, or disabled
  with the policy's reason. An answer is kept for 30 seconds, and shown
  while it is asked again; switching to a remote asks it again at once,
  and a push or a pull from the editor's own instance asks the remote it
  goes to. The editor's own instance is never asked. It is advice for what
  a page offers: the remote's policy still decides every call.

- **What a button acts on is named as a remote's policy names it.** A
  button's subject is a resource, its kind and its ID, and its type says
  so, so no button names a bare ID. A benchmark case's buttons ask of its
  benchmark, and a judge's of its model, as Azathoth's calls do.

- **Each instance's answers are kept apart.** The web app keeps every
  query under where its instance's endpoints are, not under its name, so a
  remote named `local` never shares the editor's own instance's answers,
  and the switcher marks it as the remote it is.

This amends ADR 0009, which reached a remote with
`api.connect(url, token)`, now `instance.remote(name).connect()`; kept a remote's
permissions "briefly", now 30 seconds; named a button's resource without
its kind; and kept a query under its instance's name.

## Consequences

- Every page of the editor works on any remote the editor's instance
  names, as it does on its own instance, with no page built again.
- A remote's token is read on every request, so a changed token is used at
  once, and a connection is opened for each request to a remote.
- A remote's buttons are briefly disabled when its pages first open, while
  its policy is asked; a page asks it at most once for the remote and once
  for each 100 resources it names.
- A button disabled by a remote's policy says why before it is pressed,
  rather than the remote refusing it after.
- The editor depends on httpx directly, at the version Azathoth requires.

## Alternatives Considered

- **A connection kept for each remote.** One connection kept across
  requests would answer faster, but hold a token after its variable
  changed, and keep what a remote sent between requests.
- **Reading the service's and permissions' answers with Azathoth's own
  models.** Their shapes are in `azathoth.remote`, past the public API the
  editor may import; the editor reads the few fields it shows, and relays
  the rest as they came.
- **Asking the policy for each button on its own.** A page of a benchmark
  and its cases would send a request per button; asking for every
  resource a page names at once sends one.
- **Letting a remote refuse what its buttons offer.** Buttons would stay
  enabled until pressed, then fail; asking first is what ADR 0009 built
  every button to do.
