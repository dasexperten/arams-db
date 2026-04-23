from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

from .calc import ZONE_DEFICIT, ZONE_NORMAL, ZONE_OVERSTOCK

HEADERS = ["Склад", "SKU", "Остаток", "Продажи", "К", "Зона", "Поставка", "Примечание"]

_ZONE_FILL = {
    ZONE_DEFICIT: PatternFill("solid", fgColor="FFE6E6"),
    ZONE_NORMAL: PatternFill("solid", fgColor="E6F4E6"),
    ZONE_OVERSTOCK: PatternFill("solid", fgColor="EEEEEE"),
}

_COL_G = 7  # Поставка (1-indexed)
_COL_F = 6  # Зона


def write_excel(plans: list[dict], run_date: str, output_dir: Path) -> Path:
    """Generate Excel supply plan. Returns path to created file.

    Column layout: A=Склад B=SKU C=Остаток D=Продажи E=К F=Зона G=Поставка H=Примечание
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f"wb_fbo_{run_date}.xlsx"

    oos_count = sum(1 for p in plans if "🔴 Товар вышел" in (p.get("flag") or ""))

    def sort_key(p):
        is_oos = 1 if "🔴 Товар вышел" in (p.get("flag") or "") else 0
        return (p.get("warehouse") or "", -is_oos, -(p.get("to_ship") or 0), p.get("sku") or "")

    sorted_plans = sorted(plans, key=sort_key)

    # Group by warehouse preserving sort order
    warehouses: list[str] = []
    groups: dict[str, list[dict]] = {}
    for p in sorted_plans:
        wh = p.get("warehouse") or ""
        if wh not in groups:
            groups[wh] = []
            warehouses.append(wh)
        groups[wh].append(p)

    wb = Workbook()
    ws = wb.active
    ws.title = f"WB-FBO {run_date}"

    bold = Font(bold=True)

    data_start_row = 1

    if oos_count:
        ws.append([f"⚠️ {oos_count} позиций в out-of-stock — приоритет отгрузки"] + [""] * 7)
        ws.merge_cells("A1:H1")
        ws["A1"].font = bold
        ws["A1"].alignment = Alignment(horizontal="center")
        ws.freeze_panes = "A2"
        data_start_row = 2

    ws.append(HEADERS)
    header_row = ws.max_row
    for cell in ws[header_row]:
        cell.font = bold

    for wh in warehouses:
        items = groups[wh]
        total_sales = 0
        total_ship = 0
        k_weighted_num = 0.0
        k_weighted_den = 0

        for item in items:
            sku = item.get("sku") or ""
            stock = item.get("stock") or 0
            sales = item.get("sales_30d") or 0
            k = item.get("k")
            zone = item.get("zone") or ZONE_NORMAL
            to_ship = item.get("to_ship") or 0
            flag = item.get("flag") or ""

            k_display = f"{k:.2f}" if k is not None else "—"
            ws.append([wh, sku, stock, sales, k_display, zone, to_ship, flag])
            cur = ws.max_row

            ws.cell(row=cur, column=_COL_G).font = bold

            fill = _ZONE_FILL.get(zone)
            if fill:
                ws.cell(row=cur, column=_COL_F).fill = fill

            total_sales += sales
            total_ship += to_ship
            if k is not None and sales > 0:
                k_weighted_num += k * sales
                k_weighted_den += sales

        avg_k = (k_weighted_num / k_weighted_den) if k_weighted_den > 0 else None
        avg_k_display = f"{avg_k:.2f}" if avg_k is not None else "—"

        ws.append([f"ИТОГО {wh.upper()}", "", "", total_sales, avg_k_display, "", total_ship, ""])
        summary_row = ws.max_row
        for cell in ws[summary_row]:
            cell.font = bold

    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 10
    ws.column_dimensions["D"].width = 10
    ws.column_dimensions["E"].width = 8
    ws.column_dimensions["F"].width = 12
    ws.column_dimensions["G"].width = 12
    ws.column_dimensions["H"].width = 42

    wb.save(str(out_path))
    return out_path


def build_summary(plans: list[dict]) -> dict:
    """Build stats dict for Telegram caption."""
    total = len(plans)
    to_ship_count = sum(1 for p in plans if (p.get("to_ship") or 0) > 0)
    to_ship_units = sum(p.get("to_ship") or 0 for p in plans)
    normal = sum(1 for p in plans if p.get("zone") == ZONE_NORMAL and not (p.get("to_ship") or 0) > 0)
    overstock = sum(1 for p in plans if p.get("zone") == ZONE_OVERSTOCK)
    oos = sum(1 for p in plans if "🔴 Товар вышел" in (p.get("flag") or ""))
    unknown_pack = sum(1 for p in plans if "Unknown pack" in (p.get("flag") or ""))
    return {
        "total": total,
        "to_ship_count": to_ship_count,
        "to_ship_units": to_ship_units,
        "normal": normal,
        "overstock": overstock,
        "oos": oos,
        "unknown_pack": unknown_pack,
    }
