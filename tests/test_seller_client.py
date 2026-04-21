import httpx
import pytest

from ozon_seller.client import (
    OzonSellerClient,
    OzonSellerAuthError,
    OzonSellerError,
    OzonSellerPremiumError,
)


def _client_with(handler) -> OzonSellerClient:
    c = OzonSellerClient()
    c._http = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url=c.base_url,
        headers={
            "Client-Id": str(c.client_id),
            "Api-Key": c.api_key,
            "Content-Type": "application/json",
        },
    )
    return c


def test_sends_client_id_and_api_key_headers():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["client_id"] = req.headers.get("client-id")
        seen["api_key"] = req.headers.get("api-key")
        seen["content_type"] = req.headers.get("content-type")
        return httpx.Response(200, json={"result": {"total": 0}})

    c = _client_with(handler)
    c.post("/v1/review/count")

    assert seen["client_id"] == "42"
    assert seen["api_key"] == "seller-key"
    assert seen["content_type"] == "application/json"


def test_401_raises_auth_error():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "unauthorized"})

    c = _client_with(handler)
    with pytest.raises(OzonSellerAuthError):
        c.post("/v1/review/list", {})


def test_403_on_review_endpoint_raises_premium_error():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"message": "feature not enabled"})

    c = _client_with(handler)
    with pytest.raises(OzonSellerPremiumError):
        c.post("/v1/review/list", {})


def test_403_on_non_review_endpoint_is_generic_error():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"message": "nope"})

    c = _client_with(handler)
    with pytest.raises(OzonSellerError) as ei:
        c.post("/v1/product/info", {"sku": 1})
    assert not isinstance(ei.value, OzonSellerPremiumError)


def test_429_sleeps_and_retries(monkeypatch):
    slept = []
    monkeypatch.setattr("ozon_seller.client.time.sleep", lambda s: slept.append(s))

    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, headers={"Retry-After": "3"})
        return httpx.Response(200, json={"result": "ok"})

    c = _client_with(handler)
    data = c.post("/v1/review/count")
    assert data == {"result": "ok"}
    assert slept and slept[0] == 3.0
    assert calls["n"] == 2


def test_5xx_raises_seller_error():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    c = _client_with(handler)
    with pytest.raises(OzonSellerError):
        c.post("/v1/review/list", {})
