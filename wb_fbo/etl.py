from datetime import datetime, timedelta

from . import db
from .api import WBFBOAPI


def sync_stocks(api: WBFBOAPI, run_date: str) -> dict:
    """Fetch all stocks pages into fbo_stocks. Throttle is inside stocks_report_iter."""
    started = datetime.utcnow().isoformat()
    all_stocks: list[dict] = []
    pages = 0

    try:
        for page, _has_more in api.stocks_report_iter():
            all_stocks.extend(page)
            pages += 1
    except Exception as e:
        with db.connect() as conn:
            db.log_run(conn, run_date=run_date, stocks_pages=pages,
                       stocks_rows=len(all_stocks), sales_rows=0, plans_created=0,
                       warnings=0, exit_code=2,
                       started_at=started, finished_at=datetime.utcnow().isoformat())
        raise

    written = 0
    with db.connect() as conn:
        written = db.upsert_stocks(conn, all_stocks, run_date)

    return {"pages": pages, "rows_fetched": len(all_stocks), "rows_written": written}


def sync_sales(api: WBFBOAPI, days: int = 30) -> dict:
    """Fetch sales for last N days into fbo_sales. Returns+sales both stored;
    is_return flag set by saleID prefix (S=sale, R=return)."""
    started = datetime.utcnow().isoformat()
    date_from = datetime.utcnow() - timedelta(days=days)

    sales = api.sales_list(date_from)

    written = 0
    with db.connect() as conn:
        written = db.upsert_sales(conn, sales)

    returns = sum(1 for s in sales if str(s.get("saleID") or "").startswith("R"))
    return {
        "rows_fetched": len(sales),
        "rows_written": written,
        "sales": len(sales) - returns,
        "returns": returns,
        "date_from": date_from.strftime("%Y-%m-%d"),
    }
