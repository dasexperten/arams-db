from datetime import datetime

from . import db
from .api import SellerAPI
from .client import OzonSellerClient


def sync_reviews(
    client: OzonSellerClient,
    status: str = "ALL",
    page_size: int = 100,
    max_reviews: int | None = None,
    with_comments: bool = False,
) -> dict:
    api = SellerAPI(client)
    started = datetime.utcnow().isoformat()
    reviews: list[dict] = []
    try:
        for review in api.reviews_iter(status=status, page_size=page_size):
            reviews.append(review)
            if max_reviews is not None and len(reviews) >= max_reviews:
                break
    except Exception as e:
        with db.connect() as conn:
            db.log_run(conn, "sync_reviews", started, datetime.utcnow().isoformat(),
                       "error", rows_written=0, error=str(e))
        raise

    written = 0
    comments_written = 0
    try:
        with db.connect() as conn:
            written = db.upsert_reviews(conn, reviews)
        if with_comments:
            for review in reviews:
                if (review.get("comments_amount") or 0) <= 0:
                    continue
                review_id = str(review["id"])
                comments = list(api.comments_iter(review_id))
                if not comments:
                    continue
                with db.connect() as conn:
                    comments_written += db.upsert_comments(conn, review_id, comments)
        with db.connect() as conn:
            db.log_run(conn, "sync_reviews", started, datetime.utcnow().isoformat(),
                       "ok", rows_written=written + comments_written)
    except Exception as e:
        with db.connect() as conn:
            db.log_run(conn, "sync_reviews", started, datetime.utcnow().isoformat(),
                       "error", rows_written=written, error=str(e))
        raise

    return {
        "reviews_fetched": len(reviews),
        "reviews_written": written,
        "comments_written": comments_written,
        "status_filter": status,
    }


def sync_comments_for_review(client: OzonSellerClient, review_id: str) -> int:
    api = SellerAPI(client)
    comments = list(api.comments_iter(review_id))
    if not comments:
        return 0
    with db.connect() as conn:
        return db.upsert_comments(conn, review_id, comments)
