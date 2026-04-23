import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .clusters import warehouse_to_cluster


SCHEMA = """
CREATE TABLE IF NOT EXISTS fbo_stocks (
    nm_id           INTEGER NOT NULL,
    warehouse_id    INTEGER NOT NULL,
    run_date        TEXT NOT NULL,
    vendor_code     TEXT,
    warehouse_name  TEXT,
    region          TEXT,
    quantity        INTEGER DEFAULT 0,
    in_way_to_client    INTEGER DEFAULT 0,
    in_way_from_client  INTEGER DEFAULT 0,
    raw_payload     TEXT,
    synced_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (nm_id, warehouse_id, run_date)
);

CREATE INDEX IF NOT EXISTS idx_fbo_stocks_date ON fbo_stocks(run_date);
CREATE INDEX IF NOT EXISTS idx_fbo_stocks_vc ON fbo_stocks(vendor_code, run_date);

CREATE TABLE IF NOT EXISTS fbo_sales (
    sale_id             TEXT PRIMARY KEY,
    supplier_article    TEXT,
    nm_id               INTEGER,
    warehouse_name      TEXT,
    date                TEXT,
    last_change_date    TEXT,
    for_pay             REAL,
    is_return           INTEGER NOT NULL DEFAULT 0,
    raw_payload         TEXT,
    synced_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fbo_sales_article ON fbo_sales(supplier_article, warehouse_name, is_return);

CREATE TABLE IF NOT EXISTS fbo_plans (
    sku         TEXT NOT NULL,
    warehouse   TEXT NOT NULL,
    cluster     TEXT NOT NULL,
    run_date    TEXT NOT NULL,
    stock       INTEGER,
    sales_30d   INTEGER,
    k           REAL,
    zone        TEXT,
    pack_size   INTEGER,
    to_ship     INTEGER,
    flag        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (sku, warehouse, run_date)
);

CREATE INDEX IF NOT EXISTS idx_fbo_plans_date ON fbo_plans(run_date);
CREATE INDEX IF NOT EXISTS idx_fbo_plans_cluster ON fbo_plans(cluster, run_date);

CREATE TABLE IF NOT EXISTS fbo_runs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date            TEXT NOT NULL,
    stocks_pages        INTEGER,
    stocks_rows         INTEGER,
    sales_rows          INTEGER,
    plans_created       INTEGER,
    warnings            INTEGER,
    excel_path          TEXT,
    artifact_uploaded   INTEGER DEFAULT 0,
    telegram_sent       INTEGER DEFAULT 0,
    exit_code           INTEGER,
    started_at          TEXT NOT NULL,
    finished_at         TEXT
);
"""


def _db_path() -> str:
    path = os.environ.get("WB_FBO_DB_PATH") or "data/wb_fbo.db"
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


def upsert_stocks(conn: sqlite3.Connection, stocks: list[dict], run_date: str) -> int:
    sql = """
    INSERT INTO fbo_stocks (
        nm_id, warehouse_id, run_date, vendor_code, warehouse_name, region,
        quantity, in_way_to_client, in_way_from_client, raw_payload, synced_at
    ) VALUES (
        :nm_id, :warehouse_id, :run_date, :vendor_code, :warehouse_name, :region,
        :quantity, :in_way_to_client, :in_way_from_client, :raw_payload, datetime('now')
    )
    ON CONFLICT(nm_id, warehouse_id, run_date) DO UPDATE SET
        vendor_code=excluded.vendor_code,
        warehouse_name=excluded.warehouse_name,
        region=excluded.region,
        quantity=excluded.quantity,
        in_way_to_client=excluded.in_way_to_client,
        in_way_from_client=excluded.in_way_from_client,
        raw_payload=excluded.raw_payload,
        synced_at=datetime('now')
    """
    rows = [_stock_row(s, run_date) for s in stocks if s.get("nmId") is not None]
    if rows:
        conn.executemany(sql, rows)
    return len(rows)


def upsert_sales(conn: sqlite3.Connection, sales: list[dict]) -> int:
    sql = """
    INSERT INTO fbo_sales (
        sale_id, supplier_article, nm_id, warehouse_name,
        date, last_change_date, for_pay, is_return, raw_payload, synced_at
    ) VALUES (
        :sale_id, :supplier_article, :nm_id, :warehouse_name,
        :date, :last_change_date, :for_pay, :is_return, :raw_payload, datetime('now')
    )
    ON CONFLICT(sale_id) DO UPDATE SET
        supplier_article=excluded.supplier_article,
        nm_id=excluded.nm_id,
        warehouse_name=excluded.warehouse_name,
        date=excluded.date,
        last_change_date=excluded.last_change_date,
        for_pay=excluded.for_pay,
        is_return=excluded.is_return,
        raw_payload=excluded.raw_payload,
        synced_at=datetime('now')
    """
    rows = [_sale_row(s) for s in sales if s.get("saleID")]
    if rows:
        conn.executemany(sql, rows)
    return len(rows)


