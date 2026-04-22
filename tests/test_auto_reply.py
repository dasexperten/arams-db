"""Tests for `cli.py auto-reply`: end-to-end fetch → draft → post cycle.

The Claude API call is monkeypatched; Ozon calls go through httpx.MockTransport.
"""
import argparse
import json
from dataclasses import dataclass

import httpx

import cli
from ozon_seller import db as seller_db
from ozon_seller.client import OzonSellerClient


def _first_json_object(s: str) -> dict:
    """Extract and parse the first balanced {...} JSON object from text."""
    start = s.index("{")
    depth = 0
    for i in range(start, len(s)):
        ch = s[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(s[start:i + 1])
    raise ValueError("no balanced JSON object found")


@dataclass
class _FakeDraft:
    text: str = "Готовый ответ от бренда."
    input_tokens: int = 10
    output_tokens: int = 5
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0
    stop_reason: str = "end_turn"
    model: str = "fake"


def _args(max_replies: int = 5) -> argparse.Namespace:
    return argparse.Namespace(max_replies=max_replies)


def _review(rid: str, text: str = "Хороший продукт", rating: int = 5) -> dict:
    return {
        "id": rid,
        "sku": 100500,
        "rating": rating,
        "text": text,
        "status": "UNPROCESSED",
        "published_at": "2026-04-20T10:00:00Z",
    }


def _make_client_factory(handler):
    def _factory():
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
    return _factory


def test_auto_reply_posts_for_reviews_with_text_and_marks_no_text_reviews(monkeypatch, capsys):
    seller_db.init_schema()
    posted: list[dict] = []
    status_changes: list[dict] = []

    reviews = [
        _review("r-with-text", text="Понравилось"),
        _review("r-empty", text=""),
        _review("r-ratingonly", text="   "),
    ]

    def handler(req: httpx.Request) -> httpx.Response:
        path = req.url.path
        body = json.loads(req.read()) if req.read() else {}
        if path == "/v1/review/list":
            return httpx.Response(200, json={
                "reviews": reviews, "has_next": False, "last_id": "",
            })
        if path == "/v1/review/comment/create":
            posted.append(body)
            return httpx.Response(200, json={"comment_id": f"cid-{body['review_id']}"})
        if path == "/v1/review/change-status":
            status_changes.append(body)
            return httpx.Response(200, json={"result": "ok"})
        return httpx.Response(404)

    monkeypatch.setattr(cli, "OzonSellerClient", _make_client_factory(handler))
    monkeypatch.setattr("ozon_seller.replier.draft_reply", lambda review: _FakeDraft())
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    rc = cli.cmd_auto_reply(_args())
    assert rc == 0

    assert len(posted) == 1
    assert posted[0]["review_id"] == "r-with-text"
    assert posted[0]["mark_review_as_processed"] is True
    assert posted[0]["text"] == "Готовый ответ от бренда."

    marked = [rid for ch in status_changes for rid in ch["review_ids"]]
    assert set(marked) == {"r-empty", "r-ratingonly"}
    assert all(ch["status"] == "PROCESSED" for ch in status_changes)

    out = capsys.readouterr().out
    summary = _first_json_object(out)
    assert summary["status"] == "ok"
    assert summary["replied"] == 1
    assert summary["no_text_marked"] == 2
    assert summary["errors"] == 0


def test_auto_reply_stops_after_max_replies_reached(monkeypatch, capsys):
    """Even with lots of UNPROCESSED reviews available, we only post
    max_replies answers — the rest stay UNPROCESSED for the next run."""
    seller_db.init_schema()
    posted: list[dict] = []

    reviews = [_review(f"r-{i}", text=f"отзыв {i}") for i in range(5)]

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/v1/review/list":
            return httpx.Response(200, json={
                "reviews": reviews, "has_next": False, "last_id": "",
            })
        if req.url.path == "/v1/review/comment/create":
            posted.append(json.loads(req.read()))
            return httpx.Response(200, json={"comment_id": "c"})
        return httpx.Response(404)

    monkeypatch.setattr(cli, "OzonSellerClient", _make_client_factory(handler))
    monkeypatch.setattr("ozon_seller.replier.draft_reply", lambda review: _FakeDraft())
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    rc = cli.cmd_auto_reply(_args(max_replies=2))
    assert rc == 0
    # Only the first two reviews get posted; the rest remain UNPROCESSED.
    assert [p["review_id"] for p in posted] == ["r-0", "r-1"]

    out = capsys.readouterr().out
    summary = _first_json_object(out)
    assert summary["status"] == "ok"
    assert summary["replied"] == 2
    assert summary["max_replies"] == 2


def test_auto_reply_default_posts_one_reply_only(monkeypatch, capsys):
    """The hourly cron path: default max_replies=1 → exactly one reply per run."""
    seller_db.init_schema()
    posted: list[dict] = []

    reviews = [
        _review("r-a", text="первый"),
        _review("r-b", text="второй"),
        _review("r-c", text="третий"),
    ]

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/v1/review/list":
            return httpx.Response(200, json={
                "reviews": reviews, "has_next": False, "last_id": "",
            })
        if req.url.path == "/v1/review/comment/create":
            posted.append(json.loads(req.read()))
            return httpx.Response(200, json={"comment_id": "c"})
        return httpx.Response(404)

    monkeypatch.setattr(cli, "OzonSellerClient", _make_client_factory(handler))
    monkeypatch.setattr("ozon_seller.replier.draft_reply", lambda review: _FakeDraft())
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    # argparse default for --max-replies is 1; emulate that here.
    rc = cli.cmd_auto_reply(argparse.Namespace(max_replies=1))
    assert rc == 0
    assert len(posted) == 1
    assert posted[0]["review_id"] == "r-a"


def test_auto_reply_telegram_sends_summary_plus_one_message_per_reply(monkeypatch, capsys):
    seller_db.init_schema()

    reviews = [
        _review("r-1", text="Щётка слишком жёсткая, дёсны кровят."),
        _review("r-empty", text=""),
        _review("r-2", text="Паста супер, зубы стали белее.", rating=5),
    ]

    def handler(req: httpx.Request) -> httpx.Response:
        path = req.url.path
        if path == "/v1/review/list":
            return httpx.Response(200, json={
                "reviews": reviews, "has_next": False, "last_id": "",
            })
        if path == "/v1/review/comment/create":
            return httpx.Response(200, json={"comment_id": "c"})
        if path == "/v1/review/change-status":
            return httpx.Response(200, json={"result": "ok"})
        return httpx.Response(404)

    monkeypatch.setattr(cli, "OzonSellerClient", _make_client_factory(handler))
    monkeypatch.setattr(
        "ozon_seller.replier.draft_reply",
        lambda review: _FakeDraft(text=f"Ответ для {review['id']}"),
    )
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "fake-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "-100")

    tg_messages: list[str] = []

    def fake_tg_send(token, chat_id, text):
        tg_messages.append(text)

    monkeypatch.setattr(cli, "_tg_send", fake_tg_send)

    rc = cli.cmd_auto_reply(_args())
    assert rc == 0

    # 1 summary + 2 Q/A messages (r-1 and r-2; r-empty doesn't get a pair)
    assert len(tg_messages) == 3
    assert "Ozon Auto-Reply" in tg_messages[0]
    assert "Отвечено: <b>2</b>" in tg_messages[0]
    assert "лимита 5" in tg_messages[0]

    qa_bodies = "\n".join(tg_messages[1:])
    assert "Щётка слишком жёсткая" in qa_bodies
    assert "Паста супер" in qa_bodies
    assert "Ответ для r-1" in qa_bodies
    assert "Ответ для r-2" in qa_bodies
    # HTML-escaped structure
    assert "<b>Отзыв:</b>" in tg_messages[1]
    assert "<b>Ответ Das Experten:</b>" in tg_messages[1]


def test_auto_reply_continues_when_claude_fails_for_one_review(monkeypatch, capsys):
    seller_db.init_schema()
    posted: list[dict] = []

    reviews = [
        _review("r-ok", text="Хорошо"),
        _review("r-fail", text="Плохо"),
    ]

    def handler(req: httpx.Request) -> httpx.Response:
        path = req.url.path
        if path == "/v1/review/list":
            return httpx.Response(200, json={
                "reviews": reviews, "has_next": False, "last_id": "",
            })
        if path == "/v1/review/comment/create":
            body = json.loads(req.read())
            posted.append(body)
            return httpx.Response(200, json={"comment_id": f"c-{body['review_id']}"})
        return httpx.Response(404)

    def fake_draft(review):
        if review["id"] == "r-fail":
            raise RuntimeError("claude boom")
        return _FakeDraft()

    monkeypatch.setattr(cli, "OzonSellerClient", _make_client_factory(handler))
    monkeypatch.setattr("ozon_seller.replier.draft_reply", fake_draft)
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    rc = cli.cmd_auto_reply(_args())
    assert rc == 1  # partial (one error)
    assert [p["review_id"] for p in posted] == ["r-ok"]

    out = capsys.readouterr().out
    summary = _first_json_object(out)
    assert summary["status"] == "partial"
    assert summary["replied"] == 1
    assert summary["errors"] == 1
