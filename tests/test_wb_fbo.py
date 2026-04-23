"""Tests for wb_fbo module.

Covers all cases from SKILL.md:
- K-calculation zones (0.8/1.2 boundaries)
- Packaging detection + ROUNDUP
- Edge cases: no sales, out-of-stock, hidden deficit, negatives
- DB aggregation: duplicates sum correctly
- Return filter (saleID R vs S)
- Pagination stop on < 250 000 rows
- Cluster mapping: CLUSTER_MAP exact match + fallback + UNKNOWN flag
"""

import json
import sqlite3
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from wb_fbo.calc import (
    ZONE_DEFICIT, ZONE_NORMAL, ZONE_OVERSTOCK,
    calculate_plan, classify_zone, detect_pack_size, roundup_to_multiple,
)
from wb_fbo import db as fbo_db
from wb_fbo.report import build_summary
from wb_fbo.clusters import warehouse_to_cluster, CLUSTER_MAP, CLUSTER_UNKNOWN


# ---------------------------------------------------------------------------
# calc.py — zone classification
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("k,expected_zone", [
    (0.0,  ZONE_DEFICIT),
    (0.79, ZONE_DEFICIT),
    (0.8,  ZONE_NORMAL),
    (1.0,  ZONE_NORMAL),
    (1.2,  ZONE_NORMAL),
    (1.21, ZONE_OVERSTOCK),
    (5.0,  ZONE_OVERSTOCK),
])
def test_k_calculation_zones(k, expected_zone):
    assert classify_zone(k) == expected_zone


# ---------------------------------------------------------------------------
# calc.py — packaging detection
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("sku,expected_pack", [
    ("DE201", 72),
    ("DE206", 72),
    ("DE210", 72),
    ("DE201 AA", 36),
    ("DE206 AAAA", 36),
    ("DE210 набор", 36),
    ("DE119", 288),
    ("DE101", 288),
    ("DE105", 288),
    ("DE117", 288),
    ("DE119 AAAA", 144),
    ("DE101 AA", 144),
    ("DE111", None),   # accessory/floss
    ("DE112", None),
    ("DE115", None),
    ("DE125", None),
    ("DE126", None),
    ("UNKNOWN-SKU", None),
    ("XYZ", None),
    ("", None),
])
def test_packaging_detection(sku, expected_pack):
    assert detect_pack_size(sku) == expected_pack


def test_packaging_rounding():
    # DE201 → pack=72. stock=50, sales=120 → target=180, raw=130 → ROUNDUP(130/72)*72=144
    rows = [{"sku": "DE201", "warehouse": "Коледино", "stock": 50, "sales_30d": 120}]
    plans = calculate_plan(rows)
    assert plans[0]["to_ship"] == 144
    assert plans[0]["zone"] == ZONE_DEFICIT

    # DE201 AA → pack=36. stock=0, sales=10 → target=15, raw=15 → ROUNDUP(15/36)*36=36
    rows = [{"sku": "DE201 AA", "warehouse": "Коледино", "stock": 0, "sales_30d": 10}]
    plans = calculate_plan(rows)
    assert plans[0]["to_ship"] == 36

    # DE119 → pack=288. stock=100, sales=200 → target=300, raw=200 → ROUNDUP(200/288)*288=288
    rows = [{"sku": "DE119", "warehouse": "Коледино", "stock": 100, "sales_30d": 200}]
    plans = calculate_plan(rows)
    assert plans[0]["to_ship"] == 288

    # DE119 AAAA → pack=144. stock=10, sales=20 → target=30, raw=20 → ROUNDUP(20/144)*144=144
    rows = [{"sku": "DE119 AAAA", "warehouse": "Коледино", "stock": 10, "sales_30d": 20}]
    plans = calculate_plan(rows)
    assert plans[0]["to_ship"] == 144


# ---------------------------------------------------------------------------
# calc.py — edge cases
# ---------------------------------------------------------------------------

def test_edge_sales_zero():
    rows = [{"sku": "DE201", "warehouse": "Коледино", "stock": 50, "sales_30d": 0}]
    plan = calculate_plan(rows)[0]
    assert plan["k"] is None
    assert plan["to_ship"] == 0
    assert "Нет продаж за 30 дней" in plan["flag"]


def test_edge_stock_zero_sales_positive():
    rows = [{"sku": "DE201", "warehouse": "Коледино", "stock": 0, "sales_30d": 30}]
    plan = calculate_plan(rows)[0]
    assert "🔴 Товар вышел" in plan["flag"]
    assert plan["zone"] == ZONE_DEFICIT
    # Should still calculate to_ship since pack_size is known
    assert plan["to_ship"] > 0


