"""Unit tests for wb_seller.replier helpers (no Claude API call involved)."""
from wb_seller.replier import _normalize_wb_sku


def test_normalize_wb_sku_no_trailing_a():
    assert _normalize_wb_sku("DE123") == ("DE123", 1)
    assert _normalize_wb_sku("DE201") == ("DE201", 1)


def test_normalize_wb_sku_two_pack():
    assert _normalize_wb_sku("DE203AA") == ("DE203", 2)
    assert _normalize_wb_sku("DE101AA") == ("DE101", 2)


def test_normalize_wb_sku_four_pack():
    # The bad-Валерий case: DE123AAAA = pack of 4 BIO brushes.
    assert _normalize_wb_sku("DE123AAAA") == ("DE123", 4)
    assert _normalize_wb_sku("DE203AAAA") == ("DE203", 4)


def test_normalize_wb_sku_single_trailing_a_is_pack_one():
    # A base SKU ending in a single A is interpreted as pack=1.
    assert _normalize_wb_sku("DE101A") == ("DE101", 1)


def test_normalize_wb_sku_empty_and_whitespace():
    assert _normalize_wb_sku("") == ("", 1)
    assert _normalize_wb_sku("   ") == ("", 1)
    assert _normalize_wb_sku("  DE123AA  ") == ("DE123", 2)


def test_normalize_wb_sku_all_a_string_does_not_crash():
    # Pathological input. Doesn't strip down to empty; the denial-guard +
    # knowledge lookup will handle the garbage base gracefully downstream.
    base, pack = _normalize_wb_sku("AAAA")
    assert base  # non-empty — we never return empty base for non-empty input
    assert pack >= 1
