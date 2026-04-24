import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .clusters import warehouse_to_cluster


SCHEMA = """
CREATE TABLE IF NOT EXISTS ozon_fbo_stocks (
    sku             INTEGER NOT NULL,
    warehouse       TEXT NOT NULL DEFAULT '',
    run_date        TEXT NOT NULL,
    offer_id        TEXT,
    item_name       TEXT,
    present_stock   INTEGER DEFAULT 0,
    raw_payload     TEXT,
    synced_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (sku, warehouse, run_date)
);

CREATE INDEX IF NOT EXISTS idx_ozon_fbo_stocks_date ON ozon_fbo_stocks(run_date);
CREATE INDEX IF NOT EXISTS idx_ozon_fbo_stocks_offer ON ozon_fbo_stocks(offer_id, run_date);

CREATE TABLE IF NOT EXISTS ozon_fbo_sales (
    sku         TEXT NOT NULL,
    run_date    TEXT NOT NULL,
    orders_30d  INTEGER DEFAULT 0,
    synced_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (sku, run_date)
);

CREATE TABLE IF NOT EXISTS ozon_fbo_plans (
    sku         TEXT NOT NULL,
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
    PRIMARY KEY (sku, cluster, run_date)
);

CREATE INDEX IF NOT EXISTS idx_ozon_fbo_plans_date ON ozon_fbo_plans(run_date);

CREATE TABLE IF NOT EXISTS ozon_fbo_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date        TEXT NOT NULL,
    stocks_rows     INTEGER,
    sales_rows      INTEGER,
    plans_created   INTEGER,
    warnings        INTEGER,
    excel_path      TEXT,
    exit_code       INTEGER,
    started_at      TEXT NOT NULL,
    finished_at     TEXT
);
"""


def _db_path() -> str:
    path = os.environ.get("OZON_FBO_DB_PATH") or "data/ozon_fbo.db"
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
    INSERT INTO ozon_fbo_stocks (
        sku, warehouse, run_date, offer_id, item_name, present_stock, raw_payload, synced_at
    ) VALUES (
        :sku, :warehouse, :run_date, :offer_id, :item_name,
        :present_stock, :raw_payload, datetime('now')
    )
    ON CONFLICT(sku, warehouse, run_date) DO UPDATE SET
        offer_id=excluded.offer_id, item_name=excluded.item_name,
        present_stock=excluded.present_stock, raw_payload=excluded.raw_payload,
        synced_at=datetime('now')
    """
    rows = [_stock_row(s, run_date) for s in stocks if s.get("sku")]
    if rows:
        conn.executemany(sql, rows)
    return len(rows)


def upsert_sales(conn: sqlite3.Connection, sales: list[dict], run_date: str) -> int:
    sql = """
    INSERT INTO ozon_fbo_sales (sku, run_date, orders_30d, synced_at)
    VALUES (:sku, :run_date, :orders_30d, datetime('now'))
    ON CONFLICT(sku, run_date) DO UPDATE SET
        orders_30d=excluded.orders_30d, synced_at=datetime('now')
    """
    rows = [{"sku": str(s["sku"]), "run_date": run_date, "orders_30d": s.get("orders_30d", 0)}
            for s in sales if s.get("sku")]
    if rows:
        conn.executemany(sql, rows)
    return len(rows)


def upsert_plans(conn: sqlite3.Connection, plans: list[dict], run_date: str) -> int:
    sql = """
    INSERT INTO ozon_fbo_plans (sku, cluster, run_date, stock, sales_30d, k, zone,
                                pack_size, to_ship, flag, created_at)
    VALUES (:sku, :cluster, :run_date, :stock, :sales_30d, :k, :zone,
            :pack_size, :to_ship, :flag, datetime('now'))
    ON CONFLICT(sku, cluster, run_date) DO UPDATE SET
        stock=excluded.stock, sales_30d=excluded.sales_30d, k=excluded.k,
        zone=excluded.zone, pack_size=excluded.pack_size, to_ship=excluded.to_ship,
        flag=excluded.flag, created_at=datetime('now')
    """
    rows = [{**p, "run_date": run_date} for p in plans]
    if rows:
        conn.executemany(sql, rows)
    return len(rows)


def load_plan_inputs(conn: sqlite3.Connection, run_date: str | None = None) -> list[dict]:
    """Aggregate stocks + sales into plan input rows grouped by (offer_id, cluster).

    Stocks are per warehouse → mapped to cluster and summed.
    Analytics returns by numeric Ozon SKU → joined with stocks by numeric SKU.
    Plan uses text offer_id as the SKU key (needed for pack-size detection).
    """
    if run_date is None:
        row = conn.execute("SELECT MAX(run_date) FROM ozon_fbo_stocks").fetchone()
        run_date = row[0] if row and row[0] else None
    if not run_date:
        return []

    # Sales map: numeric_sku (str) → orders_30d
    sales_map: dict[str, int] = {}
    for row in conn.execute(
        "SELECT sku, orders_30d FROM ozon_fbo_sales WHERE run_date = ?", (run_date,)
    ):
        sales_map[str(row[0])] = int(row[1] or 0)

    cluster_data: dict[tuple, dict] = {}
    for row in conn.execute(
        """SELECT sku, offer_id, warehouse, SUM(present_stock) as qty
           FROM ozon_fbo_stocks WHERE run_date = ?
           GROUP BY sku, offer_id, warehouse""",
        (run_date,),
    ):
        numeric_sku = str(row[0] or "")
        offer_id = row[1] or ""
        if not offer_id:
            continue
        cluster = warehouse_to_cluster(row[2] or "")
        key = (offer_id, cluster)
        if key not in cluster_data:
            cluster_data[key] = {
                "sku": offer_id,       # text offer code for pack-size detection
                "cluster": cluster,
                "stock": 0,
                "sales_30d": sales_map.get(numeric_sku, 0),
            }
        cluster_data[key]["stock"] += int(row[3] or 0)

    return sorted(cluster_data.values(), key=lambda x: (x["sku"], x["cluster"]))


def log_run(conn: sqlite3.Connection, **kwargs) -> int:
    cols = ", ".join(kwargs.keys())
    placeholders = ", ".join(f":{k}" for k in kwargs.keys())
    cur = conn.execute(
        f"INSERT INTO ozon_fbo_runs ({cols}) VALUES ({placeholders})", kwargs
    )
    return cur.lastrowid


def _stock_row(s: dict, run_date: str) -> dict:
    return {
        "sku": s.get("sku") or s.get("item_id"),
        "warehouse": s.get("warehouse_name") or "",
        "run_date": run_date,
        "offer_id": s.get("item_code") or s.get("offer_id") or "",
        "item_name": s.get("item_name") or "",
        "present_stock": int(s.get("free_to_sell_amount") or s.get("fbo_present_stock") or s.get("present_stock") or 0),
        "raw_payload": json.dumps(s, ensure_ascii=False),
    }
