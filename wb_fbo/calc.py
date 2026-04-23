import math
import re

from .clusters import warehouse_to_cluster, CLUSTER_UNKNOWN

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

_SKU_RE = re.compile(r"^DE([12])(\d{2})(?:\s+(.+))?$", re.IGNORECASE)


def detect_pack_size(vendor_code: str) -> int | None:
    """Return pack_size for ROUNDUP, or None if unknown/accessory.

    Packaging matrix (verbatim from ozon-fbo-calculator SKILL.md):
      DE2## single        → 72
      DE2## AA/AAAA/набор → 36
      DE1## brush single  → 288
      DE1## brush set     → 144
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
    has_set_suffix = _is_set(suffix)

    if series == 2:
        return 36 if has_set_suffix else 72
    else:
        if full_code in _ACCESSORY_CODES:
            return None
        return 144 if has_set_suffix else 288


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


def calculate_plan(rows: list[dict]) -> list[dict]:
    """Calculate supply plan for each (sku, warehouse) pair.

    Input:  [{sku, warehouse, stock, sales_30d}, ...]
    Output: [{sku, warehouse, cluster, stock, sales_30d, k, zone, pack_size, to_ship, flag}, ...]

    cluster is resolved via warehouse_to_cluster(). UNKNOWN warehouse → flag added.
    """
    result = []
    for row in rows:
        sku = str(row.get("sku") or "").strip()
        warehouse = str(row.get("warehouse") or "").strip()
        stock = int(row.get("stock") or 0)
        sales = int(row.get("sales_30d") or 0)

        cluster = warehouse_to_cluster(warehouse)

        flags: list[str] = []
        k: float | None = None
        zone = ZONE_NORMAL
        to_ship = 0

        if cluster == CLUSTER_UNKNOWN:
            flags.append(f"⚠️ Unknown warehouse — добавь в CLUSTER_MAP: {warehouse!r}")

        if stock < 0 or sales < 0:
            flags.append("⚠️ Некорректные данные")
            pack_size = detect_pack_size(sku)
            if pack_size is None:
                flags.append(f"⚠️ Unknown pack для SKU {sku}")
            result.append(_row(sku, warehouse, cluster, stock, sales, None, ZONE_NORMAL, pack_size, 0, flags))
            continue

        if sales == 0:
            flags.append("Нет продаж за 30 дней")
            k = None
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

        result.append(_row(sku, warehouse, cluster, stock, sales, k, zone, pack_size, to_ship, flags))

    return result


def _row(sku, warehouse, cluster, stock, sales, k, zone, pack_size, to_ship, flags):
    return {
        "sku": sku,
        "warehouse": warehouse,
        "cluster": cluster,
        "stock": stock,
        "sales_30d": sales,
        "k": k,
        "zone": zone,
        "pack_size": pack_size,
        "to_ship": to_ship,
        "flag": "; ".join(flags),
    }
