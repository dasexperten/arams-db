"""Tests for `cli.py auto-reply-wb`: end-to-end fetch → draft → post cycle.

The Claude API call is monkeypatched; WB calls go through httpx.MockTransport.
"""
import argparse
import json
from dataclasses import dataclass

import httpx

import cli
from wb_seller import db as wb_db
from wb_seller.client import WBSellerClient


def _first_json_object(s: str) -> dict:
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


def _feedback(fid: str, text: str = "Хороший продукт", rating: int = 5,
              pros: str = "", cons: str = "") -> dict:
    return {
        "id": fid,
        "text": text,
        "pros": pros,
        "cons": cons,
        "productValuation": rating,
        "userName": "Тестовый Покупатель",
        "createdDate": "2026-04-20T10:00:00Z",
        "productDetails": {
            "nmId": 12345678,
            "productName": "Das Experten SCHWARZ",
            "supplierArticle": "DE102",
            "brandName": "Das Experten",
        },
        "answer": None,
        "state": "none",
    }


def _wb_response(feedbacks: list[dict]) -> dict:
    return {
        "data": {
            "countUnanswered": len(feedbacks),
            "countArchive": 0,
            "feedbacks": feedbacks,
        },
        "error": False,
        "errorText": "",
    }


def _make_client_factory(handler):
    def _factory():
        c = WBSellerClient()
        c._http = httpx.Client(
            transport=httpx.MockTransport(handler),
            base_url=c.base_url,
            headers={
                "Authorization": c.token,
                "Content-Type": "application/json",
            },
        )
        return c
    return _factory


def test_auto_reply_wb_posts_for_feedbacks_with_text_and_skips_rating_only(monkeypatch, capsys):
    wb_db.init_schema()
    posted: list[dict] = []
    calls: list[str] = []

    feedbacks_with_text = [_feedback("f-with-text", text="Понравилось")]
    feedbacks_rating_only = [
        _feedback("f-empty", text=""),
        _feedback("f-ws", text="   "),
    ]
    # First page: both with-text and rating-only mixed; second page: empty.
    pages = [feedbacks_with_text + feedbacks_rating_only, []]

    def handler(req: httpx.Request) -> httpx.Response:
        path = req.url.path
        calls.append(f"{req.method} {path}")
        if path == "/api/v1/feedbacks/count-unanswered":
            return httpx.Response(200, json={"data": {"countUnanswered": 3, "countUnansweredToday": 0}})
        if path == "/api/v1/feedbacks":
            skip = int(req.url.params.get("skip", "0"))
            page = pages[0] if skip == 0 else []
            return httpx.Response(200, json=_wb_response(page))
        if path == "/api/v1/feedbacks/answer":
            body = json.loads(req.read())
            posted.append(body)
            return httpx.Response(200, json={"error": False})
        return httpx.Response(404)

    monkeypatch.setattr(cli, "WBSellerClient", _make_client_factory(handler))
    monkeypatch.setattr("wb_seller.replier.draft_reply", lambda feedback: _FakeDraft())
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    rc = cli.cmd_auto_reply_wb(_args())
    assert rc == 0

    # Only the one with real text got posted.
    assert len(posted) == 1
    assert posted[0]["id"] == "f-with-text"
    assert posted[0]["text"] == "Готовый ответ от бренда."

    # Rating-only feedbacks are NOT POSTed anywhere (WB has no mark-processed).
    assert not any(c.endswith("/feedbacks/answer") and "f-empty" in c for c in calls)

    out = capsys.readouterr().out
    summary = _first_json_object(out)
    assert summary["status"] == "ok"
    assert summary["replied"] == 1
    assert summary["rating_only_skipped"] == 2
    assert summary["errors"] == 0


