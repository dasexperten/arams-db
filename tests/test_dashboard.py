import json
import re
from datetime import date
from pathlib import Path

from ozon_perf import dashboard, db


def _extract_data(html: str) -> dict:
    m = re.search(r"const DATA = (\{.*?\});", html, re.DOTALL)
    assert m, "DATA block not found"
    return json.loads(m.group(1))


def test_render_uses_real_db(tmp_path, monkeypatch):
    monkeypatch.setenv("OZON_PERF_DB_PATH", str(tmp_path / "d.db"))
    db.init_schema()
    with db.connect() as conn:
        db.upsert_campaigns(conn, [{"id": "1", "title": "Alpha", "state": "RUNNING"}])
        db.upsert_campaign_daily(conn, [
            {"campaign_id": "1", "date": "2026-04-18", "views": 100, "clicks": 10,
             "orders": 1, "revenue": 500, "money_spent": 50},
            {"campaign_id": "1", "date": "2026-04-19", "views": 200, "clicks": 20,
             "orders": 2, "revenue": 900, "money_spent": 90},
        ])

    html = dashboard.render(date(2026, 4, 18), date(2026, 4, 19))
    assert "__DATA__" not in html and "__RANGE__" not in html
    data = _extract_data(html)
    assert data["totals"]["views"] == 300
    assert data["totals"]["revenue"] == 1400
    assert len(data["timeline"]) == 2
    assert data["campaigns"][0]["title"] == "Alpha"


def test_demo_is_self_contained(tmp_path):
    out = dashboard.write_demo(tmp_path / "demo.html")
    html = Path(out).read_text(encoding="utf-8")
    assert "chart.js" in html.lower()
    data = _extract_data(html)
    assert data["totals"]["views"] > 0
    assert len(data["campaigns"]) >= 5
    assert len(data["skus"]) == 20
    assert len(data["timeline"]) == 7


def test_write_creates_file(tmp_path, monkeypatch):
    monkeypatch.setenv("OZON_PERF_DB_PATH", str(tmp_path / "d.db"))
    db.init_schema()
    out = tmp_path / "nested" / "dash.html"
    result = dashboard.write(out, date(2026, 4, 1), date(2026, 4, 7))
    assert result.exists()
    assert result.read_text(encoding="utf-8").startswith("<!doctype html>")
