# Changelog

## Unreleased

- The package, `azathoth-ui`, requiring Azathoth 1.4 from PyPI, with its
  gates and CI.
- The `azathoth-ui` command: it creates and opens the editor's own
  instance, serves it on `127.0.0.1` only, and opens the browser with a key
  for this launch, which the server exchanges for a cookie. The server checks
  every request's host and origin, and sets a strict content security policy
  (ADR 0001).
- `GET /api/instance` describes the instance the editor serves. Service API
  errors answer in JSON with their code and message.
- The editor's web app: React and TypeScript, built by Vite into the package
  with `make build-web`, and checked by `make check-web` (ESLint, Prettier,
  TypeScript and Vitest). Its overview shows the instance the editor serves,
  says when the server stops answering or the browser's key is out of date,
  and offers light and dark themes (ADR 0002).
- The wheel holds the built web app: `make wheel` builds both, and building a
  wheel refuses without it. CI checks the web app, the server and the wheel in
  separate jobs, and starts the editor the wheel installs.
