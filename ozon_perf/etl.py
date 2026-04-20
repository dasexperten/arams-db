from datetime import date, datetime, timedelta

from . import db
from .api import PerformanceAPI
from .client import OzonPerformanceClient
from .report import parse_report_bytes


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


def sync_sku_stats(
    client: OzonPerformanceClient,
    date_from: date,
    date_to: date,
    campaign_ids: list[str] | None = None,
    group_by: str = "DATE",
    poll_interval: float = 5.0,
    timeout: float = 600.0,
) -> int:
    api = PerformanceAPI(client)
    started = datetime.utcnow().isoformat()

    if campaign_ids is None:
        campaigns = api.list_campaigns()
        campaign_ids = [str(c.get("id") or c.get("campaignId")) for c in campaigns]
        campaign_ids = [c for c in campaign_ids if c and c != "None"]

    if not campaign_ids:
        with db.connect() as conn:
            db.log_run(conn, "sync_sku_stats", started, datetime.utcnow().isoformat(),
                       "no_campaigns", rows_written=0)
        return 0

    total = 0
    try:
        for chunk in _chunks(campaign_ids, 10):
            uuid = api.submit_statistics_report(chunk, date_from, date_to, group_by=group_by)
            payload = api.wait_for_report(uuid, poll_interval=poll_interval, timeout=timeout)
            default_cid = chunk[0] if len(chunk) == 1 else None
            rows = [r for r in parse_report_bytes(payload, default_campaign_id=default_cid)
                    if r.get("sku") and r.get("campaign_id") and r.get("date")]
            if rows:
                with db.connect() as conn:
                    total += db.upsert_sku_daily(conn, rows)
        with db.connect() as conn:
            db.log_run(conn, "sync_sku_stats", started, datetime.utcnow().isoformat(),
                       "ok", rows_written=total)
    except Exception as e:
        with db.connect() as conn:
            db.log_run(conn, "sync_sku_stats", started, datetime.utcnow().isoformat(),
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
    raw_rows = payload.get("rows") or payload.get("list") or []
    for item in raw_rows:
        nested = item.get("rows") or item.get("days")
        if isinstance(nested, list):
            campaign_id = str(item.get("id") or item.get("campaignId") or "")
            for day in nested:
                rows.append(_day_row(campaign_id, day))
        else:
            campaign_id = str(item.get("id") or item.get("campaignId") or "")
            rows.append(_day_row(campaign_id, item))
    return [r for r in rows if r["date"] and r["campaign_id"]]


def _day_row(campaign_id: str, day: dict) -> dict:
    return {
        "campaign_id": campaign_id,
        "date": day.get("date"),
        "views": _int(day.get("views") or day.get("impressions")),
        "clicks": _int(day.get("clicks")),
        "orders": _int(day.get("orders")),
        "revenue": _float(day.get("ordersMoney") or day.get("revenue")),
        "money_spent": _float(day.get("moneySpent") or day.get("cost")),
        "avg_bid": _float(day.get("avgBid")),
        "ctr": _float(day.get("ctr")),
        "drr": _float(day.get("drr")),
        "raw": day,
    }


def _clean_num(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip().replace("\xa0", "").replace(" ", "").replace(",", ".").rstrip("%")
    return s if s and s != "-" else None


def _int(v) -> int:
    s = _clean_num(v)
    if s is None:
        return 0
    try:
        return int(s)
    except ValueError:
        try:
            return int(float(s))
        except ValueError:
            return 0


def _float(v) -> float:
    s = _clean_num(v)
    if s is None:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0
