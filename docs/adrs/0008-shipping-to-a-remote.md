# ADR 0008: Shipping to a Remote

## Status

Accepted

## Context

A workflow composed and tried in the editor is meant to run somewhere
else: on a team's shared instance, which Azathoth 1.4 serves as a remote
([ADR 0124](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0124-remote.md)).
Azathoth 1.4.0b1 names remotes, says where each component stands at one,
and warns of what would stop a pushed workflow running there
([ADR 0125](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0125-remote-status.md),
[ADR 0126](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0126-named-remotes.md)).
The editor should ship through the same calls, and keep a remote's token
as far from the browser as ADR 0001 keeps everything else.

1.4.0b1 also changed what importing answers: a document identical to the
latest revision makes no revision, and the import says whether it made one
([ADR 0122](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0122-lineage-and-digests.md)).

## Decision

- **The editor needs Azathoth 1.4.0b1.** `make install` and CI install it
  or later, and the import routes pass Azathoth's import through: 201 when
  a revision was made, 200 with `created` false when the document is the
  latest revision's. The web app says the component is unchanged, and a
  revision that returns to an earlier one says which.
- **Remotes are reached by name only.** The editor's instance names them,
  as `azathoth remote add` does, and every route that reaches a remote has
  its name in its path; a URL a request spells out is never reached.
- **The editor never handles a token.** Its server reads each name's token
  variable from its own environment when a request comes, as the command
  line does, and says only whether it is set. The web app shows the line
  that sets it in this computer's shell, to run before launching the
  editor again. A token is never sent to the browser, kept in its storage,
  or accepted from it.
- **A remote's errors keep their own statuses.** A remote that cannot be
  reached, or speaks another protocol, answers 502; one that refuses, 403;
  a push that has diverged, 409. A status of a remote that cannot be
  reached is no error: its side is unknown, and its models are read from
  the last portfolio it gave.
- **The Remotes page shows where everything stands.** Each remote's page
  groups what either side holds by how it relates, what needs a person
  first: diverged, then ahead, behind, only here and only there, with in
  sync folded away last. It says each side's revision, what is in
  production there, and where each model is authorized.
- **A status is asked again while someone is looking.** When its page
  opens, when its tab is come back to after half a minute, every minute
  while the tab is visible, and after any push or pull from the editor;
  never while the tab is hidden. It says how old it is, and Refresh asks
  at once. Each status is a few small read-only requests to the remote.
- **Ship is on each component's page.** It says where that component
  stands at the chosen remote first, then pushes its latest revision with
  what it needs, after asking, since a revision a remote receives stays
  there. The report says what the remote received and already held, and
  each of Azathoth's warnings, which never refuse a push.
- **A warning comes after a push, not before.** Azathoth gives its
  warnings as a push's own report; the status before it already shows how
  the component relates and where models are authorized.
- **Divergence is pulled, never overwritten.** A push that has diverged,
  or a status that says so, offers a pull, which forks the component here:
  the pulled revision becomes the latest, and the one made here the
  revision before it.
- **Pulling is from a remote's page.** Each component the remote holds
  revisions of that this instance lacks has a Pull, and each such group
  pulls all of its components at once. A restricted benchmark is withheld
  and named, and is pulled only after confirming that its restricted cases
  will be kept in the editor's own database
  ([ADR 0123](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0123-sensitivity-labels.md)).

## Consequences

- A team's editors ship to, and pull from, one remote by its name, each
  with its own token in its own environment.
- Setting or changing a token means launching the editor again from a
  shell that has it.
- An open Remotes page asks its remote about once a minute; a team's
  remote serves that many readers easily, and a hidden tab asks nothing.
- Approving a model into a remote's portfolio, and promoting a workflow
  there, wait for the roles Azathoth's ADR 0125 leaves to come.
