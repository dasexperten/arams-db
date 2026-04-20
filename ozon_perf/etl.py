from datetime import date, datetime, timedelta

from . import db
from .api import PerformanceAPI
from .client import OzonPerformanceClient


def sync_campaigns(client: OzonPerformanceClient) -> int:
    api = PerformanceAPI(client)
    started = datetime.utcnow().isoformat()
    campaigns = api.list_campaigns()
    with db.connect() as conn:
        written = db.upsert_campaigns(conn, campaigns)
        db.log_run(conn, "sync_campaigns", started, datetime.utcnow().isoformat(),
                   "ok", rows_written=written)
    return written


def sync_daily_stats(
    client: OzonPerformanceClient,
    date_from: date,
    date_to: date,
    campaign_ids: list[str] | None = None,
) -> int:
    api = PerformanceAPI(client)
    started = datetime.utcnow().isoformat()

    if campaign_ids is None:
        campaigns = api.list_campaigns()
        campaign_ids = [str(c.get("id") or c.get("campaignId")) for c in campaigns]
        campaign_ids = [c for c in campaign_ids if c and c != "None"]

    if not campaign_ids:
        with db.connect() as conn:
            db.log_run(conn, "sync_daily_stats", started, datetime.utcnow().isoformat(),
                       "no_campaigns", rows_written=0)
        return 0

    total = 0
    try:
        for chunk in _chunks(campaign_ids, 10):
            response = api.daily_statistics(chunk, date_from, date_to)
            rows = _flatten_daily(response)
            with db.connect() as conn:
                total += db.upsert_campaign_daily(conn, rows)
        with db.connect() as conn:
            db.log_run(conn, "sync_daily_stats", started, datetime.utcnow().isoformat(),
                       "ok", rows_written=total)
    except Exception as e:
        with db.connect() as conn:
            db.log_run(conn, "sync_daily_stats", started, datetime.utcnow().isoformat(),
                       "error", rows_written=total, error=str(e))
        raise
    return total


def sync_last_n_days(client: OzonPerformanceClient, days: int = 7) -> dict:
    today = date.today()
    date_from = today - timedelta(days=days)
    date_to = today - timedelta(days=1)
    campaigns_written = sync_campaigns(client)
    daily_written = sync_daily_stats(client, date_from, date_to)
    return {
        "campaigns": campaigns_written,
        "daily_rows": daily_written,
        "range": f"{date_from.isoformat()}..{date_to.isoformat()}",
    }


def _chunks(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _flatten_daily(payload: dict) -> list[dict]:
    rows: list[dict] = []
    for campaign_block in payload.get("rows") or payload.get("list") or []:
        campaign_id = str(campaign_block.get("id") or campaign_block.get("campaignId") or "")
        for day in campaign_block.get("rows") or campaign_block.get("days") or []:
            rows.append({
                "campaign_id": campaign_id,
                "date": day.get("date"),
                "views": _int(day.get("views") or day.get("impressions")),
                "clicks": _int(day.get("clicks")),
                "orders": _int(day.get("orders")),
                "revenue": _float(day.get("revenue") or day.get("ordersMoney")),
                "money_spent": _float(day.get("moneySpent") or day.get("cost")),
                "avg_bid": _float(day.get("avgBid")),
                "ctr": _float(day.get("ctr")),
                "drr": _float(day.get("drr")),
                "raw": day,
            })
    return rows


def _int(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def _float(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0
