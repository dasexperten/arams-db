from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

from .calc import ZONE_DEFICIT, ZONE_NORMAL, ZONE_OVERSTOCK
from .clusters import CLUSTER_ORDER

HEADERS = ["Кластер", "SKU", "Остаток", "Продажи", "К", "Зона", "Поставка", "Примечание"]

_ZONE_FILL = {
    ZONE_DEFICIT:   PatternFill("solid", fgColor="FCEBEB"),
    ZONE_NORMAL:    PatternFill("solid", fgColor="EAF3DE"),
    ZONE_OVERSTOCK: PatternFill("solid", fgColor="F1EFE8"),
}

_COL_SHIP = 7
_COL_ZONE = 6


def write_excel(plans: list[dict], run_date: str, output_dir: Path) -> Path:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f"ozon_fbo_{run_date}.xlsx"

    oos_count = sum(1 for p in plans if "🔴 Товар вышел" in (p.get("flag") or ""))

    def sort_key(p):
        cl = p.get("cluster") or ""
        cl_pos = CLUSTER_ORDER.index(cl) if cl in CLUSTER_ORDER else len(CLUSTER_ORDER)
        sales = p.get("sales_30d") or 0
        return (cl_pos, 1 if sales == 0 else 0, -sales, p.get("sku") or "")

    sorted_plans = sorted(plans, key=sort_key)

    clusters: list[str] = []
    cluster_rows: dict[str, list[dict]] = {}
    for p in sorted_plans:
        cl = p.get("cluster") or ""
        if cl not in cluster_rows:
            clusters.append(cl)
            cluster_rows[cl] = []
        cluster_rows[cl].append(p)

    wb = Workbook()
    ws = wb.active
    ws.title = f"Ozon-FBO {run_date}"

    bold = Font(bold=True)
    cluster_fill = PatternFill("solid", fgColor="D9D9D9")

    if oos_count:
        ws.append([f"⚠️ {oos_count} позиций в out-of-stock — приоритет отгрузки"] + [""] * 7)
        ws.merge_cells("A1:H1")
        ws["A1"].font = bold
        ws["A1"].alignment = Alignment(horizontal="center")
        ws.freeze_panes = "A2"

    ws.append(HEADERS)
    hdr_row = ws.max_row
    for cell in ws[hdr_row]:
        cell.font = bold

    for cl in clusters:
        cl_total_sales = 0
        cl_total_ship = 0
        cl_k_num = 0.0
        cl_k_den = 0

        for item in cluster_rows[cl]:
            sku = item.get("sku") or ""
            stock = item.get("stock") or 0
            sales = item.get("sales_30d") or 0
            k = item.get("k")
            zone = item.get("zone") or ZONE_NORMAL
            to_ship = item.get("to_ship") or 0
            flag = item.get("flag") or ""
            global_oos = item.get("global_oos", False)

            k_display = f"{k:.2f}" if k is not None else "—"
            to_ship_display = f"{to_ship} ⚠️" if global_oos and to_ship > 0 else to_ship
            ws.append([cl, sku, stock, sales, k_display, zone, to_ship_display, flag])
            cur = ws.max_row
            ws.cell(row=cur, column=_COL_SHIP).font = bold
            fill = _ZONE_FILL.get(zone)
            if fill:
                ws.cell(row=cur, column=_COL_ZONE).fill = fill

            cl_total_sales += sales
            cl_total_ship += to_ship
            if k is not None and sales > 0:
                cl_k_num += k * sales
                cl_k_den += sales

        cl_avg_k = (cl_k_num / cl_k_den) if cl_k_den > 0 else None
        cl_avg_k_display = f"{cl_avg_k:.2f}" if cl_avg_k is not None else "—"
        ws.append([f"ИТОГО {cl.upper()}", "", "", cl_total_sales,
                   cl_avg_k_display, "", cl_total_ship, ""])
        cl_row = ws.max_row
        for cell in ws[cl_row]:
            cell.font = bold
            cell.fill = cluster_fill

    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 10
    ws.column_dimensions["D"].width = 10
    ws.column_dimensions["E"].width = 8
    ws.column_dimensions["F"].width = 12
    ws.column_dimensions["G"].width = 12
    ws.column_dimensions["H"].width = 46

    # Sheet 2: supply order — артикул | имя | количество
    ship_totals: dict[str, dict] = {}
    for p in plans:
        qty = p.get("to_ship") or 0
        if qty <= 0:
            continue
        sku = p.get("sku") or ""
        if sku not in ship_totals:
            ship_totals[sku] = {"item_name": p.get("item_name") or "", "qty": 0}
        ship_totals[sku]["qty"] += qty

    if ship_totals:
        ws2 = wb.create_sheet("К отгрузке")
        ws2.append(["Артикул", "Название", "Количество"])
        hdr2 = ws2.max_row
        for cell in ws2[hdr2]:
            cell.font = bold
        for sku in sorted(ship_totals):
            ws2.append([sku, ship_totals[sku]["item_name"], ship_totals[sku]["qty"]])
        ws2.column_dimensions["A"].width = 18
        ws2.column_dimensions["B"].width = 40
        ws2.column_dimensions["C"].width = 14

    wb.save(str(out_path))
    return out_path


def build_summary(plans: list[dict]) -> dict:
    to_ship_count = sum(1 for p in plans if (p.get("to_ship") or 0) > 0)
    to_ship_units = sum(p.get("to_ship") or 0 for p in plans)
    normal = sum(1 for p in plans if p.get("zone") == ZONE_NORMAL and not (p.get("to_ship") or 0) > 0)
    overstock = sum(1 for p in plans if p.get("zone") == ZONE_OVERSTOCK)
    oos = sum(1 for p in plans if p.get("global_oos"))
    unknown_pack = sum(1 for p in plans if "Unknown pack" in (p.get("flag") or ""))

    cluster_ship: dict[str, int] = {}
    for p in plans:
        cl = p.get("cluster") or "?"
        cluster_ship[cl] = cluster_ship.get(cl, 0) + (p.get("to_ship") or 0)

    return {
        "total": len(plans),
        "to_ship_count": to_ship_count,
        "to_ship_units": to_ship_units,
        "normal": normal,
        "overstock": overstock,
        "oos": oos,
        "unknown_pack": unknown_pack,
        "cluster_ship": cluster_ship,
    }
