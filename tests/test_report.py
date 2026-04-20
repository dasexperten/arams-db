from ozon_perf.report import parse_report_bytes


def test_parse_semicolon_russian_headers():
    csv = (
        "Дата;SKU;Показы;Клики;Заказы;Выручка;Расход\n"
        "19.04.2026;12345;1 000;50;3;4 500,50;300,25\n"
        "18.04.2026;12345;800;40;2;3000;250\n"
    )
    rows = parse_report_bytes(csv.encode("utf-8"), default_campaign_id="C1")
    assert len(rows) == 2
    r0 = rows[0]
    assert r0["campaign_id"] == "C1"
    assert r0["sku"] == "12345"
    assert r0["date"] == "2026-04-19"
    assert r0["views"] == 1000.0
    assert r0["clicks"] == 50.0
    assert r0["orders"] == 3.0
    assert r0["revenue"] == 4500.50
    assert r0["money_spent"] == 300.25


def test_parse_comma_english_headers():
    csv = (
        "date,sku,views,clicks,orders,revenue,money_spent,campaign_id\n"
        "2026-04-19,SKU-7,500,20,1,2000,150,42\n"
    )
    rows = parse_report_bytes(csv.encode("utf-8"))
    assert len(rows) == 1
    assert rows[0]["campaign_id"] == "42"
    assert rows[0]["date"] == "2026-04-19"
    assert rows[0]["views"] == 500.0


def test_parse_empty_payload():
    assert parse_report_bytes(b"") == []


def test_parse_zip_report():
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("report.csv", "date;sku;views\n2026-04-19;X;10\n")
    rows = parse_report_bytes(buf.getvalue(), default_campaign_id="CZ")
    assert rows and rows[0]["sku"] == "X" and rows[0]["views"] == 10.0
