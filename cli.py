import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta

from dotenv import load_dotenv

from ozon_perf import OzonPerformanceClient
from ozon_perf import analyze, dashboard, db, etl
from ozon_seller import OzonSellerClient, SellerAPI
from ozon_seller import db as seller_db
from ozon_seller import etl as seller_etl


def _parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def cmd_init(_: argparse.Namespace) -> int:
    db.init_schema()
    seller_db.init_schema()
    print("perf schema ready:  ", db._db_path())
    print("seller schema ready:", seller_db._db_path())
    return 0


def cmd_ping_seller(_: argparse.Namespace) -> int:
    with OzonSellerClient() as c:
        data = SellerAPI(c).reviews_count()
    print("seller auth ok, review counts:")
    print(json.dumps(data, indent=2, ensure_ascii=False))
    return 0


def cmd_sync_reviews(args: argparse.Namespace) -> int:
    seller_db.init_schema()
    with OzonSellerClient() as c:
        result = seller_etl.sync_reviews(
            c,
            status=args.status,
            max_reviews=args.max,
            with_comments=args.with_comments,
        )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def cmd_list_recent(args: argparse.Namespace) -> int:
    with OzonSellerClient() as c:
        page = SellerAPI(c).reviews_list(
            status=args.status, limit=args.count, sort_dir="DESC",
        )
    reviews = page.get("reviews") or []
    if not reviews:
        print(f"(no reviews found with status={args.status})")
        return 0
    print(f"{len(reviews)} most recent reviews (status={args.status}):")
    print("=" * 90)
    for r in reviews:
        rid = r.get("id", "")
        rating = r.get("rating", "?")
        sku = r.get("sku", "")
        author = r.get("author") or r.get("name") or "(anonymous)"
        published = (r.get("published_at") or "")[:19]
        text = (r.get("text") or "").strip().replace("\n", " ")
        preview = text[:120] + ("…" if len(text) > 120 else "")
        if not preview:
            preview = "(no text, rating-only review)"
        print(f"id: {rid}")
        print(f"    ⭐ {rating}/5   SKU: {sku}   by: {author}   on: {published}")
        print(f"    “{preview}”")
        print("-" * 90)
    print()
    print("Pick an id and run: python cli.py draft-reply <id>")
    return 0


def cmd_draft_reply(args: argparse.Namespace) -> int:
    from ozon_seller.replier import draft_reply
    with OzonSellerClient() as c:
        info = SellerAPI(c).review_info(args.review_id)
    review = info.get("result") if isinstance(info.get("result"), dict) else info
    if not review or "id" not in review:
        review = {**(review or {}), "id": args.review_id}
    print("=" * 70)
    print(f"Review {args.review_id}")
    print("=" * 70)
    print(f"Author: {review.get('author') or review.get('name') or '(anonymous)'}")
    print(f"Rating: {review.get('rating')}/5   SKU: {review.get('sku')}")
    print(f"Published: {review.get('published_at')}")
    print("-" * 70)
    print(review.get("text") or "(empty review text)")
    print("=" * 70)
    print()
    draft = draft_reply(review)
    print("DRAFT REPLY:")
    print("-" * 70)
    print(draft.text)
    print("-" * 70)
    print(
        f"[{draft.model}] in={draft.input_tokens} out={draft.output_tokens} "
        f"cache_read={draft.cache_read_input_tokens} cache_write={draft.cache_creation_input_tokens} "
        f"stop={draft.stop_reason} chars={len(draft.text)}"
    )
    print()
    print("To post this draft as-is, run:")
    print(f"  python cli.py post-reply {args.review_id} \"<paste approved text here>\"")
    return 0


