# ADR 0002: Web App

## Status

Accepted

## Context

The editor's interface is a web app that the server of
[ADR 0001](0001-local-server-security.md) serves from the Python package. It
has to be a pleasure to use by modern standards, and it has to live within
that server's content security policy: every script, style, font and image
from the server itself, and no inline script or style.

It is built by people who also work on the Python package, so its toolchain
should be the usual one, checked as strictly as the Python is, and run by the
same `make check`.

## Decision

- **React and TypeScript, built by Vite.** TypeScript is `strict`, with
  `noUncheckedIndexedAccess` and the other checks `web/tsconfig.json` names.
  ESLint runs typescript-eslint's strict, type-checked rules and React's hook
  rules, Prettier formats, and Vitest tests in jsdom with Testing Library.
- **npm, with a committed lock.** `web/package-lock.json` pins every
  dependency; `make install-web` installs exactly that with `npm ci`.
- **Built into the package, never committed.** `make build-web` builds into
  `src/azathoth_ui/static/`, which is ignored. The wheel's build runs it, so an
  installed editor has its web app. A checkout without a build serves a page
  that says to run it.
- **Fonts are bundled.** Fraunces, a variable serif, sets the headings and the
  instance's name; Hanken Grotesk, a variable sans, sets the interface. Both
  come from Fontsource as npm packages, so the editor looks the same on every
  computer and loads nothing from elsewhere. Vite never inlines an asset as a
  `data:` URL, since the policy admits none for fonts.
- **Plain CSS: global tokens and a module per component.** The palette, type
  and spacing are custom properties in `web/src/styles/tokens.css`, shared
  with the server's own pages, for light and dark: a cool mist with deep
  indigo ink, and an indigo night, with one tide teal accent for what is live,
  chosen or connected. Each component styles itself in a CSS module. There is
  no CSS framework.
- **The person chooses the theme.** It follows the system until they choose
  light or dark, and this browser remembers the choice.
- **Motion is rare and means something.** The orbit drawing draws itself in
  once when the editor opens; status changes animate briefly. Nothing moves
  for someone whose system asks for reduced motion.
- **The editor keeps its connection visible.** It asks the server for the
  instance every 10 seconds and when the window regains focus. If the server
  stops answering, or the browser's key is from an earlier launch, it says so
  and how to fix it, and keeps showing what it last saw.

## Consequences

- A checkout needs Node (`^20.19.0 || >=22.12.0`) to build or check the web
  app; an installed editor does not.
- `make check` checks both halves; CI checks them in separate jobs.
- Running the web app in development is `npm run dev`, which sends `/api` to a
  running `azathoth-ui --port 8765`. Opening that server's printed address
  once gives this browser the cookie both use.
- Components that need a library that injects inline styles cannot be used as
  they are; the policy is kept, and the library is configured or replaced.
