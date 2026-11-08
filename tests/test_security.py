"""Tests of the local server's guard: Host, Origin, the key and the headers (ADR 0001)."""

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse, Response
from starlette.routing import Route
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from azathoth_ui.security import (
    CONTENT_SECURITY_POLICY,
    HOST_MESSAGE_TEMPLATE,
    ORIGIN_MESSAGE,
    PUBLIC_PREFIX,
    UNAUTHENTICATED_MESSAGE,
    LocalOnly,
    cookie_name,
    new_token,
)

PORT = 8123

TOKEN = "the-launch-key"

BASE = f"http://127.0.0.1:{PORT}"


def hello(
    request: Request,
) -> Response:
    """Answer any request with the method that reached the app."""

    return PlainTextResponse(f"reached by {request.method}")


def guarded() -> LocalOnly:
    """Return a tiny app behind the guard, for the test port and key."""

    paths = ["/", "/api/thing", f"{PUBLIC_PREFIX}page.css", "/assets/app.js"]
    routes = [Route(path, hello, methods=["GET", "POST"]) for path in paths]

    return LocalOnly(Starlette(routes=routes), token=TOKEN, port=PORT)


def client(
    base_url: str = BASE,
) -> TestClient:
    """Return a client that does not follow redirects, at one address."""

    return TestClient(guarded(), base_url=base_url, follow_redirects=False)


def signed_in() -> TestClient:
    """Return a client that has handed over the key and holds the cookie."""

    browser = client()
    response = browser.get(f"/?token={TOKEN}")

    assert response.status_code == 303

    return browser


def test_the_key_is_exchanged_for_a_cookie_and_dropped_from_the_address() -> None:
    response = client().get(f"/?token={TOKEN}")

    assert response.status_code == 303
    assert response.headers["location"] == "/"
    cookie, *attributes = response.headers["set-cookie"].split("; ")

    assert cookie == f"{cookie_name(PORT)}={TOKEN}"
    assert sorted(attribute.lower() for attribute in attributes) == [
        "httponly",
        "path=/",
        "samesite=strict",
    ]


def test_the_cookie_is_named_for_its_port_since_cookies_ignore_ports() -> None:
    assert cookie_name(PORT) == "azathoth_ui_8123"


def test_a_signed_in_browser_reaches_the_app() -> None:
    response = signed_in().get("/")

    assert response.status_code == 200
    assert response.text == "reached by GET"


def test_the_key_stays_good_for_the_whole_launch() -> None:
    browser = signed_in()

    assert browser.get(f"/?token={TOKEN}").status_code == 303
    assert client().get(f"/?token={TOKEN}").status_code == 303


def test_a_wrong_key_is_refused_without_a_cookie() -> None:
    response = client().get("/?token=not-the-key")

    assert response.status_code == 401
    assert "set-cookie" not in response.headers
    assert "Open the editor from your terminal" in response.text


def test_a_key_that_is_not_ascii_is_refused_like_any_wrong_key() -> None:
    response = client().get("/?token=schlüssel")

    assert response.status_code == 401


def test_the_key_is_taken_only_at_the_root() -> None:
    response = client().get(f"/assets/app.js?token={TOKEN}")

    assert response.status_code == 401
    assert "set-cookie" not in response.headers


def test_a_page_without_the_cookie_explains_how_to_get_in() -> None:
    response = client().get("/")

    assert response.status_code == 401
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert "<title>Azathoth UI</title>" in response.text


def test_the_api_without_the_cookie_answers_in_json() -> None:
    response = client().get("/api/thing")

    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "unauthenticated", "message": UNAUTHENTICATED_MESSAGE}
    }
    assert UNAUTHENTICATED_MESSAGE == "Open the address azathoth-ui printed when it started."


def test_a_wrong_cookie_is_refused() -> None:
    browser = client()
    browser.cookies.set(cookie_name(PORT), "guessed")

    assert browser.get("/api/thing").status_code == 401