def cmd_post_reply(args: argparse.Namespace) -> int:
    if not args.text.strip():
        print("error: empty reply text", file=sys.stderr)
        return 1
    if args.confirm != "YES":
        print("refusing to post without --confirm YES (safety guard)", file=sys.stderr)
        print("the reply is public and cannot be edited after sending.", file=sys.stderr)
        return 1
    with OzonSellerClient() as c:
        result = SellerAPI(c).comment_create(
            review_id=args.review_id,
            text=args.text,
            mark_review_as_processed=not args.keep_unprocessed,
        )
    print("posted:")
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def cmd_auto_reply(args: argparse.Namespace) -> int:
    """Fetch all UNPROCESSED reviews, let Claude draft a reply for each one
    that has non-empty text, post it via Seller API (Ozon marks the review
    PROCESSED atomically). Reviews with no text are just marked PROCESSED.
    """
    from ozon_seller.replier import draft_reply

    max_per_run = args.max_per_run
    seller_db.init_schema()

    with OzonSellerClient() as c:
        api = SellerAPI(c)

        reviews: list[dict] = []
        for r in api.reviews_iter(status="UNPROCESSED"):
            reviews.append(r)
            if len(reviews) > max_per_run:
                break

        if len(reviews) > max_per_run:
            summary = {
                "status": "aborted",
                "reason": f"more than {max_per_run} UNPROCESSED reviews, refusing to auto-post",
                "seen": len(reviews),
            }
            print(json.dumps(summary, indent=2, ensure_ascii=False))
            _telegram_autoreply(summary, errors=[])
            return 2

        replied: list[dict] = []
        no_text_marked: list[str] = []
        errors: list[dict] = []

        for review in reviews:
            review_id = str(review.get("id") or "").strip()
            if not review_id:
                errors.append({"stage": "validate", "error": "review missing id"})
                continue

            text = (review.get("text") or "").strip()
            if not text:
                try:
                    api.change_status([review_id], "PROCESSED")
                    no_text_marked.append(review_id)
                except Exception as e:
                    errors.append({"review_id": review_id, "stage": "mark_no_text",
                                   "error": str(e)})
                continue

            try:
                draft = draft_reply(review)
            except Exception as e:
                errors.append({"review_id": review_id, "stage": "draft",
                               "error": str(e)})
                continue

            draft_text = (draft.text or "").strip()
            if not draft_text:
                errors.append({"review_id": review_id, "stage": "draft",
                               "error": "empty draft text"})
                continue

            try:
                api.comment_create(
                    review_id=review_id,
                    text=draft_text,
                    mark_review_as_processed=True,
                )
                replied.append({
                    "review_id": review_id,
                    "chars": len(draft_text),
                    "question": text,
                    "answer": draft_text,
                    "rating": review.get("rating"),
                    "author": review.get("author") or review.get("name") or "",
                    "sku": review.get("sku"),
                })
            except Exception as e:
                errors.append({"review_id": review_id, "stage": "post",
                               "error": str(e)})

        summary = {
            "status": "ok" if not errors else "partial",
            "total_unprocessed": len(reviews),
            "replied": len(replied),
            "no_text_marked": len(no_text_marked),
            "errors": len(errors),
        }
        print(json.dumps(summary, indent=2, ensure_ascii=False))
        if errors:
            print("errors:")
            print(json.dumps(errors, indent=2, ensure_ascii=False))

        _telegram_autoreply(summary, errors=errors, replied=replied)

    return 0 if not errors else 1


def _tg_send(token: str, chat_id: str, text: str) -> None:
    import httpx
    httpx.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": "HTML",
              "disable_web_page_preview": True},
        timeout=15,
    )


