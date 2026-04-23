import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


SCHEMA = """
CREATE TABLE IF NOT EXISTS reviews (
    review_id           TEXT PRIMARY KEY,
    sku                 TEXT NOT NULL,
    rating              INTEGER NOT NULL,
    text                TEXT,
    status              TEXT,
    order_status        TEXT,
    is_rating_participant INTEGER DEFAULT 0,
    photos_amount       INTEGER DEFAULT 0,
    videos_amount       INTEGER DEFAULT 0,
    comments_amount     INTEGER DEFAULT 0,
    published_at        TEXT NOT NULL,
    raw_json            TEXT,
    fetched_at          TEXT NOT NULL DEFAULT (datetime('now')),
    auto_replied_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status, published_at);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_sku ON reviews(sku);

CREATE TABLE IF NOT EXISTS review_comments (
    comment_id          INTEGER PRIMARY KEY,
    review_id           TEXT NOT NULL,
    text                TEXT NOT NULL,
    is_owner            INTEGER NOT NULL DEFAULT 0,
    parent_comment_id   INTEGER,
    published_at        TEXT NOT NULL,
    raw_json            TEXT,
    fetched_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_review ON review_comments(review_id);

CREATE TABLE IF NOT EXISTS product_skus (
    ozon_sku    TEXT PRIMARY KEY,
    offer_id    TEXT NOT NULL,
    synced_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS answered_questions (
    question_id TEXT PRIMARY KEY,
    answered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seller_runs (
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
    path = os.environ.get("OZON_SELLER_DB_PATH") or "data/ozon_seller.db"
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
        # migrate existing DBs that predate auto_replied_at column
        try:
            conn.execute("ALTER TABLE reviews ADD COLUMN auto_replied_at TEXT")
        except Exception:
            pass


def mark_auto_replied(conn: sqlite3.Connection, review_id: str) -> None:
    conn.execute(
        "UPDATE reviews SET auto_replied_at = datetime('now') WHERE review_id = ?",
        (review_id,),
    )


def already_replied(conn: sqlite3.Connection, review_id: str) -> bool:
    row = conn.execute(
        "SELECT auto_replied_at FROM reviews WHERE review_id = ? AND auto_replied_at IS NOT NULL",
        (review_id,),
    ).fetchone()
    return row is not None


def upsert_reviews(conn: sqlite3.Connection, reviews: list[dict]) -> int:
    sql = """
    INSERT INTO reviews (
        review_id, sku, rating, text, status, order_status,
        is_rating_participant, photos_amount, videos_amount, comments_amount,
        published_at, raw_json, fetched_at
    ) VALUES (
        :review_id, :sku, :rating, :text, :status, :order_status,
        :is_rating_participant, :photos_amount, :videos_amount, :comments_amount,
        :published_at, :raw_json, datetime('now')
    )
    ON CONFLICT(review_id) DO UPDATE SET
        sku=excluded.sku,
        rating=excluded.rating,
        text=excluded.text,
        status=excluded.status,
        order_status=excluded.order_status,
        is_rating_participant=excluded.is_rating_participant,
        photos_amount=excluded.photos_amount,
        videos_amount=excluded.videos_amount,
        comments_amount=excluded.comments_amount,
        published_at=excluded.published_at,
        raw_json=excluded.raw_json,
        fetched_at=datetime('now')
    """
    payload = [_review_row(r) for r in reviews if r.get("id")]
    if not payload:
        return 0
    conn.executemany(sql, payload)
    return len(payload)


def upsert_comments(conn: sqlite3.Connection, review_id: str, comments: list[dict]) -> int:
    sql = """
    INSERT INTO review_comments (
        comment_id, review_id, text, is_owner, parent_comment_id,
        published_at, raw_json, fetched_at
    ) VALUES (
        :comment_id, :review_id, :text, :is_owner, :parent_comment_id,
        :published_at, :raw_json, datetime('now')
    )
    ON CONFLICT(comment_id) DO UPDATE SET
        text=excluded.text,
        is_owner=excluded.is_owner,
        parent_comment_id=excluded.parent_comment_id,
        published_at=excluded.published_at,
        raw_json=excluded.raw_json,
        fetched_at=datetime('now')
    """
    payload = [_comment_row(review_id, c) for c in comments if c.get("id") is not None]
    if not payload:
        return 0
    conn.executemany(sql, payload)
    return len(payload)


def upsert_product_skus(conn: sqlite3.Connection, rows: list[dict]) -> int:
    """Cache ozon_sku → offer_id mappings."""
    sql = """
    INSERT INTO product_skus (ozon_sku, offer_id, synced_at)
    VALUES (:ozon_sku, :offer_id, datetime('now'))
    ON CONFLICT(ozon_sku) DO UPDATE SET
        offer_id=excluded.offer_id,
        synced_at=datetime('now')
    """
    payload = [r for r in rows if r.get("ozon_sku") and r.get("offer_id")]
    if not payload:
        return 0
    conn.executemany(sql, payload)
    return len(payload)


def sku_to_offer_id(conn: sqlite3.Connection) -> dict[str, str]:
    """Return full {ozon_sku: offer_id} mapping from cache."""
    try:
        rows = conn.execute("SELECT ozon_sku, offer_id FROM product_skus").fetchall()
        return {r["ozon_sku"]: r["offer_id"] for r in rows}
    except Exception:
        return {}


def is_question_answered(conn: sqlite3.Connection, question_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM answered_questions WHERE question_id = ?", (question_id,)
    ).fetchone()
    return row is not None


def mark_question_answered(conn: sqlite3.Connection, question_id: str) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO answered_questions (question_id, answered_at) "
        "VALUES (?, datetime('now'))",
        (question_id,),
    )


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
        "INSERT INTO seller_runs (job, started_at, finished_at, status, rows_written, error) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (job, started_at, finished_at, status, rows_written, error),
    )


def _review_row(r: dict) -> dict:
    return {
        "review_id": str(r["id"]),
        "sku": str(r.get("sku") or ""),
        "rating": int(r.get("rating") or 0),
        "text": r.get("text"),
        "status": r.get("status"),
        "order_status": r.get("order_status"),
        "is_rating_participant": 1 if r.get("is_rating_participant") else 0,
        "photos_amount": int(r.get("photos_amount") or 0),
        "videos_amount": int(r.get("videos_amount") or 0),
        "comments_amount": int(r.get("comments_amount") or 0),
        "published_at": r.get("published_at") or "",
        "raw_json": json.dumps(r, ensure_ascii=False),
    }


def _comment_row(review_id: str, c: dict) -> dict:
    parent = c.get("parent_comment_id")
    return {
        "comment_id": int(c["id"]),
        "review_id": str(review_id),
        "text": c.get("text") or "",
        "is_owner": 1 if c.get("is_owner") else 0,
        "parent_comment_id": int(parent) if parent else None,
        "published_at": c.get("published_at") or "",
        "raw_json": json.dumps(c, ensure_ascii=False),
    }
