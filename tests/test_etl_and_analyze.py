from datetime import date

import httpx

from ozon_perf import analyze, db, etl
from ozon_perf.client import OzonPerformanceClient


def _client(handler):
    c = OzonPerformanceClient()
    c._http = httpx.Client(transport=httpx.MockTransport(handler), base_url=c.base_url)
    return c


def test_sync_campaigns_and_daily():
    def handler(req):
        if req.url.path == "/api/client/token":
            return httpx.Response(200, json={"access_token": "T", "expires_in": 1800})
        if req.url.path == "/api/client/campaign":
            return httpx.Response(200, json={"list": [
                {"id": "1", "title": "Alpha", "state": "RUNNING",
                 "advertisingObjectType": "SKU", "budget": "1000"},
                {"id": "2", "title": "Beta", "state": "STOPPED",
                 "advertisingObjectType": "SEARCH_PROMO", "budget": "500"},
            ]})
        if req.url.path == "/api/client/statistics/daily/json":
            assert req.method == "GET"
            assert "campaignIds" in req.url.params
            return httpx.Response(200, json={"rows": [
                {"id": "1", "rows": [
                    {"date": "2026-04-18", "views": 100, "clicks": 10,
                     "orders": 1, "revenue": 500, "moneySpent": 50},
                    {"date": "2026-04-19", "views": 200, "clicks": 20,
                     "orders": 2, "revenue": 900, "moneySpent": 90},
                ]},
                {"id": "2", "rows": [
                    {"date": "2026-04-18", "views": 50, "clicks": 5,
                     "orders": 0, "revenue": 0, "moneySpent": 40},
                ]},
            ]})
        return httpx.Response(404)

    c = _client(handler)
    db.init_schema()

    assert etl.sync_campaigns(c) == 2
    assert etl.sync_daily_stats(c, date(2026, 4, 18), date(2026, 4, 19)) == 3

    totals = analyze.totals(date(2026, 4, 18), date(2026, 4, 19))
    assert totals["views"] == 350
    assert totals["clicks"] == 35
    assert totals["orders"] == 3
    assert totals["revenue"] == 1400.0
    assert totals["spent"] == 180.0
    assert totals["drr"] == 180 / 1400
    assert totals["roas"] == 1400 / 180

    by_camp = {r["campaign_id"]: r for r in
               analyze.kpi_by_campaign(date(2026, 4, 18), date(2026, 4, 19))}
    alpha = by_camp["1"]
    assert alpha["title"] == "Alpha"
    assert alpha["orders"] == 3
    assert alpha["cpo"] == 140 / 3
    assert alpha["drr"] == 140 / 1400


def test_sync_is_idempotent():
    def handler(req):
        if req.url.path == "/api/client/token":
            return httpx.Response(200, json={"access_token": "T", "expires_in": 1800})
        if req.url.path == "/api/client/campaign":
            return httpx.Response(200, json={"list": [
                {"id": "1", "title": "Alpha", "state": "RUNNING"}
            ]})
        if req.url.path == "/api/client/statistics/daily/json":
            assert req.method == "GET"
            return httpx.Response(200, json={"rows": [
                {"id": "1", "rows": [
                    {"date": "2026-04-19", "views": 100, "clicks": 10,
                     "orders": 1, "revenue": 500, "moneySpent": 50},
                ]},
            ]})
        return httpx.Response(404)

    c = _client(handler)
    db.init_schema()
    etl.sync_daily_stats(c, date(2026, 4, 19), date(2026, 4, 19))
    etl.sync_daily_stats(c, date(2026, 4, 19), date(2026, 4, 19))

    with db.connect() as conn:
        count = conn.execute("SELECT COUNT(*) FROM campaign_daily_stats").fetchone()[0]
    assert count == 1