def _telegram_autoreply(summary: dict, errors: list[dict],
                        replied: list[dict] | None = None) -> None:
    import html

    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return

    status = summary.get("status")
    if status == "aborted":
        text = (
            "<b>🛑 Ozon Auto-Reply: стоп-кран</b>\n\n"
            f"UNPROCESSED отзывов больше лимита ({summary.get('seen')}), "
            "ничего не запостили. Проверь руками, прежде чем запускать снова."
        )
    else:
        flag = "✅" if status == "ok" else "⚠️"
        text = (
            f"<b>{flag} Ozon Auto-Reply</b>\n\n"
            f"Всего UNPROCESSED: <b>{summary.get('total_unprocessed')}</b>\n"
            f"Отвечено: <b>{summary.get('replied')}</b>\n"
            f"Без текста (помечены PROCESSED): <b>{summary.get('no_text_marked')}</b>\n"
            f"Ошибок: <b>{summary.get('errors')}</b>"
        )
        if errors:
            preview = errors[:3]
            text += "\n\nПервые ошибки:\n" + "\n".join(
                f"• {e.get('review_id', '?')} [{e.get('stage')}]: {e.get('error', '')[:100]}"
                for e in preview
            )

    try:
        _tg_send(token, chat_id, text)
    except Exception as e:
        print(f"(telegram notify failed: {e})", file=sys.stderr)

    for item in (replied or []):
        stars = "⭐" * int(item.get("rating") or 0) if item.get("rating") else ""
        author = item.get("author") or "(без имени)"
        sku = item.get("sku") or ""
        header = f"{stars} {html.escape(str(author))}"
        if sku:
            header += f" · SKU {html.escape(str(sku))}"
        question = html.escape((item.get("question") or "").strip())
        answer = html.escape((item.get("answer") or "").strip())
        # Telegram hard limit is 4096; keep a safety margin for the formatting.
        if len(question) > 1500:
            question = question[:1500] + "…"
        if len(answer) > 1500:
            answer = answer[:1500] + "…"
        msg = (
            f"{header}\n\n"
            f"<b>Отзыв:</b>\n<i>{question or '(пустой)'}</i>\n\n"
            f"<b>Ответ Das Experten:</b>\n{answer}"
        )
        try:
            _tg_send(token, chat_id, msg)
        except Exception as e:
            print(f"(telegram Q/A send failed for {item.get('review_id')}: {e})",
                  file=sys.stderr)


def cmd_telegram_ping(args: argparse.Namespace) -> int:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("Telegram not configured (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing)",
              file=sys.stderr)
        return 1
    text = args.text or (
        "<b>✅ Telegram подключён</b>\n\n"
        "Это тестовое сообщение из <code>Ozon Auto-Reply</code>. "
        "Если ты его видишь — бот и chat_id настроены правильно, "
        "дальше сюда будут прилетать сводки и пары «отзыв + ответ»."
    )
    _tg_send(token, chat_id, text)
    print("telegram: sent ok")
    return 0


def cmd_mark_reviews(args: argparse.Namespace) -> int:
    if not args.review_ids:
        print("no review_ids given")
        return 1
    with OzonSellerClient() as c:
        result = SellerAPI(c).change_status(args.review_ids, args.status)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def cmd_ping(_: argparse.Namespace) -> int:
    with OzonPerformanceClient() as c:
        c._auth_header()
        print("auth ok, token cached")
    return 0


def cmd_sync_campaigns(_: argparse.Namespace) -> int:
    db.init_schema()
    with OzonPerformanceClient() as c:
        n = etl.sync_campaigns(c)
    print(f"campaigns upserted: {n}")
    return 0


def cmd_sync_daily(args: argparse.Namespace) -> int:
    db.init_schema()
    if args.days:
        date_to = date.today() - timedelta(days=1)
        date_from = date_to - timedelta(days=args.days - 1)
    else:
        date_from = _parse_date(args.date_from)
        date_to = _parse_date(args.date_to)
    with OzonPerformanceClient() as c:
        n = etl.sync_daily_stats(c, date_from, date_to, args.campaigns or None)
    print(f"daily rows upserted: {n} ({date_from}..{date_to})")
    return 0


def cmd_sync_sku(args: argparse.Namespace) -> int:
    db.init_schema()
    if args.days:
        date_to = date.today() - timedelta(days=1)
        date_from = date_to - timedelta(days=args.days - 1)
    else:
        date_from = _parse_date(args.date_from)
        date_to = _parse_date(args.date_to)
    with OzonPerformanceClient() as c:
        n = etl.sync_sku_stats(c, date_from, date_to, args.campaigns or None,
                               group_by=args.group_by)
    print(f"SKU rows upserted: {n} ({date_from}..{date_to})")
    return 0


