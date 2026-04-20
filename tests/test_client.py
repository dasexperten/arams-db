import httpx
import pytest

from ozon_perf.client import OzonPerformanceClient, OzonAuthError, OzonPerformanceError


def _transport(handler):
    return httpx.MockTransport(handler)


def test_fetches_token_and_caches(monkeypatch):
    calls = {"token": 0, "camp": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/client/token":
            calls["token"] += 1
            body = req.read().decode()
            assert "test-id" in body and "test-secret" in body
            return httpx.Response(200, json={"access_token": "T1", "expires_in": 1800})
        if req.url.path == "/api/client/campaign":
            calls["camp"] += 1
            assert req.headers["authorization"] == "Bearer T1"
            return httpx.Response(200, json={"list": []})
        return httpx.Response(404)

    c = OzonPerformanceClient()
    c._http = httpx.Client(transport=_transport(handler), base_url=c.base_url)

    c.get("/api/client/campaign")
    c.get("/api/client/campaign")

    assert calls["token"] == 1
    assert calls["camp"] == 2


def test_refreshes_on_401():
    state = {"token_calls": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/client/token":
            state["token_calls"] += 1
            token = f"T{state['token_calls']}"
            return httpx.Response(200, json={"access_token": token, "expires_in": 1800})
        if req.url.path == "/api/client/campaign":
            if req.headers["authorization"] == "Bearer T1":
                return httpx.Response(401, json={"error": "expired"})
            return httpx.Response(200, json={"list": [{"id": "1"}]})
        return httpx.Response(404)

    c = OzonPerformanceClient()
    c._http = httpx.Client(transport=_transport(handler), base_url=c.base_url)

    data = c.get("/api/client/campaign")
    assert data == {"list": [{"id": "1"}]}
    assert state["token_calls"] == 2


def test_auth_error_surface():
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/client/token":
            return httpx.Response(403, text="forbidden")
        return httpx.Response(500)

    c = OzonPerformanceClient()
    c._http = httpx.Client(transport=_transport(handler), base_url=c.base_url)

    with pytest.raises(OzonAuthError):
        c.get("/api/client/campaign")


def test_http_error_surface():
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/client/token":
            return httpx.Response(200, json={"access_token": "T", "expires_in": 1800})
        return httpx.Response(500, text="boom")

    c = OzonPerformanceClient()
    c._http = httpx.Client(transport=_transport(handler), base_url=c.base_url)

    with pytest.raises(OzonPerformanceError):
        c.get("/api/client/campaign")
