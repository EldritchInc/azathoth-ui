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