def test_edge_hidden_deficit():
    # stock < 5 AND K < 0.2
    rows = [{"sku": "DE201", "warehouse": "Коледино", "stock": 2, "sales_30d": 100}]
    plan = calculate_plan(rows)[0]
    assert "⚠️ Возможен дефицит — проверь вручную" in plan["flag"]
    assert plan["zone"] == ZONE_DEFICIT


def test_edge_negative_values():
    rows = [{"sku": "DE201", "warehouse": "Коледино", "stock": -1, "sales_30d": 10}]
    plan = calculate_plan(rows)[0]
    assert "⚠️ Некорректные данные" in plan["flag"]
    assert plan["to_ship"] == 0


def test_edge_unknown_pack():
    rows = [{"sku": "UNKNOWN-SKU", "warehouse": "Коледино", "stock": 0, "sales_30d": 10}]
    plan = calculate_plan(rows)[0]
    assert "Unknown pack" in plan["flag"]
    assert plan["to_ship"] == 0


def test_overstock_no_ship():
    rows = [{"sku": "DE201", "warehouse": "Коледино", "stock": 1000, "sales_30d": 100}]
    plan = calculate_plan(rows)[0]
    assert plan["zone"] == ZONE_OVERSTOCK
    assert plan["to_ship"] == 0


def test_normal_zone_no_ship():
    # K = 100/100 = 1.0 → NORMAL
    rows = [{"sku": "DE201", "warehouse": "Коледино", "stock": 100, "sales_30d": 100}]
    plan = calculate_plan(rows)[0]
    assert plan["zone"] == ZONE_NORMAL
    assert plan["to_ship"] == 0


# ---------------------------------------------------------------------------
# clusters.py — CLUSTER_MAP and fallback routing
# ---------------------------------------------------------------------------

def test_cluster_mapping_exact():
    """CLUSTER_MAP exact matches."""
    assert warehouse_to_cluster("Коледино") == "Центральный"
    assert warehouse_to_cluster("Краснодар") == "Южный"
    assert warehouse_to_cluster("СПб Шушары") == "Северо-западный"
    assert warehouse_to_cluster("Екатеринбург Перспективный 14") == "Восточный"
    assert warehouse_to_cluster("Казань") == "Центральный"


def test_cluster_mapping_unknown_warehouse_flag():
    """Unknown warehouse name → CLUSTER_UNKNOWN, calc adds flag."""
    rows = [{"sku": "DE201", "warehouse": "Неизвестный склад", "stock": 10, "sales_30d": 5}]
    plan = calculate_plan(rows)[0]
    assert plan["cluster"] == CLUSTER_UNKNOWN
    assert "Unknown warehouse" in plan["flag"]
    # Should NOT fail the whole run — zone is still calculated normally
    assert plan["zone"] in (ZONE_NORMAL, ZONE_DEFICIT, ZONE_OVERSTOCK)


def test_cluster_mapping_region_fallback():
    """When warehouse not in CLUSTER_MAP, region field is used."""
    assert warehouse_to_cluster("Нет такого склада", region="цфо") == "Центральный"
    assert warehouse_to_cluster("Нет такого склада", region="юфо") == "Южный"
    assert warehouse_to_cluster("Нет такого склада", region="сзфо") == "Северо-западный"


def test_cluster_mapping_warehouse_hint_fallback():
    """When neither exact name nor region known, substring hint is used."""
    assert warehouse_to_cluster("Москва Запад") == "Центральный"
    assert warehouse_to_cluster("Новосибирск-2") == "Восточный"


# ---------------------------------------------------------------------------
# db.py — aggregation correctness
# ---------------------------------------------------------------------------

