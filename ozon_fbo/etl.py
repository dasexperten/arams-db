from .api import OzonFBOAPI
from . import db as fbo_db


def sync_stocks(api: OzonFBOAPI, run_date: str) -> dict:
    """Fetch FBO stock from Ozon and upsert into ozon_fbo_stocks."""
    rows_fetched = 0
    batch: list[dict] = []

    for row in api.stock_on_warehouses_iter():
        batch.append(row)
        if len(batch) >= 500:
            with fbo_db.connect() as conn:
                fbo_db.upsert_stocks(conn, batch, run_date)
            rows_fetched += len(batch)
            batch = []

    if batch:
        with fbo_db.connect() as conn:
            fbo_db.upsert_stocks(conn, batch, run_date)
        rows_fetched += len(batch)

    return {"rows_fetched": rows_fetched, "run_date": run_date}


def sync_sales(api: OzonFBOAPI, days: int = 30) -> dict:
    """Fetch ordered_units analytics from Ozon and upsert into ozon_fbo_sales."""
    from datetime import date

    run_date = date.today().isoformat()
    rows: list[dict] = []

    for item in api.analytics_sales_iter(days=days):
        rows.append(item)

    regional = sum(1 for r in rows if r.get("warehouse"))
    print(f"[ozon-fbo-etl] sync_sales: {len(rows)} rows total, "
          f"{regional} with region, {len(rows) - regional} without (global)", flush=True)

    with fbo_db.connect() as conn:
        fbo_db.upsert_sales(conn, rows, run_date)

    return {"rows_fetched": len(rows), "run_date": run_date, "regional_rows": regional}
