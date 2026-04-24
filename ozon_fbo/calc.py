import math
import re

# Hard-coded — do not change without explicit instruction from Aram.
K_LOW = 0.8
K_HIGH = 1.2
K_TARGET = 1.0   # 30 days of REGIONAL sales coverage (per cluster)

ZONE_DEFICIT = "DEFICIT"
ZONE_NORMAL = "NORMAL"
ZONE_OVERSTOCK = "OVERSTOCK"

# DE1## accessories (floss, interdental, other non-brush).
_ACCESSORY_CODES = frozenset({111, 112, 115, 125, 126})

_SKU_RE = re.compile(r"^DE([12])(\d{2})(?:\s*(.+))?$", re.IGNORECASE)


def detect_pack_size(vendor_code: str) -> int | None:
    """Return pack_size for ROUNDUP, or None if unknown/accessory.

    DE2## single        → 72
    DE2## AA/AAAA/набор → 36
    DE1## brush         → 288
    DE1## accessories   → None (flag)
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
        return 288 if not _is_set(suffix) else 144


def _is_set(suffix: str | None) -> bool:
    if not suffix:
        return False
    s = suffix.strip().upper()
    return s in ("AA", "AAAA") or "НАБОР" in s


def roundup_to_multiple(value: float, multiple: int) -> int:
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
    m = _SKU_RE.match((vendor_code or "").strip())
    if not m:
        return 0
    return 144 if int(m.group(1)) == 1 else 36


def calculate_plan(rows: list[dict], storage_fees: dict[str, float] | None = None) -> list[dict]:
    """Calculate supply plan for each (sku, cluster) pair.

    Target per cluster = 30 days of that cluster's regional sales.
    Ship enough (rounded up to pack_size) so that stock + to_ship ≥ sales_30d.

    Input:  [{sku, cluster, stock, sales_30d}, ...]
            storage_fees: optional {sku_str: monthly_fee_rub} from Ozon finance API
    Output: [{sku, cluster, stock, sales_30d, k, zone, pack_size, to_ship, flag, global_oos,
              storage_fee_month}, ...]
    """
    fees = storage_fees or {}
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
        storage_fee = fees.get(sku)

        if sales > 0 and sales <= _min_sales_threshold(sku):
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
            result.append(_row(sku, cluster, stock, sales, None, ZONE_NORMAL, pack_size, 0, flags, item_name=row.get("item_name") or "", storage_fee=storage_fee))
            continue

        if sales == 0:
            k = None
            if stock == 0:
                flags.append("🔴 Товар вышел")
                flags.append("⚠️ Продажи=0 из-за дефицита — нужна ручная проверка")
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

        # Top up to 30 days of this region's sales.
        # Ship whenever current stock is below that target, regardless of zone.
        if pack_size is not None and sales > 0 and stock < sales * K_TARGET:
            target = sales * K_TARGET
            raw = target - stock
            to_ship = roundup_to_multiple(raw, pack_size)

        global_oos = sku_total_stock.get(sku, 0) == 0
        item_name = row.get("item_name") or ""
        result.append(_row(sku, cluster, stock, sales, k, zone, pack_size, to_ship, flags, global_oos, item_name, storage_fee))

    return result


def _row(sku, cluster, stock, sales, k, zone, pack_size, to_ship, flags, global_oos=False, item_name="", storage_fee=None):
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
        "item_name": item_name,
        "storage_fee_month": storage_fee,
    }
