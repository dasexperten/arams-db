from datetime import datetime

from . import db
from .api import WBFeedbacksAPI
from .client import WBSellerClient


def sync_feedbacks(
    client: WBSellerClient,
    is_answered: bool = False,
    page_size: int = 1000,
    max_feedbacks: int | None = None,
) -> dict:
    """Stream feedbacks from WB API into SQLite.

    Default: unanswered only (is_answered=False). Pass is_answered=True to
    backfill already-answered ones (useful for analytics over our own replies).
    """
    api = WBFeedbacksAPI(client)
    started = datetime.utcnow().isoformat()
    feedbacks: list[dict] = []
    try:
        for f in api.feedbacks_iter(is_answered=is_answered, page_size=page_size):
            feedbacks.append(f)
            if max_feedbacks is not None and len(feedbacks) >= max_feedbacks:
                break
    except Exception as e:
        with db.connect() as conn:
            db.log_run(conn, "sync_feedbacks", started, datetime.utcnow().isoformat(),
                       "error", rows_written=0, error=str(e))
        raise

    written = 0
    try:
        with db.connect() as conn:
            written = db.upsert_feedbacks(conn, feedbacks)
            db.log_run(conn, "sync_feedbacks", started, datetime.utcnow().isoformat(),
                       "ok", rows_written=written)
    except Exception as e:
        with db.connect() as conn:
            db.log_run(conn, "sync_feedbacks", started, datetime.utcnow().isoformat(),
                       "error", rows_written=written, error=str(e))
        raise

    return {
        "feedbacks_fetched": len(feedbacks),
        "feedbacks_written": written,
        "is_answered": is_answered,
    }