@pytest.fixture
def mem_db():
    """In-memory SQLite with wb_fbo schema."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(fbo_db.SCHEMA)
    yield conn
    conn.close()


def test_aggregation_sku_warehouse(mem_db):
    """Stocks from same SKU+warehouse across multiple nm_ids sum correctly."""
    stocks = [
        {"nmId": 1, "warehouseId": 1, "warehouseName": "Коледино", "vendorCode": "DE201",
         "region": None, "quantity": 30, "inWayToClient": 0, "inWayFromClient": 0},
        {"nmId": 2, "warehouseId": 1, "warehouseName": "Коледино", "vendorCode": "DE201",
         "region": None, "quantity": 20, "inWayToClient": 0, "inWayFromClient": 0},
    ]
    fbo_db.upsert_stocks(mem_db, stocks, "2026-04-01")
    mem_db.commit()

    rows = fbo_db.load_plan_inputs(mem_db, "2026-04-01")
    de201 = next((r for r in rows if r["sku"] == "DE201" and r["warehouse"] == "Коледино"), None)
    assert de201 is not None
    assert de201["stock"] == 50  # 30 + 20


def test_return_filter(mem_db):
    """R-prefixed saleIDs are excluded from sales_30d count."""
    sales = [
        {"saleID": "S001", "supplierArticle": "DE201", "nmId": 1,
         "warehouseName": "Коледино", "date": "2026-04-01", "lastChangeDate": "2026-04-01", "forPay": 100},
        {"saleID": "S002", "supplierArticle": "DE201", "nmId": 1,
         "warehouseName": "Коледино", "date": "2026-04-02", "lastChangeDate": "2026-04-02", "forPay": 100},
        {"saleID": "R003", "supplierArticle": "DE201", "nmId": 1,
         "warehouseName": "Коледино", "date": "2026-04-03", "lastChangeDate": "2026-04-03", "forPay": -100},
    ]
    fbo_db.upsert_sales(mem_db, sales)
    stocks = [{"nmId": 1, "warehouseId": 1, "warehouseName": "Коледино", "vendorCode": "DE201",
               "region": None, "quantity": 5, "inWayToClient": 0, "inWayFromClient": 0}]
    fbo_db.upsert_stocks(mem_db, stocks, "2026-04-01")
    mem_db.commit()

    rows = fbo_db.load_plan_inputs(mem_db, "2026-04-01")
    de201 = next(r for r in rows if r["sku"] == "DE201")
    assert de201["sales_30d"] == 2  # S001 + S002, R003 excluded


# ---------------------------------------------------------------------------
# report.py — build_summary counts
# ---------------------------------------------------------------------------

def test_build_summary():
    """build_summary correctly counts zones and cluster breakdown."""
    plans = [
        {"sku": "DE201", "warehouse": "Коледино", "cluster": "Центральный",
         "stock": 10, "sales_30d": 100,
         "k": 0.1, "zone": ZONE_DEFICIT, "pack_size": 72, "to_ship": 144, "flag": "🔴 Товар вышел"},
        {"sku": "DE206", "warehouse": "Коледино", "cluster": "Центральный",
         "stock": 100, "sales_30d": 50,
         "k": 2.0, "zone": ZONE_OVERSTOCK, "pack_size": 72, "to_ship": 0, "flag": ""},
        {"sku": "DE210", "warehouse": "Краснодар", "cluster": "Южный",
         "stock": 90, "sales_30d": 100,
         "k": 0.9, "zone": ZONE_NORMAL, "pack_size": 72, "to_ship": 0, "flag": ""},
    ]
    s = build_summary(plans)
    assert s["total"] == 3
    assert s["to_ship_count"] == 1
    assert s["to_ship_units"] == 144
    assert s["overstock"] == 1
    assert s["oos"] == 1
    assert s["cluster_ship"]["Центральный"] == 144
    assert s["cluster_ship"].get("Южный", 0) == 0


# ---------------------------------------------------------------------------
# api.py — pagination stop on < PAGE_LIMIT
# ---------------------------------------------------------------------------

def test_pagination_stop():
    """stocks_report_iter stops when page < 250 000 rows."""
    from wb_fbo.api import WBFBOAPI, PAGE_LIMIT

    api = WBFBOAPI.__new__(WBFBOAPI)
    call_count = 0

    def fake_page(offset=0, limit=PAGE_LIMIT):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return [{"nmId": i} for i in range(PAGE_LIMIT)]  # full page
        return [{"nmId": i} for i in range(10)]  # partial → stop

    api.stocks_report_page = fake_page

    import time
    with patch("wb_fbo.api.time.sleep"):
        pages = list(api.stocks_report_iter())

    assert len(pages) == 2
    assert len(pages[0][0]) == PAGE_LIMIT
    assert len(pages[1][0]) == 10
    assert pages[1][1] is False  # has_more = False


# ---------------------------------------------------------------------------
# roundup helper
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("value,multiple,expected", [
    (70, 72, 72),
    (72, 72, 72),
    (73, 72, 144),
    (1, 288, 288),
    (288, 288, 288),
    (289, 288, 576),
    (0, 72, 0),
    (15, 36, 36),
    (36, 36, 36),
    (37, 36, 72),
])
def test_roundup_to_multiple(value, multiple, expected):
    assert roundup_to_multiple(value, multiple) == expected
