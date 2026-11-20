# Azathoth UI

A local editor for [Azathoth](https://github.com/EldritchInc/azathoth)
workflows, served on your own computer and opened in your browser.

The editor keeps an Azathoth instance of its own, and drives it only through
Azathoth's public service API, `azathoth.api`, and needs Azathoth 1.5.

## Installing it

Install it into a venv of its own, as
[Installing Azathoth](https://github.com/EldritchInc/azathoth/blob/main/docs/install.md)
shows for Azathoth, with Python 3.11 or newer:

```bash
python -m pip install azathoth-ui
```

pip brings Azathoth 1.5 with it, from PyPI.

## Running it

```bash
azathoth-ui
```

The command creates the editor's own Azathoth instance the first time,
serves the editor on `127.0.0.1`, and opens it in your browser. It prints the
address it opened, with a key for this launch; only a browser that has opened
that address can use the editor. Press Ctrl+C to stop it.

- `--database` edits another Azathoth database, an SQLite file or a
  PostgreSQL URL. `AZATHOTH_DATABASE` does the same.
- `--port` listens on one port rather than any free one.
- `--no-browser` prints the address without opening it.

Providers are configured as they are for Azathoth's own command line, through
the environment: set `OPENROUTER_API_KEY`, or `AZATHOTH_BEDROCK=1` with your
AWS credentials, before launching it. The Models page then lists what they
serve, and keeps the editor's local portfolio, the models its workflows may
use; a shared server keeps its own
([ADR 0006](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0006-local-models-and-the-portfolio.md)).
A workflow's Run button runs it on text, JSON or a file, a PDF, an image or
text, and shows the run as it goes: each step lit on the graph as it starts
and ends, every event in words, and how it ended. A run goes on if you leave
its page, and the editor's rail points to the runs still running. Every run
is kept and listed on its workflow's page, with what each step did. While
you edit, the editor asks Azathoth what it would refuse and whether the
workflow could run here, and a step's details try that one step alone, on
the values you give its inputs, keeping nothing
([ADR 0007](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0007-running-and-watching-workflows.md)).
The Remotes page names the shared instances your workflows ship to, each
with the environment variable its token is read from; set it before
launching the editor, which never sees the token itself. A remote's page
says where everything stands there, and pulls what it holds that you lack.
Ship, on every workflow, tool and benchmark, pushes it to a remote after
saying where it stands, and reports Azathoth's warnings of what would stop
it running there
([ADR 0008](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0008-shipping-to-a-remote.md)).
The rail always says which instance you are acting on, in its colour: your
own local one, or a remote, each with a colour drawn from its name, the same
on every computer. Its switcher lists your instance and every remote you
name, and every button that changes something names what it would do, so a
remote that may refuse it can disable it and say why
([ADR 0009](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0009-one-editor-any-instance.md)).
A workflow's page has three tabs: its revisions, its runs, and its
production. The Production tab says what production runs now, on which
models, and who put it there; lists every production revision, with "Roll
back to this" on each earlier one; and lists the workflow's invocations,
each with its outcome, its caller and its label. Promoting and rolling back
each ask first, naming the instance they change. Invoke runs the workflow
through production as a live run, with an idempotency key if you name one,
and every invocation has a page of its own, where one left incomplete can
be resumed
([ADR 0010](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0010-production-in-the-editor.md)).
Run, Invoke and a step's trial label what they are given public, internal
or restricted, and every run, invocation, benchmark and case shows its
label. A restricted run needs models declared to neither retain nor train
on data; when none of a step's models is, the run page says which ones
could be, and a model's page declares its policy, saying who declared it
and when. Restricted data stays hidden until you choose to show it, every
time a page is opened
([ADR 0011](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0011-sensitivity-and-model-policy-in-the-editor.md)).
The Judges page keeps the models that judge a benchmark's semantic cases,
in the order they are tried. A run's page records your judgment of it,
good or bad, with why and what it should have produced, and shows what its
steps cited and the runs they started. A run that stopped part way, from a
crash or a closed editor, is listed on its workflow's Runs tab, and Resume
finishes it from where it stopped
([ADR 0012](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0012-judges-and-a-runs-evidence-in-the-editor.md)).
A benchmark's page lists its cases and adds them from text, JSON or a
file, and a run judged bad becomes a case from its own page, expecting its
correction. Each case's page edits or removes it. Run and Compare run one
workflow against a benchmark, or score several against latency and cost
targets, showing each case as it finishes; Cancel stops between cases.
Every run and comparison is kept on the benchmark's Executions tab, its
workflows ranked and each case's result linked to its run
([ADR 0012](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0012-judges-and-a-runs-evidence-in-the-editor.md)).
Optimize, on a workflow's page, scores candidate models for its steps
against a benchmark and latency and cost targets, generation by
generation, showing each candidate's score as it finishes; Cancel stops
between candidates. Each generation is kept on the workflow's Experiments
tab. An experiment's page ranks its candidates, compares the winner with
what production runs, step by step and case by case, says what it saves
per run and projects that over production's last 30 days, labelled as a
projection, and promotes the winner once you confirm, if it can still be
promoted
([ADR 0013](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0013-optimization-in-the-editor.md)).
Spend, in the rail, shows what the instance spent on models, by day, week
or month in your browser's time zone or another, and by workflow, model,
provider or source: billed dollars, what a provider charged, and estimated
ones, what Azathoth priced, always apart, with calls that had no price
counted and never taken as free. Download CSV takes the report to a
spreadsheet. Each workflow has a Spend tab, and each model's page says what
was spent on it. Where a team's policy does not let you read spend, it is
not shown at all
([ADR 0014](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0014-spend-in-the-editor.md)).
[ADR 0001](https://github.com/EldritchInc/azathoth-ui/blob/main/docs/adrs/0001-local-server-security.md) explains how the server
keeps other sites and other users out.

## Development

The editor is built against released Azathoth from PyPI: `make install`
takes the release `pyproject.toml` requires, and never Azathoth's own
checkout.

The web app needs Node `^20.19.0 || >=22.12.0`, and npm.

```bash
python -m venv .venv
source .venv/bin/activate
make install
make install-web
make build-web
make check
```

`make build-web` builds the web app into the package, where `azathoth-ui`
serves it. `make check` lints, type-checks and tests both halves: the Python
package, and the web app with ESLint, Prettier, TypeScript and Vitest. It
never runs Azathoth's own test suite.

`make wheel` builds the web app, then the wheel with it, into `dist/`.
Building a wheel refuses until the web app is built.

To work on the web app with hot reloading, start the server on a fixed port,
open the address it prints once, then start Vite and open
<http://127.0.0.1:5173>:

```bash
azathoth-ui --port 8765 --no-browser
cd web && npm run dev
```

## License

MIT. See [LICENSE](https://github.com/EldritchInc/azathoth-ui/blob/main/LICENSE).