def test_auto_reply_wb_treats_pros_cons_as_text(monkeypatch, capsys):
    """A WB feedback with only pros/cons (empty `text`) must still get a reply."""
    wb_db.init_schema()
    posted: list[dict] = []

    fb = _feedback("f-proscons", text="", pros="Ментол бодрит", cons="Упаковка мятая")

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/v1/feedbacks/count-unanswered":
            return httpx.Response(200, json={"data": {"countUnanswered": 1, "countUnansweredToday": 0}})
        if req.url.path == "/api/v1/feedbacks":
            skip = int(req.url.params.get("skip", "0"))
            return httpx.Response(200, json=_wb_response([fb] if skip == 0 else []))
        if req.url.path == "/api/v1/feedbacks/answer":
            posted.append(json.loads(req.read()))
            return httpx.Response(200, json={"error": False})
        return httpx.Response(404)

    monkeypatch.setattr(cli, "WBSellerClient", _make_client_factory(handler))
    monkeypatch.setattr("wb_seller.replier.draft_reply", lambda feedback: _FakeDraft())
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    rc = cli.cmd_auto_reply_wb(_args())
    assert rc == 0
    assert [p["id"] for p in posted] == ["f-proscons"]

    out = capsys.readouterr().out
    summary = _first_json_object(out)
    assert summary["replied"] == 1
    assert summary["rating_only_skipped"] == 0


def test_auto_reply_wb_stops_after_max_replies(monkeypatch, capsys):
    wb_db.init_schema()
    posted: list[dict] = []

    feedbacks = [_feedback(f"f-{i}", text=f"отзыв {i}") for i in range(5)]

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/v1/feedbacks/count-unanswered":
            return httpx.Response(200, json={"data": {"countUnanswered": 1, "countUnansweredToday": 0}})
        if req.url.path == "/api/v1/feedbacks":
            skip = int(req.url.params.get("skip", "0"))
            return httpx.Response(200, json=_wb_response(feedbacks if skip == 0 else []))
        if req.url.path == "/api/v1/feedbacks/answer":
            posted.append(json.loads(req.read()))
            return httpx.Response(200, json={"error": False})
        return httpx.Response(404)

    monkeypatch.setattr(cli, "WBSellerClient", _make_client_factory(handler))
    monkeypatch.setattr("wb_seller.replier.draft_reply", lambda feedback: _FakeDraft())
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    rc = cli.cmd_auto_reply_wb(_args(max_replies=2))
    assert rc == 0
    assert [p["id"] for p in posted] == ["f-0", "f-1"]

    out = capsys.readouterr().out
    summary = _first_json_object(out)
    assert summary["status"] == "ok"
    assert summary["replied"] == 2
    assert summary["max_replies"] == 2


def test_auto_reply_wb_default_posts_one_reply_only(monkeypatch, capsys):
    wb_db.init_schema()
    posted: list[dict] = []

    feedbacks = [
        _feedback("f-a", text="первый"),
        _feedback("f-b", text="второй"),
        _feedback("f-c", text="третий"),
    ]

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/v1/feedbacks/count-unanswered":
            return httpx.Response(200, json={"data": {"countUnanswered": 1, "countUnansweredToday": 0}})
        if req.url.path == "/api/v1/feedbacks":
            skip = int(req.url.params.get("skip", "0"))
            return httpx.Response(200, json=_wb_response(feedbacks if skip == 0 else []))
        if req.url.path == "/api/v1/feedbacks/answer":
            posted.append(json.loads(req.read()))
            return httpx.Response(200, json={"error": False})
        return httpx.Response(404)

    monkeypatch.setattr(cli, "WBSellerClient", _make_client_factory(handler))
    monkeypatch.setattr("wb_seller.replier.draft_reply", lambda feedback: _FakeDraft())
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    rc = cli.cmd_auto_reply_wb(argparse.Namespace(max_replies=1))
    assert rc == 0
    assert len(posted) == 1
    assert posted[0]["id"] == "f-a"


