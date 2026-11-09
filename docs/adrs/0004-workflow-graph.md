# ADR 0004: Workflow Graph

## Status

Accepted

## Context

A workflow's steps run in layers: a step runs once every step it depends
on has finished, so the steps of one layer can run at once. Workflows grow
wide as well as long: a layer of ten reviewers can feed a layer of ten
checks. A list of steps, even one set out in layers, hides how values move
between them, which is what a person editing a workflow most needs to see.

A step reads each input from one of four places: the workflow's input, an
output of a step it names, whatever the context holds under a name, or a
constant. A name read from the context has no one source: any step may
write it, and a later step may write it again.

## Decision

- **A graph beside the outline.** A workflow's page draws its steps as a
  graph and keeps the layered outline a click away. The graph is the
  default; the outline is the default on a phone-narrow window, and the
  browser remembers the person's choice. A workflow whose steps cannot be
  layered is only listed.
- **Columns are layers.** The workflow's input is the first column, each
  layer the next, and the result the last. Columns run left to right,
  because values do.
- **Edges follow what steps read.**
  - The workflow's input comes from the input node, and a named step's
    output from that step.
  - A name read from the context comes from every step in an earlier layer
    that writes it, or from the input node when none does. A step that
    writes the name alongside the reader or after it is not a source; the
    step's details name it as a writer it does not wait for.
  - A constant draws no edge: the step shows it.
  - A dependency that passes no value is an order edge, and a step that
    waits for nothing starts from the input node.
  - Two nodes have one edge at most, carrying every value and condition
    between them. It is solid when it carries values, dashed and always
    labelled when a condition reads it, and dotted when it only orders.
- **The editor lays the graph out itself, not ELK.** The columns are fixed
  by the layers, so what is left is the order within each column. An edge
  that spans columns passes each through a lane between that column's
  nodes, never behind a step, and edges from one node share its lanes until
  they part. A few barycentre sweeps order nodes and lanes to keep edges
  from crossing. This is a few hundred lines of pure, tested TypeScript;
  ELK would add over a megabyte to the bundle and lay out what the layers
  already decide.
- **React Flow draws it.** It pans, zooms, shows a map of the whole, makes
  nodes focusable, and sets its styles as properties rather than inline
  style elements, so the content security policy of
  [ADR 0001](0001-local-server-security.md) holds. The nodes, the edges and
  their arrowheads are the editor's own, in its colours, in both themes.
- **Wide graphs stay readable.** A graph wider than the canvas opens at its
  start, at a zoom that reads well. As the canvas zooms out a step shows its
  name alone, then its shape. A layer of at least six steps can be folded
  into one node that stands for all of them; the editor offers it and never
  folds on its own, and the chosen step's layer stays open. Past 150 nodes
  the canvas draws only what is in view.
- **A chosen step lights its paths.** Clicking a step, or reaching it with
  the arrow keys, lights every path that leads to it and from it, dims the
  rest, and opens its details beside the graph, or below it on a narrow
  canvas. Every step the details name moves there. Escape lets it go.
- **The chosen step is in the address.** `?step=` names it, beside the
  address's other parts, so a link opens the graph on that step.

## Consequences

- The graph's model, layout, paths and drawing are pure functions in
  `graph.ts`, `paths.ts` and `flow.ts`, tested without a browser. jsdom
  cannot measure where React Flow's edges meet their nodes, so component
  tests check nodes, details and keys, and leave edges to those functions.
- Laying out fifty layers of twenty steps takes well under a second; a
  test keeps it so.
- The editor depends on `@xyflow/react` 12, MIT licensed. Its attribution
  stays on the canvas.
- A layout the barycentre sweeps cannot untangle still crosses edges. The
  outline and folding remain for workflows too knotted to read as a graph.
