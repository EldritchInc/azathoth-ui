# ADR 0017: A Remote's Token from Its Command

## Status

Accepted

## Context

[ADR 0016](0016-working-on-a-remote.md) reached a remote, for each
request, with the token its name's variable held then; the editor reads
that variable from its own environment and says only whether it is set.

Azathoth 1.6.0b2 lets a name keep, instead, the command that prints its
remote's token, as an identity provider's tool prints one that lasts an
hour
([Azathoth's ADR 0141](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0141-tokens-printed-by-a-command.md)).
Azathoth runs the command, without a shell, whenever the remote is
reached, keeps its token in the process until shortly before it expires,
and returns the token a name is reached with now from `api.token_of`.

A command the editor saved would be a program the editor's server later
runs on its operator's machine. The editor's API is served only to its own
signed-in origin (ADR 0001), but anything that came to send a request
there, a script injected into a page or a session taken, could then make
that machine run what it chose.

## Decision

- **The editor reaches a name as Azathoth does.** A remote's pages and
  actions reach a name whose token a command prints with no token of the
  editor's own, so Azathoth runs the command when the remote is reached and
  asks for its token again before each request, and a live run outlasts
  one token. What relays a remote's service description and permissions
  takes its token from `api.token_of`, as for a name's variable. A command
  that prints no token is refused as an invalid argument, in Azathoth's
  words, before anything is sent.

- **Listing remotes never runs a command.** `GET /api/remotes` gives each
  name's `token_command`, its arguments, or null; a name whose token a
  command prints has a null `token_variable`, and a null `token_set`, since
  whether its command prints a token is known only by running it.

- **The editor names a remote by a variable only.** `POST /api/remotes`
  refuses a body naming a `token_command`, whatever it holds:

  ```text
  The editor does not name a remote by a token command; name it from a terminal with azathoth remote add <NAME> <URL> --token-command "<COMMAND>".
  ```

  The Remotes page says the same under its form, with
  `azathoth remote add <NAME> <URL> --token-command "<COMMAND>"`.

- **A command is shown, never set.** The Remotes list shows a name's
  command as a shell would read it, quoted as Azathoth quotes it, with
  nothing to set and nothing to copy. A remote's page and Ship ask any
  remote the editor can reach, its variable set or its token printed by a
  command, and say a token is unset only of a variable.

This amends ADR 0016, whose requests reached a remote only with the token
its name's variable held.

## Consequences

- A remote behind single sign-on works in the editor as at the command
  line, once its name is given from a terminal.
- A command's token is kept by Azathoth in the editor's process, so a page
  asks for it again only shortly before it expires, or after 5 minutes.
- A command that fails says so on the first request that needs it, not on
  the Remotes list.
- The editor needs Azathoth 1.6.0b2.

## Alternatives Considered

- **Naming a remote by a command from the form.** It would save opening a
  terminal, but would make the editor's API a way to store a program its
  server runs.
- **Running a name's command to fill `token_set`.** The list would say
  whether each command prints a token, at the cost of running every
  command whenever the list is shown, and of the list failing as a command
  fails.
- **Reaching a command's remote with one token per page.** The editor would
  ask `api.token_of` and pass the token on, as for a variable, but a live
  run would hold that token after it expired.
