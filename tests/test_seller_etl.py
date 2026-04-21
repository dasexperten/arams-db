import json

import httpx

from ozon_seller import db
from ozon_seller.client import OzonSellerClient
from ozon_seller.etl import sync_reviews


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


def _review(review_id: str, **kwargs) -> dict:
    return {
        "id": review_id,
        "sku": 100500,
        "rating": 5,
        "text": "Отлично",
        "status": "UNPROCESSED",
        "order_status": "DELIVERED",
        "published_at": "2026-04-18T10:00:00.000Z",
        "is_rating_participant": True,
        "photos_amount": 0,
        "videos_amount": 0,
        "comments_amount": 0,
        **kwargs,
    }


def test_sync_reviews_paginates_and_upserts():
    db.init_schema()

    pages = {
        "": {
            "reviews": [_review("r1"), _review("r2", rating=4)],
            "has_next": True,
            "last_id": "c1",
        },
        "c1": {
            "reviews": [_review("r3", rating=2, text="плохо")],
            "has_next": False,
            "last_id": "",
        },
    }

    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url.path == "/v1/review/list"
        body = json.loads(req.read())
        return httpx.Response(200, json=pages[body["last_id"]])

    with _client_with(handler) as c:
        result = sync_reviews(c)

    assert result["reviews_fetched"] == 3
    assert result["reviews_written"] == 3

    with db.connect() as conn:
        rows = list(conn.execute(
            "SELECT review_id, rating, text, status FROM reviews ORDER BY review_id"
        ))
    assert [r["review_id"] for r in rows] == ["r1", "r2", "r3"]
    assert rows[2]["rating"] == 2
    assert rows[2]["text"] == "плохо"


def test_sync_reviews_is_idempotent_and_updates_on_rerun():
    db.init_schema()

    state = {"text": "v1"}

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={
            "reviews": [_review("r1", text=state["text"])],
            "has_next": False,
            "last_id": "",
        })

    with _client_with(handler) as c:
        sync_reviews(c)
        state["text"] = "v2"
        sync_reviews(c)

    with db.connect() as conn:
        row = conn.execute("SELECT review_id, text FROM reviews").fetchone()
        count = conn.execute("SELECT COUNT(*) AS n FROM reviews").fetchone()["n"]

    assert row["text"] == "v2"
    assert count == 1


def test_sync_reviews_with_comments_fetches_only_when_amount_positive():
    db.init_schema()

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/v1/review/list":
            return httpx.Response(200, json={
                "reviews": [
                    _review("r-has", comments_amount=2),
                    _review("r-none", comments_amount=0),
                ],
                "has_next": False,
                "last_id": "",
            })
        if req.url.path == "/v1/review/comment/list":
            body = json.loads(req.read())
            assert body["review_id"] == "r-has"
            return httpx.Response(200, json={
                "comments": [
                    {"id": 10, "text": "ответ магазина", "is_owner": True,
                     "published_at": "2026-04-18T11:00:00Z", "parent_comment_id": 0},
                    {"id": 11, "text": "спасибо", "is_owner": False,
                     "published_at": "2026-04-18T12:00:00Z", "parent_comment_id": 10},
                ]
            })
        return httpx.Response(404)

    with _client_with(handler) as c:
        result = sync_reviews(c, with_comments=True)

    assert result["comments_written"] == 2

    with db.connect() as conn:
        rows = list(conn.execute(
            "SELECT comment_id, review_id, is_owner, parent_comment_id "
            "FROM review_comments ORDER BY comment_id"
        ))
    assert [r["comment_id"] for r in rows] == [10, 11]
    assert rows[0]["is_owner"] == 1
    assert rows[1]["parent_comment_id"] == 10


def test_sync_reviews_logs_error_run_on_failure():
    db.init_schema()

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="kaboom")

    with _client_with(handler) as c:
        try:
            sync_reviews(c)
        except Exception:
            pass

    with db.connect() as conn:
        run = conn.execute(
            "SELECT job, status, error FROM seller_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()
    assert run["job"] == "sync_reviews"
    assert run["status"] == "error"
    assert "kaboom" in (run["error"] or "")