def test_another_ports_cookie_is_not_this_ones() -> None:
    browser = client()
    browser.cookies.set(cookie_name(PORT + 1), TOKEN)

    assert browser.get("/api/thing").status_code == 401


def test_the_pages_own_styles_are_public() -> None:
    response = client().get(f"{PUBLIC_PREFIX}page.css")

    assert response.status_code == 200


def test_localhost_is_this_server_too() -> None:
    response = client(f"http://localhost:{PORT}").get(f"/?token={TOKEN}")

    assert response.status_code == 303


def test_any_other_host_is_refused_against_dns_rebinding() -> None:
    for host in ("evil.example", f"evil.example:{PORT}", "127.0.0.1:9999", f"[::1]:{PORT}"):
        response = client().get(f"/?token={TOKEN}", headers={"host": host})

        assert response.status_code == 400, host
        assert response.text == HOST_MESSAGE_TEMPLATE.format(port=PORT)
        assert "set-cookie" not in response.headers

    assert HOST_MESSAGE_TEMPLATE.format(port=PORT) == (
        "This server answers only at 127.0.0.1:8123 and localhost:8123."
    )


def test_another_origin_is_refused() -> None:
    browser = signed_in()

    for origin in ("http://evil.example", f"http://localhost:{PORT + 1}", "null"):
        response = browser.post("/api/thing", headers={"origin": origin})

        assert response.status_code == 403, origin
        assert response.json() == {"error": {"code": "forbidden", "message": ORIGIN_MESSAGE}}

    assert ORIGIN_MESSAGE == "Requests from other sites are refused."


def test_a_change_must_say_where_it_comes_from() -> None:
    browser = signed_in()

    assert browser.post("/api/thing").status_code == 403
    assert browser.post("/api/thing", headers={"origin": BASE}).text == "reached by POST"
    assert (
        browser.post("/api/thing", headers={"origin": f"http://localhost:{PORT}"}).status_code
        == 200
    )


def test_a_request_another_site_started_is_refused_even_without_an_origin() -> None:
    browser = signed_in()

    for site in ("cross-site", "same-site"):
        response = browser.get("/", headers={"sec-fetch-site": site})

        assert response.status_code == 403, site
        assert response.text == ORIGIN_MESSAGE

    assert browser.get("/", headers={"sec-fetch-site": "same-origin"}).status_code == 200
    assert browser.get("/", headers={"sec-fetch-site": "none"}).status_code == 200


def test_every_response_carries_the_security_headers() -> None:
    browser = client()

    for response in (
        browser.get(f"/?token={TOKEN}"),
        browser.get("/"),
        browser.get("/api/thing"),
        browser.get("/", headers={"host": "evil.example"}),
    ):
        assert response.headers["content-security-policy"] == CONTENT_SECURITY_POLICY
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.headers["cross-origin-opener-policy"] == "same-origin"
        assert response.headers["cross-origin-resource-policy"] == "same-origin"


def test_the_policy_admits_only_this_server() -> None:
    assert CONTENT_SECURITY_POLICY == (
        "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; "
        "frame-ancestors 'none'; img-src 'self' data:; object-src 'none'"
    )


def test_api_answers_are_never_cached_and_pages_may_be() -> None:
    browser = signed_in()

    assert browser.get("/api/thing").headers["cache-control"] == "no-store"
    assert browser.get(f"/?token={TOKEN}").headers["cache-control"] == "no-store"
    assert "cache-control" not in browser.get("/assets/app.js").headers


def test_websockets_are_refused() -> None:
    browser = signed_in()

    try:
        with browser.websocket_connect("/api/thing"):
            raise AssertionError("connected")
    except WebSocketDisconnect as closed:
        assert closed.code == 1008


def test_each_launch_draws_a_long_new_key() -> None:
    first, second = new_token(), new_token()

    assert first != second
    assert len(first) >= 43