def cmd_sync_all(args: argparse.Namespace) -> int:
    db.init_schema()
    with OzonPerformanceClient() as c:
        result = etl.sync_last_n_days(c, days=args.days)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def cmd_kpi(args: argparse.Namespace) -> int:
    date_to = _parse_date(args.date_to) if args.date_to else date.today() - timedelta(days=1)
    date_from = _parse_date(args.date_from) if args.date_from else date_to - timedelta(days=6)

    totals = analyze.totals(date_from, date_to)
    print(f"--- totals {date_from}..{date_to} ---")
    print(json.dumps(totals, indent=2, ensure_ascii=False, default=str))

    print(f"\n--- top {args.limit} campaigns by spend ---")
    rows = analyze.kpi_by_campaign(date_from, date_to, limit=args.limit)
    _print_table(rows)

    if args.sku:
        print(f"\n--- top {args.limit} SKUs by spend ---")
        rows = analyze.kpi_by_sku(date_from, date_to, limit=args.limit)
        _print_table(rows)
    return 0


def _print_table(rows: list[dict]) -> None:
    if not rows:
        print("(no data)")
        return
    headers = list(rows[0].keys())
    widths = {h: max(len(h), *(len(_fmt(r.get(h))) for r in rows)) for h in headers}
    print(" | ".join(h.ljust(widths[h]) for h in headers))
    print("-+-".join("-" * widths[h] for h in headers))
    for r in rows:
        print(" | ".join(_fmt(r.get(h)).ljust(widths[h]) for h in headers))


def _fmt(v) -> str:
    if v is None:
        return "-"
    if isinstance(v, float):
        return f"{v:.4f}" if abs(v) < 1 else f"{v:.2f}"
    return str(v)


def cmd_debug(args: argparse.Namespace) -> int:
    print("=" * 70)
    print("DEBUG: raw Ozon Performance API responses")
    print("=" * 70)

    with OzonPerformanceClient() as c:
        print("\n--- GET /api/client/campaign ---")
        resp = c.request("GET", "/api/client/campaign")
        print("status:", resp.status_code)
        print("body (first 3000 chars):")
        print(resp.text[:3000])

        date_to = date.today() - timedelta(days=1)
        date_from = date_to - timedelta(days=6)

        from ozon_perf.api import PerformanceAPI
        api = PerformanceAPI(c)
        campaigns = api.list_campaigns()
        print(f"\n--- list_campaigns() parsed {len(campaigns)} items ---")
        if campaigns:
            print("first campaign dict:")
            print(json.dumps(campaigns[0], ensure_ascii=False, indent=2, default=str))

        if campaigns:
            first_ids = [str(c.get("id") or c.get("campaignId")) for c in campaigns[:3]]
            first_ids = [x for x in first_ids if x and x != "None"]
            print(f"\n--- GET /api/client/statistics/daily/json for {first_ids} ---")
            try:
                resp = c.request("GET", "/api/client/statistics/daily/json", params={
                    "campaign_ids": first_ids,
                    "date_from": date_from.isoformat(),
                    "date_to": date_to.isoformat(),
                })
                print("status:", resp.status_code)
                print("body (first 3000 chars):")
                print(resp.text[:3000])
            except Exception as e:
                print("error:", e)
    return 0


