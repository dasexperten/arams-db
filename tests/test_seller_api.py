import json

import httpx
import pytest

from ozon_seller.api import SellerAPI
from ozon_seller.client import OzonSellerClient


def _api_with(handler) -> SellerAPI:
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
    return SellerAPI(c)


def test_reviews_list_sends_expected_body():
    captured = {}

    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url.path == "/v1/review/list"
        assert req.method == "POST"
        captured["body"] = json.loads(req.read())
        return httpx.Response(200, json={"reviews": [], "has_next": False, "last_id": ""})

    api = _api_with(handler)
    api.reviews_list(status="UNPROCESSED", limit=50, last_id="prev-cursor", sort_dir="ASC")

    assert captured["body"] == {
        "limit": 50,
        "last_id": "prev-cursor",
        "sort_dir": "ASC",
        "status": "UNPROCESSED",
    }


def test_reviews_list_rejects_bad_status():
    api = _api_with(lambda req: httpx.Response(200, json={}))
    with pytest.raises(ValueError):
        api.reviews_list(status="WHATEVER")


def test_reviews_list_clamps_limit_to_ozon_range():
    # Ozon contract: ReviewListRequest.Limit must be in [20, 100]
    seen_limits: list[int] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen_limits.append(json.loads(req.read())["limit"])
        return httpx.Response(200, json={"reviews": [], "has_next": False})

    api = _api_with(handler)
    api.reviews_list(limit=5000)       # too high -> 100
    api.reviews_list(limit=5)          # too low  -> 20
    api.reviews_list(limit=50)         # in range -> 50
    api.reviews_list(limit=20)         # boundary -> 20
    api.reviews_list(limit=100)        # boundary -> 100
    assert seen_limits == [100, 20, 50, 20, 100]


def test_reviews_iter_paginates_by_last_id():
    pages = {
        "": {
            "reviews": [{"id": "a"}, {"id": "b"}],
            "has_next": True,
            "last_id": "cursor-1",
        },
        "cursor-1": {
            "reviews": [{"id": "c"}],
            "has_next": True,
            "last_id": "cursor-2",
        },
        "cursor-2": {
            "reviews": [{"id": "d"}],
            "has_next": False,
            "last_id": "",
        },
    }

    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.read())
        return httpx.Response(200, json=pages[body["last_id"]])

    api = _api_with(handler)
    got = [r["id"] for r in api.reviews_iter()]
    assert got == ["a", "b", "c", "d"]


def test_reviews_iter_stops_on_empty_cursor_to_avoid_infinite_loop():
    # Simulate a broken server that sets has_next=True but returns empty last_id.
    pages = [
        {"reviews": [{"id": "a"}], "has_next": True, "last_id": ""},
    ]
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json=pages[0])

    api = _api_with(handler)
    got = [r["id"] for r in api.reviews_iter()]
    assert got == ["a"]
    assert calls["n"] == 1


def test_change_status_validates_and_sends():
    captured = {}

    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url.path == "/v1/review/change-status"
        captured["body"] = json.loads(req.read())
        return httpx.Response(200, json={"result": "ok"})

    api = _api_with(handler)
    api.change_status(["r1", "r2"], "PROCESSED")
    assert captured["body"] == {"review_ids": ["r1", "r2"], "status": "PROCESSED"}

    with pytest.raises(ValueError):
        api.change_status(["r1"], "INVALID")
    with pytest.raises(ValueError):
        api.change_status([str(i) for i in range(101)], "PROCESSED")

    # empty list is a safe noop, no HTTP call
    result = api.change_status([], "PROCESSED")
    assert result == {"result": "noop"}


def test_comments_iter_uses_offset_and_stops_on_short_page():
    pages = [
        {"comments": [{"id": 1}, {"id": 2}]},
        {"comments": [{"id": 3}]},  # short page -> stop
    ]
    calls = {"n": 0}

    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.read())
        assert body["review_id"] == "rev-1"
        i = calls["n"]
        calls["n"] += 1
        return httpx.Response(200, json=pages[i])

    api = _api_with(handler)
    # use page_size=2 so the second page (1 item) < page_size triggers stop
    got = [c["id"] for c in api.comments_iter("rev-1", page_size=2)]
    assert got == [1, 2, 3]


def test_review_info_and_count_shapes():
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/v1/review/info":
            body = json.loads(req.read())
            assert body == {"review_id": "rev-42"}
            return httpx.Response(200, json={"id": "rev-42", "rating": 5})
        if req.url.path == "/v1/review/count":
            assert json.loads(req.read()) == {}
            return httpx.Response(200, json={"result": {"total": 3, "unprocessed": 1}})
        return httpx.Response(404)

    api = _api_with(handler)
    assert api.review_info("rev-42")["rating"] == 5
    assert api.reviews_count()["result"]["total"] == 3
