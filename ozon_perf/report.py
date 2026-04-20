import csv
import io
import zipfile
from datetime import date, datetime
from typing import Iterable


NUMERIC_FIELDS = {
    "views", "clicks", "orders",
    "revenue", "money_spent", "avg_bid",
    "ctr", "drr",
}

HEADER_ALIASES = {
    "день": "date",
    "дата": "date",
    "date": "date",

    "sku": "sku",
    "артикул": "sku",
    "ozon id": "sku",
    "ozon_id": "sku",

    "показы": "views",
    "просмотры": "views",
    "views": "views",
    "impressions": "views",

    "клики": "clicks",
    "clicks": "clicks",

    "заказы": "orders",
    "orders": "orders",

    "выручка": "revenue",
    "сумма заказов": "revenue",
    "revenue": "revenue",
    "orders_money": "revenue",

    "расход": "money_spent",
    "расход, ₽": "money_spent",
    "затраты": "money_spent",
    "money_spent": "money_spent",
    "cost": "money_spent",

    "средняя ставка": "avg_bid",
    "avg_bid": "avg_bid",

    "ctr": "ctr",
    "ctr, %": "ctr",

    "дрр": "drr",
    "дрр, %": "drr",
    "drr": "drr",

    "id кампании": "campaign_id",
    "campaign_id": "campaign_id",
    "номер кампании": "campaign_id",
}


def parse_report_bytes(payload: bytes, default_campaign_id: str | None = None) -> list[dict]:
    text = _extract_text(payload)
    if not text:
        return []
    return list(_parse_csv_text(text, default_campaign_id))


def _extract_text(payload: bytes) -> str:
    if payload[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            for name in zf.namelist():
                if name.lower().endswith((".csv", ".tsv")):
                    return zf.read(name).decode("utf-8-sig", errors="replace")
            return ""
    for enc in ("utf-8-sig", "cp1251", "utf-8"):
        try:
            return payload.decode(enc)
        except UnicodeDecodeError:
            continue
    return payload.decode("utf-8", errors="replace")


def _detect_dialect(sample: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        class _D(csv.excel):
            delimiter = ";"
        return _D


def _parse_csv_text(text: str, default_campaign_id: str | None) -> Iterable[dict]:
    lines = text.splitlines()
    data_start = _find_header_line(lines)
    if data_start is None:
        return
    body = "\n".join(lines[data_start:])
    dialect = _detect_dialect(body[:2048])
    reader = csv.DictReader(io.StringIO(body), dialect=dialect)
    reader.fieldnames = [_normalize_header(h) for h in (reader.fieldnames or [])]
    for raw in reader:
        yield _normalize_row(raw, default_campaign_id)


def _find_header_line(lines: list[str]) -> int | None:
    for i, line in enumerate(lines):
        low = line.lower()
        hits = sum(1 for key in ("sku", "артикул", "показ", "клик", "заказ", "расход") if key in low)
        if hits >= 2:
            return i
    return 0 if lines else None


def _normalize_header(h: str) -> str:
    key = (h or "").strip().lower().strip('"')
    return HEADER_ALIASES.get(key, key)


def _normalize_row(raw: dict, default_campaign_id: str | None) -> dict:
    out: dict = {"raw": raw}
    for k, v in raw.items():
        if k is None:
            continue
        if k in NUMERIC_FIELDS:
            out[k] = _num(v)
        elif k == "date":
            out["date"] = _iso_date(v)
        elif k == "sku":
            out["sku"] = (v or "").strip()
        elif k == "campaign_id":
            out["campaign_id"] = (v or "").strip()
    if "campaign_id" not in out and default_campaign_id:
        out["campaign_id"] = default_campaign_id
    return out


def _num(v) -> float:
    if v is None:
        return 0.0
    s = str(v).strip().replace("\xa0", "").replace(" ", "").replace(",", ".").rstrip("%")
    if not s or s == "-":
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _iso_date(v) -> str | None:
    if not v:
        return None
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    try:
        return date.fromisoformat(s[:10]).isoformat()
    except ValueError:
        return s
