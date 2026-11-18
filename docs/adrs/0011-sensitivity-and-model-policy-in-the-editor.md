# ADR 0011: Sensitivity and Model Policy in the Editor

## Status

Accepted

## Context

Azathoth 1.4 labels data `public`, `internal` or `restricted`, on the
input a run, an invocation or a benchmark case is given, and sends a
restricted run's data only to models whose portfolio entry declares that
their provider neither retains nor trains on data
([ADR 0123](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0123-sensitivity-labels.md)).
The command line labels input with `--sensitivity`, declares a model's
policy with `azathoth model policy <MODEL> --no-retention --no-training`,
prints every label it lists, and warns on standard error before it prints
restricted data.

The service API already carries all of it, so the editor needs nothing new
from Azathoth. `runs.run`, `runs.invoke` and `runs.try_step` take a
`sensitivity`; `runs.readiness` and `catalog.matching` take one too, and
answer only with the models that may receive input so labelled. Runs,
invocations and benchmarks carry their label, a benchmark the most
sensitive of its cases'. `portfolio.set_data_policy` declares a model's
policy, and every model says what was declared, whether it may receive
restricted input, and who declared it and when.

The editor uses none of this yet. Every run it starts is unlabelled, and
so internal; only an invocation shows its label; and no model's policy can
be declared, so a restricted run that needs a model declared private
cannot be made to run from the editor at all.

Every page here is built to [ADR 0009](0009-one-editor-any-instance.md),
so that in Azathoth 1.6 the same pages label, guard and declare on a
remote.

## Decision

- **A label is chosen where input is given.** Run, Invoke and a step's
  trial each offer Public, Internal and Restricted beside the input, and
  leave it unlabelled until one is chosen, which Azathoth counts as
  internal. The label is sent as `sensitivity` only when one is chosen.
  `POST /live/runs`, `/live/invocations` and `/live/steps` take it, and
  refuse any other value as `invalid_argument` (422) before Azathoth is
  asked. A live run describes the label it was given.

- **Readiness and matching follow the label.** `POST
  /workflows/readiness?sensitivity=` takes it in its query, since its body
  is the document alone, and `POST /models/matching` beside the
  requirements, as `{"requirements", "sensitivity"}`; each refuses any
  other value as the starts do, and the run page asks again whenever the
  label changes. A restricted run whose step no
  authorized model may receive cannot be started. Its readiness says so,
  in Azathoth's words, and links to each model that step could otherwise
  use, where its policy can be declared.

- **Labels are shown wherever data is.** One label, the same everywhere,
  on a workflow's runs, a run's page, a live run, the Production tab's
  invocations, an invocation's page, the benchmark list, a benchmark's
  page and each of its cases. Restricted stands out from the other two.
  An unlabelled case is shown as internal, as Azathoth counts it.

- **Restricted data is shown only when asked for.** A restricted run's or
  invocation's input and result, and a restricted case's input and
  expected output, are hidden behind "This is restricted data", with a
  button that shows it. Once shown, it stays shown for the rest of that
  page's view, and it is hidden again on every later visit; the choice is
  never remembered. A live run started from the editor shows what it was
  given, since the person who gave it is watching it.

- **Reading restricted data is an action.** Showing it is the
  `read_restricted` action. Where that action is refused, the button is
  disabled and says why, and the data is never shown. On the editor's own
  instance it is always allowed.

- **A model's policy is declared on its page.** The model page says
  whether its provider is declared to retain data and to train on data,
  each yes, no or unknown; whether it may receive restricted input; and
  who declared it and when, or that it was never declared. Declare
  policy, the `declare_policy` action, offered for an authorized model
  only, sets both answers and asks first, naming the instance and saying
  whether the model may then receive restricted input.
  `POST /local/portfolio/policy {"identifier", "retains_data",
  "trains_on_data"}` declares it, and answers with the model. The model
  list marks the models that may receive restricted input.

- **Declared, never verified.** The editor says a policy was declared, by
  whom, and never that it is true of the provider; Azathoth cannot check
  a provider's terms, and neither can the editor.

## Consequences

- The editor labels, guards and declares everything the command line
  does, on Azathoth 1.5.0a1, with nothing added to core.
- A restricted run can be made to run from the editor alone: label it,
  see which step has no private model, open that model, and declare its
  policy.
- Restricted data never appears on a page that was simply opened; it
  takes a click, every visit.
- A run started from an older editor, or from the command line without
  `--sensitivity`, is shown as internal, as Azathoth counts it.

## Alternatives Considered

- **Warning as the command line does, and showing the data.** A command
  warns on standard error and prints, because its output is going where
  the person sent it. A page is looked at, and often shared on a screen;
  hiding restricted data until asked for keeps it off screens that were
  only opened.
- **Remembering that restricted data was shown.** Keeping the choice in
  the browser would show restricted data on a later visit without a
  click, to whoever is at the computer then.
- **Labelling input restricted by default.** Azathoth counts unlabelled
  input as internal; a default the editor chose for itself would make the
  same input mean different things from the editor and from the command
  line.
- **Declaring a policy without confirming.** Declaring a model private
  lets it receive every restricted run's data from then on; a confirm that
  says so costs one click.
