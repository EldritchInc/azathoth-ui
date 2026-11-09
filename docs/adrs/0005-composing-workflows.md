# ADR 0005: Composing Workflows

## Status

Accepted

## Context

[ADR 0004](0004-workflow-graph.md) draws a workflow's steps as a graph to
read. A person also needs to write one: add steps, join them, say what each
reads and writes, and save the result as the workflow's next revision,
without writing its JSON by hand and without saving something Azathoth will
refuse.

Azathoth imports a workflow document whole, through `workflows.import_document`
in its public service API, and either keeps it as the next revision or
refuses it with a reason. It has no way yet to check a document without
saving it, nor to run one step of a document it has not saved.

## Decision

- **Edits are pure functions of the document.** Each edit in `editing.ts`
  takes a document and returns a new one, changing only what it is about and
  leaving every field it does not know alone, so a document from a newer
  Azathoth survives the editor. Step ids are UUIDs the caller makes, so an
  edit is the same each time it is made. Edits keep the document as near to
  working as they can: a prompt's `{variables}` bind to the inputs of their
  names as either changes, renaming an output renames what reads it from
  its step, and removing a step turns what read from it into reads by name.
- **The editor says what Azathoth would refuse.** `problems.ts` checks a
  document against Azathoth's rules: ids, dependencies and circles, where
  each input comes from (a name from the context must be written by a step
  it depends on directly), conditions, retries and the result. Each problem
  names its step, and a step on the graph shows how many it has. Azathoth
  remains the judge: Save shows its refusal and keeps the edits.
- **History is the editor's, not the browser's.** Every edit goes through
  one history of documents that undo and redo walk, 200 changes deep. Edits
  made under one group in a row, such as the letters typed into one field,
  undo as one change.
- **Drafts live in this browser until saved.** An edited workflow is kept in
  local storage, with the revision it started from, until it is saved or
  discarded, so leaving or reloading loses nothing. Save imports the
  document as the workflow's next revision. A draft that started from an
  older revision says so, and the editor says when the version is still the
  saved revision's.
- **Compose on the graph, fill in beside it.** On the graph, a bar adds a
  prompt or tool step and removes the chosen step or link; dragging from
  one step to another runs the second after the first, refusing a circle,
  and offers to pass a value. Joining and unjoining are pure functions of
  the graph and the document, since jsdom cannot drag. The chosen step's
  details become a form for everything else, each field one edit. An input
  is one of four things: the workflow's input, a step's output, a name from
  a step it runs after, or a constant typed as text or JSON. Reading a
  step's output makes the step run after it.
- **The JSON is always there.** The whole document, and each step under its
  details' Advanced, can be edited as JSON beside the form. What reads as a
  JSON object changes the workflow as it is typed and undoes like any edit;
  what does not is kept as typed, with where and why it stops reading. The
  form covers what most workflows need, and the JSON covers the rest, such
  as a message's values, a step's confidence, and what a model reads and
  writes, so the form never has to grow a field for every one.
- **The outline is for reading.** Composing happens on the graph; the
  layered outline says so while composing rather than offering a second way
  to edit.

## Consequences

- Editing, problems, history, drafts, joining and the form's parsing are
  pure TypeScript, tested without a browser; component tests check fields,
  keys and what each change does to the document.
- `problems.ts` repeats rules Azathoth already enforces, and can fall behind
  them. Once Azathoth offers a check without saving, such as
  `workflows.check(document)`, the editor should ask it and keep its own
  checks for saying where in the document a problem is.
- Running one step of an unsaved workflow, with the instance's model keys
  and a tool's test cases, waits on Azathoth too, for something like
  `runs.try_step(document, step_id, inputs)`.
- A draft is in one browser only: another browser or machine does not see
  it until it is saved.
- The order of steps within a layer follows the document; reordering them
  on the graph is left for later.
