import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


SCHEMA = """
CREATE TABLE IF NOT EXISTS feedbacks (
    feedback_id         TEXT PRIMARY KEY,
    nm_id               INTEGER,
    imt_id              INTEGER,
    supplier_article    TEXT,
    product_name        TEXT,
    brand_name          TEXT,
    rating              INTEGER NOT NULL,
    text                TEXT,
    pros                TEXT,
    cons                TEXT,
    user_name           TEXT,
    state               TEXT,
    is_answered         INTEGER DEFAULT 0,
    answer_text         TEXT,
    answer_state        TEXT,
    photos_amount       INTEGER DEFAULT 0,
    has_video           INTEGER DEFAULT 0,
    was_viewed          INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL,
    raw_json            TEXT,
    fetched_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fb_answered ON feedbacks(is_answered, created_at);
CREATE INDEX IF NOT EXISTS idx_fb_rating ON feedbacks(rating);
CREATE INDEX IF NOT EXISTS idx_fb_nm ON feedbacks(nm_id);

CREATE TABLE IF NOT EXISTS wb_seller_runs (
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
    path = os.environ.get("WB_SELLER_DB_PATH") or "data/wb_seller.db"
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


def upsert_feedbacks(conn: sqlite3.Connection, feedbacks: list[dict]) -> int:
    sql = """
    INSERT INTO feedbacks (
        feedback_id, nm_id, imt_id, supplier_article, product_name, brand_name,
        rating, text, pros, cons, user_name, state, is_answered,
        answer_text, answer_state, photos_amount, has_video, was_viewed,
        created_at, raw_json, fetched_at
    ) VALUES (
        :feedback_id, :nm_id, :imt_id, :supplier_article, :product_name, :brand_name,
        :rating, :text, :pros, :cons, :user_name, :state, :is_answered,
        :answer_text, :answer_state, :photos_amount, :has_video, :was_viewed,
        :created_at, :raw_json, datetime('now')
    )
    ON CONFLICT(feedback_id) DO UPDATE SET
        nm_id=excluded.nm_id,
        imt_id=excluded.imt_id,
        supplier_article=excluded.supplier_article,
        product_name=excluded.product_name,
        brand_name=excluded.brand_name,
        rating=excluded.rating,
        text=excluded.text,
        pros=excluded.pros,
        cons=excluded.cons,
        user_name=excluded.user_name,
        state=excluded.state,
        is_answered=excluded.is_answered,
        answer_text=excluded.answer_text,
        answer_state=excluded.answer_state,
        photos_amount=excluded.photos_amount,
        has_video=excluded.has_video,
        was_viewed=excluded.was_viewed,
        created_at=excluded.created_at,
        raw_json=excluded.raw_json,
        fetched_at=datetime('now')
    """
    payload = [_feedback_row(f) for f in feedbacks if f.get("id")]
    if not payload:
        return 0
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
        "INSERT INTO wb_seller_runs (job, started_at, finished_at, status, rows_written, error) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (job, started_at, finished_at, status, rows_written, error),
    )


def _feedback_row(f: dict) -> dict:
    prod = f.get("productDetails") or {}
    answer = f.get("answer") if isinstance(f.get("answer"), dict) else None
    photos = f.get("photoLinks") or []
    video = f.get("video")
    return {
        "feedback_id": str(f["id"]),
        "nm_id": prod.get("nmId"),
        "imt_id": prod.get("imtId"),
        "supplier_article": prod.get("supplierArticle"),
        "product_name": prod.get("productName"),
        "brand_name": prod.get("brandName"),
        "rating": int(f.get("productValuation") or 0),
        "text": f.get("text"),
        "pros": f.get("pros"),
        "cons": f.get("cons"),
        "user_name": f.get("userName"),
        "state": f.get("state"),
        "is_answered": 1 if answer and answer.get("text") else 0,
        "answer_text": answer.get("text") if answer else None,
        "answer_state": answer.get("state") if answer else None,
        "photos_amount": len(photos) if photos else 0,
        "has_video": 1 if video else 0,
        "was_viewed": 1 if f.get("wasViewed") else 0,
        "created_at": f.get("createdDate") or "",
        "raw_json": json.dumps(f, ensure_ascii=False),
    }
