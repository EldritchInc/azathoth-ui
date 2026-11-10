# ADR 0006: Local Models and the Portfolio

## Status

Accepted

## Context

A prompt step in Azathoth runs on a model it chooses by what it needs, from
the models its instance's portfolio authorizes, or on one model it names. A
person composing a workflow needs to see what the providers serve, keep the
models they want to build and test with, and know which of them a step
could run on, before it runs.

The editor drives an instance of its own. Once workflows can be
pushed to a shared instance, that instance's portfolio is what production
may use, and on a team server it is a platform role's to change. A person
building locally may well want a different set: removing a model locally to
see how steps choose without it should never touch production.

`azathoth.api` lists the models the configured providers serve
(`instance.models`), and keeps the portfolio (`instance.portfolio`):
adding a model the providers serve, and removing one, which Azathoth refuses
while production uses it unless the removal is forced. Asking the providers
reaches the network, and records what changed.

## Decision

- **Two portfolios, named apart.** The editor's portfolio is the **local
  portfolio**: its own instance's, for building and testing. The shared
  instance's will be the **team portfolio**, changed only there, and only
  explicitly. The API keeps them apart by name (`/api/local/portfolio`, and
  later a remote one beside it), and every page that changes the local
  portfolio says that a shared server keeps its own. Removing a model
  locally is an ordinary change: one click, undone by adding it again.
- **Production in the local instance is still asked about.** When local
  production uses a model, Azathoth refuses its removal, and the editor
  names the workflows and steps that use it and offers to remove it anyway,
  which changes only local runs.
- **The catalog is kept, the portfolio is not.** The editor's server keeps
  what the providers last said for ten minutes, asking them once at a time,
  never keeping a failure, and asks again when a person refreshes. Whether
  the local portfolio holds a model is read on every answer, so a change
  shows at once.
- **Unknown is said, never guessed.** What a provider does not publish, a
  context window, a longest answer or a price, shows as unknown, never as
  zero, and a filter or a need for it leaves the model out, as Azathoth does.
- **The catalog's filters live in its address.** What a model reads and can
  do, its context, its prices and the local portfolio narrow the catalog,
  and a link can open it narrowed, as a step's needs do.
- **The editor says which models a step could run on.** `selection.ts`
  repeats Azathoth's `ModelQuery.matches`: every capability asked for, what
  the step reads and writes (text unless it says otherwise), at least the
  context and output it asks, at most the prices it asks, and known prices
  once any price is asked. A step's form names the local portfolio's models
  that meet its needs as they change, and a model's page lists the steps of
  local workflows it could serve. A step that always runs on one model is
  shown whether the providers serve it; Azathoth does not ask the portfolio
  for it.
- **Provider names, never keys.** The editor's description names the
  providers it was opened with, so the catalog can say how to turn one on
  rather than show nothing.

## Consequences

- `selection.ts` repeated rules Azathoth already has, and could fall behind
  them. The portfolio's matches are now `models.matching(requirements)`'s
  (ADR 0007); `selection.ts` still judges the models outside the portfolio,
  until Azathoth can match the whole catalog.
- The catalog can narrow by only part of a step's needs, not what a model
  writes, its longest answer or whether its prices are known, so a link from
  a step may show a few models the step would not choose.
- Pushing to a shared instance adds the team portfolio beside the local one:
  a model's page and a step's form then also say whether the team portfolio
  holds a model, and a step whose models are only local needs platform
  approval before it reaches production.
- A model stays in the local portfolio after its provider stops serving it;
  its page still shows, so it can be removed.
