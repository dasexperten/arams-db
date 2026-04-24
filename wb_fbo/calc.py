import math
import re

# Hard-coded — do not change without explicit instruction from Aram.
K_LOW = 0.8
K_HIGH = 1.2
K_TARGET = 1.5  # 45 days coverage

ZONE_DEFICIT = "DEFICIT"
ZONE_NORMAL = "NORMAL"
ZONE_OVERSTOCK = "OVERSTOCK"

# DE1## accessories (floss, interdental, other non-brush).
# Source: ozon-fbo-calculator SKILL.md — canonical for all packaging logic.
_ACCESSORY_CODES = frozenset({111, 112, 115, 125, 126})

_SKU_RE = re.compile(r"^DE([12])(\d{2})(?:\s*(.+))?$", re.IGNORECASE)


def detect_pack_size(vendor_code: str) -> int | None:
    """Return pack_size for ROUNDUP, or None if unknown/accessory.

    Packaging matrix:
      DE2## single        → 72
      DE2## AA/AAAA/набор → 36
      DE1## brush/floss   → 288
      DE1## accessories   → None (flag)
      unknown format      → None (flag)
    """
    vc = (vendor_code or "").strip()
    m = _SKU_RE.match(vc)
    if not m:
        return None
    series = int(m.group(1))
    two_digits = m.group(2)
    suffix = m.group(3)
    full_code = int(f"{series}{two_digits}")

    if series == 2:
        return 36 if _is_set(suffix) else 72
    else:
        if full_code in _ACCESSORY_CODES:
            return None
        return 288


def _is_set(suffix: str | None) -> bool:
    if not suffix:
        return False
    s = suffix.strip().upper()
    return s in ("AA", "AAAA") or "НАБОР" in s


def roundup_to_multiple(value: float, multiple: int) -> int:
    """Round value UP to nearest multiple of multiple."""
    if multiple <= 0 or value <= 0:
        return 0
    return int(math.ceil(value / multiple) * multiple)


def classify_zone(k: float) -> str:
    if k < K_LOW:
        return ZONE_DEFICIT
    if k <= K_HIGH:
        return ZONE_NORMAL
    return ZONE_OVERSTOCK


def _min_sales_threshold(vendor_code: str) -> int:
    """Minimum monthly sales per cluster to include a SKU in the plan.
    DE1XX: 144 (one set pack), DE2XX: 36 (one set pack). Below or equal → excluded.
    """
    m = _SKU_RE.match((vendor_code or "").strip())
    if not m:
        return 0
    return 144 if int(m.group(1)) == 1 else 36


def calculate_plan(rows: list[dict]) -> list[dict]:
    """Calculate supply plan for each (sku, cluster) pair.

    Input:  [{sku, cluster, stock, sales_30d}, ...]
    Output: [{sku, cluster, stock, sales_30d, k, zone, pack_size, to_ship, flag, global_oos}, ...]
    global_oos=True only when total stock across ALL clusters for this SKU is 0.
    """
    # Pre-compute total stock per SKU across all clusters
    sku_total_stock: dict[str, int] = {}
    for row in rows:
        s = str(row.get("sku") or "").strip()
        sku_total_stock[s] = sku_total_stock.get(s, 0) + max(0, int(row.get("stock") or 0))

    result = []
    for row in rows:
        sku = str(row.get("sku") or "").strip()
        cluster = str(row.get("cluster") or "").strip()
        stock = int(row.get("stock") or 0)
        sales = int(row.get("sales_30d") or 0)

        # Skip rows below minimum viable sales threshold for this SKU series
        if sales <= _min_sales_threshold(sku):
            continue

        flags: list[str] = []
        k: float | None = None
        zone = ZONE_NORMAL
        to_ship = 0

        if stock < 0 or sales < 0:
            flags.append("⚠️ Некорректные данные")
            pack_size = detect_pack_size(sku)
            if pack_size is None:
                flags.append(f"⚠️ Unknown pack для SKU {sku}")
            result.append(_row(sku, cluster, stock, sales, None, ZONE_NORMAL, pack_size, 0, flags))
            continue

        if sales == 0:
            k = None
            if stock == 0:
                # Zero stock + zero sales: sales may be zero BECAUSE of stockout,
                # not because of low demand. Treat as deficit, flag for manual check.
                flags.append("🔴 Товар вышел")
                flags.append("⚠️ Продажи=0 из-за дефицита — спрос неизвестен, нужна ручная проверка")
                zone = ZONE_DEFICIT
            else:
                flags.append("Нет продаж за 30 дней")
                zone = ZONE_NORMAL
        else:
            k = stock / sales
            zone = classify_zone(k)
            if stock == 0:
                flags.append("🔴 Товар вышел")
            elif stock < 5 and k < 0.2:
                flags.append("⚠️ Возможен дефицит — проверь вручную")

        pack_size = detect_pack_size(sku)
        if pack_size is None:
            flags.append(f"⚠️ Unknown pack для SKU {sku}")

        if zone == ZONE_DEFICIT and pack_size is not None and sales > 0:
            target = sales * K_TARGET
            raw = max(0.0, target - stock)
            to_ship = roundup_to_multiple(raw, pack_size) if raw > 0 else 0

        global_oos = sku_total_stock.get(sku, 0) == 0
        result.append(_row(sku, cluster, stock, sales, k, zone, pack_size, to_ship, flags, global_oos))

    return result


def _row(sku, cluster, stock, sales, k, zone, pack_size, to_ship, flags, global_oos=False):
    return {
        "sku": sku,
        "cluster": cluster,
        "stock": stock,
        "sales_30d": sales,
        "k": k,
        "zone": zone,
        "pack_size": pack_size,
        "global_oos": global_oos,
        "to_ship": to_ship,
        "flag": "; ".join(flags),
    }