def cmd_notify_telegram(args: argparse.Namespace) -> int:
    import html
    import httpx

    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("Telegram not configured (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID), skipping")
        return 0

    repo = os.environ.get("GITHUB_REPOSITORY", "dasexperten/arams-db")
    branch = os.environ.get("GITHUB_REF_NAME", "claude/explore-capabilities-b9Hjh")
    dashboard_url = f"https://raw.githack.com/{repo}/{branch}/samples/dashboard.html"

    if args.status == "success":
        date_to = date.today() - timedelta(days=1)
        date_from = date_to - timedelta(days=args.days - 1)
        totals = analyze.totals(date_from, date_to)

        def fmt_money(v):
            return f"{v:,.0f}".replace(",", " ") if v else "0"
        def fmt_int(v):
            return f"{v:,}".replace(",", " ") if v else "0"
        def fmt_pct(v):
            return f"{v * 100:.2f}%" if v is not None else "—"
        def fmt_roas(v):
            return f"{v:.2f}x" if v is not None else "—"

        drr = totals.get("drr")
        drr_flag = "\U0001f7e2" if drr is not None and drr < 0.3 else "\U0001f534"

        text = (
            f"<b>✅ Ozon Performance обновлён</b>\n\n"
            f"\U0001f4c5 <b>{date_from}…{date_to}</b> ({args.days} дней)\n"
            f"\U0001f441 Показы: <b>{fmt_int(totals.get('views') or 0)}</b>\n"
            f"\U0001f446 Клики: <b>{fmt_int(totals.get('clicks') or 0)}</b>\n"
            f"\U0001f4e6 Заказы: <b>{fmt_int(totals.get('orders') or 0)}</b>\n"
            f"\U0001f4b0 Выручка: <b>{fmt_money(totals.get('revenue'))} ₽</b>\n"
            f"\U0001f4b8 Расход: <b>{fmt_money(totals.get('spent'))} ₽</b>\n"
            f"{drr_flag} ДРР: <b>{fmt_pct(drr)}</b>\n"
            f"\U0001f3af ROAS: <b>{fmt_roas(totals.get('roas'))}</b>\n\n"
            f"<a href=\"{html.escape(dashboard_url)}\">Открыть дашборд</a>"
        )
    else:
        run_url = args.run_url or ""
        text = (
            f"<b>❌ Ozon Performance: ошибка синхронизации</b>\n\n"
            f"Не удалось обновить данные. "
            + (f"<a href=\"{html.escape(run_url)}\">Посмотреть лог</a>" if run_url else "")
        )

    resp = httpx.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
        timeout=15,
    )
    print("telegram:", resp.status_code, resp.text[:300])
    resp.raise_for_status()
    return 0