def upsert_plans(conn: sqlite3.Connection, plans: list[dict], run_date: str) -> int:
    sql = """
    INSERT INTO fbo_plans (sku, warehouse, cluster, run_date, stock, sales_30d, k, zone,
                           pack_size, to_ship, flag, created_at)
    VALUES (:sku, :warehouse, :cluster, :run_date, :stock, :sales_30d, :k, :zone,
            :pack_size, :to_ship, :flag, datetime('now'))
    ON CONFLICT(sku, warehouse, run_date) DO UPDATE SET
        cluster=excluded.cluster,
        stock=excluded.stock, sales_30d=excluded.sales_30d, k=excluded.k,
        zone=excluded.zone, pack_size=excluded.pack_size, to_ship=excluded.to_ship,
        flag=excluded.flag, created_at=datetime('now')
    """
    rows = [{**p, "run_date": run_date} for p in plans]
    if rows:
        conn.executemany(sql, rows)
    return len(rows)


def load_plan_inputs(conn: sqlite3.Connection, run_date: str | None = None) -> list[dict]:
    """Aggregate stocks + sales into plan input rows grouped by (sku, warehouse_name).

    Stocks are aggregated per (vendor_code, warehouse_name).
    Sales are aggregated per (supplier_article, warehouse_name).
    Cluster is derived from warehouse name via warehouse_to_cluster().
    Returns only (is_return=0) sales.
    """
    if run_date is None:
        row = conn.execute("SELECT MAX(run_date) FROM fbo_stocks").fetchone()
        run_date = row[0] if row and row[0] else None

    if not run_date:
        return []

    # Stocks: aggregate per (vendor_code, warehouse_name) — keep raw warehouse granularity
    stocks: dict[tuple, int] = {}
    for row in conn.execute(
        """SELECT vendor_code, warehouse_name, SUM(quantity) as qty
           FROM fbo_stocks WHERE run_date = ? AND vendor_code IS NOT NULL
           GROUP BY vendor_code, warehouse_name""",
        (run_date,),
    ):
        key = (row[0], row[1] or "")
        stocks[key] = int(row[2] or 0)

    # Sales: aggregate per (supplier_article, warehouse_name)
    sales: dict[tuple, int] = {}
    for row in conn.execute(
        """SELECT supplier_article, warehouse_name, COUNT(*) as cnt
           FROM fbo_sales WHERE is_return = 0 AND supplier_article IS NOT NULL
           GROUP BY supplier_article, warehouse_name"""
    ):
        key = (row[0], row[1] or "")
        sales[key] = int(row[2] or 0)

    all_keys = set(stocks.keys()) | set(sales.keys())
    return [
        {
            "sku": sku,
            "warehouse": warehouse,
            "stock": stocks.get((sku, warehouse), 0),
            "sales_30d": sales.get((sku, warehouse), 0),
        }
        for sku, warehouse in sorted(all_keys)
    ]


def log_run(conn: sqlite3.Connection, **kwargs) -> int:
    cols = ", ".join(kwargs.keys())
    placeholders = ", ".join(f":{k}" for k in kwargs.keys())
    cur = conn.execute(
        f"INSERT INTO fbo_runs ({cols}) VALUES ({placeholders})", kwargs
    )
    return cur.lastrowid


def _stock_row(s: dict, run_date: str) -> dict:
    return {
        "nm_id": s.get("nmId"),
        "warehouse_id": s.get("warehouseId") or 0,
        "run_date": run_date,
        "vendor_code": s.get("vendorCode"),
        "warehouse_name": s.get("warehouseName"),
        "region": s.get("region"),
        "quantity": int(s.get("quantity") or 0),
        "in_way_to_client": int(s.get("inWayToClient") or 0),
        "in_way_from_client": int(s.get("inWayFromClient") or 0),
        "raw_payload": json.dumps(s, ensure_ascii=False),
    }


def _sale_row(s: dict) -> dict:
    sale_id = str(s.get("saleID") or "")
    return {
        "sale_id": sale_id,
        "supplier_article": s.get("supplierArticle"),
        "nm_id": s.get("nmId"),
        "warehouse_name": s.get("warehouseName"),
        "date": s.get("date"),
        "last_change_date": s.get("lastChangeDate"),
        "for_pay": s.get("forPay"),
        "is_return": 1 if sale_id.startswith("R") else 0,
        "raw_payload": json.dumps(s, ensure_ascii=False),
    }
