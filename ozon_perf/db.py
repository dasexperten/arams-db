import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


SCHEMA = """
CREATE TABLE IF NOT EXISTS campaigns (
    campaign_id     TEXT PRIMARY KEY,
    title           TEXT,
    state           TEXT,
    advertising_type TEXT,
    payment_type    TEXT,
    start_date      TEXT,
    end_date        TEXT,
    budget          REAL,
    daily_budget    REAL,
    raw_json        TEXT,
    fetched_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaign_daily_stats (
    campaign_id     TEXT NOT NULL,
    date            TEXT NOT NULL,
    views           INTEGER DEFAULT 0,
    clicks          INTEGER DEFAULT 0,
    orders          INTEGER DEFAULT 0,
    revenue         REAL DEFAULT 0,
    money_spent     REAL DEFAULT 0,
    avg_bid         REAL,
    ctr             REAL,
    drr             REAL,
    raw_json        TEXT,
    loaded_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (campaign_id, date)
);

CREATE TABLE IF NOT EXISTS sku_daily_stats (
    campaign_id     TEXT NOT NULL,
    sku             TEXT NOT NULL,
    date            TEXT NOT NULL,
    views           INTEGER DEFAULT 0,
    clicks          INTEGER DEFAULT 0,
    orders          INTEGER DEFAULT 0,
    revenue         REAL DEFAULT 0,
    money_spent     REAL DEFAULT 0,
    raw_json        TEXT,
    loaded_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (campaign_id, sku, date)
);

CREATE TABLE IF NOT EXISTS etl_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job             TEXT NOT NULL,
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    status          TEXT,
    rows_written    INTEGER,
    error           TEXT
);
"""


def _db_path() -> str:
    path = os.environ.get("OZON_PERF_DB_PATH") or "data/ozon_performance.db"
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return path


@contextmanager
def connect(path: str | None = None) -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(path or _db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schema(path: str | None = None) -> None:
    with connect(path) as conn:
        conn.executescript(SCHEMA)


def upsert_campaigns(conn: sqlite3.Connection, rows: list[dict]) -> int:
    import json
    sql = """
    INSERT INTO campaigns (campaign_id, title, state, advertising_type, payment_type,
                           start_date, end_date, budget, daily_budget, raw_json, fetched_at)
    VALUES (:campaign_id, :title, :state, :advertising_type, :payment_type,
            :start_date, :end_date, :budget, :daily_budget, :raw_json, datetime('now'))
    ON CONFLICT(campaign_id) DO UPDATE SET
        title=excluded.title,
        state=excluded.state,
        advertising_type=excluded.advertising_type,
        payment_type=excluded.payment_type,
        start_date=excluded.start_date,
        end_date=excluded.end_date,
        budget=excluded.budget,
        daily_budget=excluded.daily_budget,
        raw_json=excluded.raw_json,
        fetched_at=datetime('now')
    """
    payload = []
    for r in rows:
        payload.append({
            "campaign_id": str(r.get("id") or r.get("campaignId") or r.get("campaign_id")),
            "title": r.get("title") or r.get("name"),
            "state": r.get("state"),
            "advertising_type": r.get("advertisingObjectType") or r.get("advertisingType"),
            "payment_type": r.get("paymentType"),
            "start_date": r.get("fromDate") or r.get("startDate"),
            "end_date": r.get("toDate") or r.get("endDate"),
            "budget": _to_float(r.get("budget")),
            "daily_budget": _to_float(r.get("dailyBudget")),
            "raw_json": json.dumps(r, ensure_ascii=False),
        })
    conn.executemany(sql, payload)
    return len(payload)


def upsert_campaign_daily(conn: sqlite3.Connection, rows: list[dict]) -> int:
    import json
    sql = """
    INSERT INTO campaign_daily_stats
        (campaign_id, date, views, clicks, orders, revenue, money_spent,
         avg_bid, ctr, drr, raw_json, loaded_at)
    VALUES (:campaign_id, :date, :views, :clicks, :orders, :revenue, :money_spent,
            :avg_bid, :ctr, :drr, :raw_json, datetime('now'))
    ON CONFLICT(campaign_id, date) DO UPDATE SET
        views=excluded.views,
        clicks=excluded.clicks,
        orders=excluded.orders,
        revenue=excluded.revenue,
        money_spent=excluded.money_spent,
        avg_bid=excluded.avg_bid,
        ctr=excluded.ctr,
        drr=excluded.drr,
        raw_json=excluded.raw_json,
        loaded_at=datetime('now')
    """
    defaults = {"views": 0, "clicks": 0, "orders": 0, "revenue": 0.0,
                "money_spent": 0.0, "avg_bid": None, "ctr": None, "drr": None}
    payload = [
        {**defaults, **r, "raw_json": json.dumps(r.get("raw") or r, ensure_ascii=False)}
        for r in rows
    ]
    conn.executemany(sql, payload)
    return len(payload)


def upsert_sku_daily(conn: sqlite3.Connection, rows: list[dict]) -> int:
    import json
    sql = """
    INSERT INTO sku_daily_stats
        (campaign_id, sku, date, views, clicks, orders, revenue, money_spent, raw_json, loaded_at)
    VALUES (:campaign_id, :sku, :date, :views, :clicks, :orders, :revenue, :money_spent,
            :raw_json, datetime('now'))
    ON CONFLICT(campaign_id, sku, date) DO UPDATE SET
        views=excluded.views,
        clicks=excluded.clicks,
        orders=excluded.orders,
        revenue=excluded.revenue,
        money_spent=excluded.money_spent,
        raw_json=excluded.raw_json,
        loaded_at=datetime('now')
    """
    defaults = {"views": 0, "clicks": 0, "orders": 0, "revenue": 0.0, "money_spent": 0.0}
    payload = [
        {**defaults, **r, "raw_json": json.dumps(r.get("raw") or r, ensure_ascii=False)}
        for r in rows
    ]
    conn.executemany(sql, payload)
    return len(payload)


def log_run(
    conn: sqlite3.Connection,
    job: str,
    started_at: str,
    finished_at: str | None,
    status: str,
    rows_written: int | None = None,
    error: str | None = None,
) -> None:
    conn.execute(
        "INSERT INTO etl_runs (job, started_at, finished_at, status, rows_written, error) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (job, started_at, finished_at, status, rows_written, error),
    )


def _to_float(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
