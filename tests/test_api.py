from datetime import date

import httpx

from ozon_perf.api import PerformanceAPI
from ozon_perf.client import OzonPerformanceClient


def _client(handler):
    c = OzonPerformanceClient()
    c._http = httpx.Client(transport=httpx.MockTransport(handler), base_url=c.base_url)
    return c


def test_list_campaigns_list_key():
    def handler(req):
        if req.url.path == "/api/client/token":
            return httpx.Response(200, json={"access_token": "T", "expires_in": 1800})
        if req.url.path == "/api/client/campaign":
            return httpx.Response(200, json={"list": [{"id": "1"}, {"id": "2"}]})
        return httpx.Response(404)

    api = PerformanceAPI(_client(handler))
    assert [c["id"] for c in api.list_campaigns()] == ["1", "2"]


def test_async_report_flow():
    state = {"calls": 0}

    def handler(req):
        if req.url.path == "/api/client/token":
            return httpx.Response(200, json={"access_token": "T", "expires_in": 1800})
        if req.url.path == "/api/client/statistics":
            return httpx.Response(200, json={"UUID": "abc-123"})
        if req.url.path == "/api/client/statistics/abc-123":
            state["calls"] += 1
            if state["calls"] < 2:
                return httpx.Response(200, json={"state": "IN_PROGRESS"})
            return httpx.Response(200, json={"state": "OK"})
        if req.url.path == "/api/client/statistics/report":
            assert req.url.params["UUID"] == "abc-123"
            return httpx.Response(200, content=b"date;sku;views\n2026-04-19;SKU1;100\n")
        return httpx.Response(404)

    api = PerformanceAPI(_client(handler))
    uuid = api.submit_statistics_report(["1"], date(2026, 4, 1), date(2026, 4, 19))
    assert uuid == "abc-123"
    payload = api.wait_for_report(uuid, poll_interval=0, timeout=5)
    assert payload.startswith(b"date;sku;views")
