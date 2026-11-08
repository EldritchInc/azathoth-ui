# ADR 0001: Local Server Security

## Status

Accepted

## Context

The editor is a web app served from the person's own computer. It drives an
Azathoth instance that holds their workflows, tools and model portfolio, and
it will run workflows that spend money with their providers' keys. Anything
that can talk to the server can do all of that.

A server on `127.0.0.1` is not private by being local. Every page open in the
person's browser can send requests to it: a form can post to it, an image
can fetch from it, and a site can rebind its own domain name to `127.0.0.1`
and then read what the server answers as if it were the same origin. Other
programs on the computer, and other people's accounts on a shared one, can
connect to the port too. Cookies do not separate ports, so another server on
`localhost`, at another port, counts as the same site.

The editor is single-user and runs only while the person uses it, so it needs
no accounts and no passwords. It needs the browser that started it, and only
that browser, to get in.

## Decision

The `azathoth-ui` command serves the editor as follows, and `LocalOnly`
(`azathoth_ui.security`) puts every request through these checks:

- **Loopback only.** The server listens on `127.0.0.1`, never on every
  interface, on a free port unless `--port` names one.
- **One key per launch.** Each launch draws a key of 256 random bits and
  prints the address with it, `http://127.0.0.1:<port>/?token=<key>`, then
  opens the browser there unless `--no-browser` is given. The key is good for
  the whole launch, so the same address can be opened again; it never
  outlives the process.
- **The key becomes a cookie.** `GET /?token=<key>` with the right key sets
  the cookie `azathoth_ui_<port>` to it, HttpOnly, SameSite=Strict and for
  `/`, and redirects 303 to `/`, so the key leaves the address bar and the
  history. The cookie is named for its port so that two editors running at
  once keep their own. Keys are compared in constant time. A wrong key gets
  the sign-in page and no cookie.
- **No cookie, no answer.** Without the cookie, the API answers 401 in JSON
  and any page answers 401 with the sign-in page, which says to open the
  address the command printed. The one exception is `/_/`, the sign-in page's
  own stylesheet and icon.
- **This host only.** A request whose `Host` is not `127.0.0.1:<port>` or
  `localhost:<port>` is refused with 400, before anything else. A rebound
  domain name carries its own name in `Host`, so DNS rebinding is refused.
- **This origin only.** A request whose `Origin` is not this server, whose
  `Sec-Fetch-Site` is `cross-site` or `same-site`, or which would change
  something (any method but GET, HEAD or OPTIONS) and names no origin, is
  refused with 403. `same-site` is refused because another port on this
  computer is the same site.
- **A strict page policy.** Every response carries
  `Content-Security-Policy: default-src 'self'; base-uri 'none';
  connect-src 'self'; form-action 'self'; frame-ancestors 'none';
  img-src 'self' data:; object-src 'none'`, with `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and same-origin
  opener and resource policies. Nothing is loaded from anywhere else, and no
  inline script or style runs. API answers are never cached.
- **No WebSockets yet.** The server closes any WebSocket with 1008. When the
  editor streams a run, it will do so through these same checks.
- **No proxies.** uvicorn ignores `X-Forwarded-*` headers and sends no
  `Server` header.

The editor works on an instance of its own: `ui.db` in the platform's folder
for application data (`~/Library/Application Support/Azathoth` on macOS,
`%LOCALAPPDATA%\Azathoth` on Windows, `$XDG_DATA_HOME/azathoth` elsewhere),
unless `--database` or `AZATHOTH_DATABASE` names another. The command creates
it with `api.initialize` if it does not exist, and opens it with the providers
the environment configures. It reaches Azathoth only through `azathoth.api`
([ADR 0120](https://github.com/EldritchInc/azathoth/blob/main/docs/adrs/0120-public-service-api.md)),
and answers an `ApiError` with its stable code, its exact message and a status
for its kind: 422 for an invalid argument, 404 for something not found, 409
for a conflict or a run that did not finish, 502 for an unavailable provider,
503 for an instance that is closed or cannot be used, and 500 for any other.

## Consequences

- A page in another tab cannot read from the editor, change anything in it,
  or frame it, and neither can a page served from another port here.
- Another account on a shared computer can connect to the port, but cannot
  get in without the key, which only the person's terminal printed.
- A program running as the person can read the printed key, or the browser's
  cookies. That program can already read the database itself; the editor does
  not try to defend against it.
- The address cannot be bookmarked across launches. Starting the command again
  prints a new one.
- The web app must ship every script, style, font and image it uses, and
  cannot use inline scripts or styles. Its build has to work within the
  policy rather than loosen it.
- Opening the editor from another computer is not supported. Serving beyond
  this computer is the remote server's job, with its own authentication.