def test_auto_reply_wb_telegram_sends_summary_plus_one_message_per_reply(monkeypatch, capsys):
    wb_db.init_schema()

    feedbacks = [
        {**_feedback("f-1", text="Щётка слишком жёсткая, дёсны кровят."),
         "createdDate": "2026-04-18T07:30:00.000Z"},
        _feedback("f-empty", text=""),
        {**_feedback("f-2", text="Паста супер, зубы стали белее.", rating=5),
         "createdDate": "2026-04-19T15:45:00.000Z"},
    ]

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/v1/feedbacks/count-unanswered":
            return httpx.Response(200, json={"data": {"countUnanswered": 1, "countUnansweredToday": 0}})
        if req.url.path == "/api/v1/feedbacks":
            skip = int(req.url.params.get("skip", "0"))
            return httpx.Response(200, json=_wb_response(feedbacks if skip == 0 else []))
        if req.url.path == "/api/v1/feedbacks/answer":
            return httpx.Response(200, json={"error": False})
        return httpx.Response(404)

    monkeypatch.setattr(cli, "WBSellerClient", _make_client_factory(handler))
    monkeypatch.setattr(
        "wb_seller.replier.draft_reply",
        lambda feedback: _FakeDraft(text=f"Ответ для {feedback['id']}"),
    )
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "fake-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "-100")

    tg_messages: list[str] = []

    def fake_tg_send(token, chat_id, text):
        tg_messages.append(text)

    monkeypatch.setattr(cli, "_tg_send", fake_tg_send)

    rc = cli.cmd_auto_reply_wb(_args())
    assert rc == 0

    # Invariant: pairs are sent inline (right after each POST), summary is
    # sent LAST. This way a mid-run cancel still leaves a TG trail of what
    # was actually published to WB.
    assert len(tg_messages) == 3
    pair1, pair2, summary = tg_messages

    # Pair 1 — f-1 (the first feedback with text in iteration order).
    assert "Щётка слишком жёсткая" in pair1
    assert "Ответ для f-1" in pair1
    assert "<b>Отзыв (WB):</b>" in pair1
    assert "<b>Ответ Das Experten:</b>" in pair1
    assert "2026-04-18 10:30 МСК" in pair1

    # Pair 2 — f-2 (f-empty was skipped as rating-only, no pair sent).
    assert "Паста супер" in pair2
    assert "Ответ для f-2" in pair2
    assert "2026-04-19 18:45 МСК" in pair2

    # Final summary.
    assert "Wildberries Auto-Reply" in summary
    assert "Отвечено: <b>2</b>" in summary
    assert "лимита 5" in summary


def test_auto_reply_wb_continues_when_claude_fails_for_one_feedback(monkeypatch, capsys):
    wb_db.init_schema()
    posted: list[dict] = []

    feedbacks = [
        _feedback("f-ok", text="Хорошо"),
        _feedback("f-fail", text="Плохо"),
    ]

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/v1/feedbacks/count-unanswered":
            return httpx.Response(200, json={"data": {"countUnanswered": 1, "countUnansweredToday": 0}})
        if req.url.path == "/api/v1/feedbacks":
            skip = int(req.url.params.get("skip", "0"))
            return httpx.Response(200, json=_wb_response(feedbacks if skip == 0 else []))
        if req.url.path == "/api/v1/feedbacks/answer":
            body = json.loads(req.read())
            posted.append(body)
            return httpx.Response(200, json={"error": False})
        return httpx.Response(404)

    def fake_draft(feedback):
        if feedback["id"] == "f-fail":
            raise RuntimeError("claude boom")
        return _FakeDraft()

    monkeypatch.setattr(cli, "WBSellerClient", _make_client_factory(handler))
    monkeypatch.setattr("wb_seller.replier.draft_reply", fake_draft)
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)

    rc = cli.cmd_auto_reply_wb(_args())
    assert rc == 1
    assert [p["id"] for p in posted] == ["f-ok"]

    out = capsys.readouterr().out
    summary = _first_json_object(out)
    assert summary["status"] == "partial"
    assert summary["replied"] == 1
    assert summary["errors"] == 1