def cmd_dashboard(args: argparse.Namespace) -> int:
    from pathlib import Path
    out = Path(args.out)
    if args.demo:
        dashboard.write_demo(out)
        print(f"demo dashboard written: {out.resolve()}")
        return 0
    db.init_schema()
    if args.days:
        date_to = date.today() - timedelta(days=1)
        date_from = date_to - timedelta(days=args.days - 1)
    else:
        date_to = _parse_date(args.date_to) if args.date_to else date.today() - timedelta(days=1)
        date_from = _parse_date(args.date_from) if args.date_from else date_to - timedelta(days=6)
    dashboard.write(out, date_from, date_to, db_path_label=os.environ.get("OZON_PERF_DB_PATH", ""))
    print(f"dashboard written: {out.resolve()} ({date_from}..{date_to})")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ozon-perf", description="Ozon Performance API ETL & analytics")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="Create SQLite schema (perf + seller)").set_defaults(func=cmd_init)
    sub.add_parser("ping", help="Test Performance credentials / token fetch").set_defaults(func=cmd_ping)
    sub.add_parser("ping-seller", help="Test Seller API credentials (calls /v1/review/count)")\
        .set_defaults(func=cmd_ping_seller)
    sub.add_parser("sync-campaigns", help="Fetch campaign list").set_defaults(func=cmd_sync_campaigns)

    sr = sub.add_parser("sync-reviews", help="Fetch reviews from Seller API into SQLite")
    sr.add_argument("--status", choices=["UNPROCESSED", "PROCESSED", "ALL"], default="ALL")
    sr.add_argument("--max", type=int, default=None,
                    help="Stop after N reviews (default: all)")
    sr.add_argument("--with-comments", action="store_true",
                    help="Also pull comments for reviews with comments_amount > 0")
    sr.set_defaults(func=cmd_sync_reviews)

    mr = sub.add_parser("mark-reviews", help="Mark reviews PROCESSED / UNPROCESSED (safe write)")
    mr.add_argument("--status", choices=["PROCESSED", "UNPROCESSED"], required=True)
    mr.add_argument("review_ids", nargs="+")
    mr.set_defaults(func=cmd_mark_reviews)

    lr = sub.add_parser(
        "list-recent",
        help="Print the most recent Ozon reviews with id + preview (no DB write, no POST)",
    )
    lr.add_argument("--status", choices=["UNPROCESSED", "PROCESSED", "ALL"], default="UNPROCESSED")
    lr.add_argument("--count", type=int, default=20, help="How many reviews to show (Ozon requires 20-100)")
    lr.set_defaults(func=cmd_list_recent)

    dr = sub.add_parser(
        "draft-reply",
        help="Fetch a review and generate a draft reply via Claude API (no POST)",
    )
    dr.add_argument("review_id")
    dr.set_defaults(func=cmd_draft_reply)

    pr = sub.add_parser(
        "post-reply",
        help="PUBLICLY post an approved reply to Ozon. Requires --confirm YES.",
    )
    pr.add_argument("review_id")
    pr.add_argument("text", help="The exact approved reply text to publish")
    pr.add_argument("--confirm", default="", help='Pass "YES" to acknowledge the reply is public and irreversible')
    pr.add_argument(
        "--keep-unprocessed",
        action="store_true",
        help="Do NOT mark review as processed after posting (default: mark as processed)",
    )
    pr.set_defaults(func=cmd_post_reply)

    ar = sub.add_parser(
        "auto-reply",
        help="END-TO-END: fetch UNPROCESSED reviews, draft via Claude, post automatically",
    )
    ar.add_argument(
        "--max-per-run", type=int, default=10,
        help="Safety stop: if more UNPROCESSED reviews than this, abort without posting (default: 10)",
    )
    ar.set_defaults(func=cmd_auto_reply)

    tp = sub.add_parser(
        "telegram-ping",
        help="Send a single test message to the Telegram chat (for smoke-testing secrets)",
    )
    tp.add_argument("--text", default=None,
                    help="Custom message text (default: preset 'it works' message)")
    tp.set_defaults(func=cmd_telegram_ping)

    sd = sub.add_parser("sync-daily", help="Fetch daily campaign stats")
    sd.add_argument("--from", dest="date_from")
    sd.add_argument("--to", dest="date_to")
    sd.add_argument("--days", type=int, help="Last N days (ending yesterday)")
    sd.add_argument("--campaigns", nargs="*", help="Campaign IDs (default: all)")
    sd.set_defaults(func=cmd_sync_daily)

    ss = sub.add_parser("sync-sku", help="Fetch SKU-level stats via async report")
    ss.add_argument("--from", dest="date_from")
    ss.add_argument("--to", dest="date_to")
    ss.add_argument("--days", type=int, help="Last N days (ending yesterday)")
    ss.add_argument("--campaigns", nargs="*", help="Campaign IDs (default: all)")
    ss.add_argument("--group-by", default="DATE", help="DATE | NO_GROUP_BY | PLACEMENT")
    ss.set_defaults(func=cmd_sync_sku)

    sa = sub.add_parser("sync-all", help="Sync campaigns + last N days of stats")
    sa.add_argument("--days", type=int, default=7)
    sa.set_defaults(func=cmd_sync_all)

    kpi = sub.add_parser("kpi", help="Print KPIs by campaign and SKU")
    kpi.add_argument("--from", dest="date_from")
    kpi.add_argument("--to", dest="date_to")
    kpi.add_argument("--limit", type=int, default=20)
    kpi.add_argument("--sku", action="store_true")
    kpi.set_defaults(func=cmd_kpi)

    sub.add_parser("debug", help="Print raw Ozon API responses (no secrets leaked)")\
        .set_defaults(func=cmd_debug)

    tg = sub.add_parser("notify-telegram", help="Send summary/failure to Telegram")
    tg.add_argument("--status", choices=["success", "failure"], default="success")
    tg.add_argument("--days", type=int, default=7)
    tg.add_argument("--run-url", default=None)
    tg.set_defaults(func=cmd_notify_telegram)

    dash = sub.add_parser("dashboard", help="Generate HTML dashboard with charts")
    dash.add_argument("--from", dest="date_from")
    dash.add_argument("--to", dest="date_to")
    dash.add_argument("--days", type=int, help="Last N days (ending yesterday)")
    dash.add_argument("--out", default="dashboard.html")
    dash.add_argument("--demo", action="store_true", help="Use synthetic data (no DB needed)")
    dash.set_defaults(func=cmd_dashboard)

    return p


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
