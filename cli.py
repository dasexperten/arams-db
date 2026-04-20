import argparse
import json
import sys
from datetime import date, datetime, timedelta

from dotenv import load_dotenv

from ozon_perf import OzonPerformanceClient
from ozon_perf import analyze, db, etl


def _parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def cmd_init(_: argparse.Namespace) -> int:
    db.init_schema()
    print("schema ready:", db._db_path())
    return 0


def cmd_ping(_: argparse.Namespace) -> int:
    with OzonPerformanceClient() as c:
        c._auth_header()
        print("auth ok, token cached")
    return 0


def cmd_sync_campaigns(_: argparse.Namespace) -> int:
    db.init_schema()
    with OzonPerformanceClient() as c:
        n = etl.sync_campaigns(c)
    print(f"campaigns upserted: {n}")
    return 0


def cmd_sync_daily(args: argparse.Namespace) -> int:
    db.init_schema()
    if args.days:
        date_to = date.today() - timedelta(days=1)
        date_from = date_to - timedelta(days=args.days - 1)
    else:
        date_from = _parse_date(args.date_from)
        date_to = _parse_date(args.date_to)
    with OzonPerformanceClient() as c:
        n = etl.sync_daily_stats(c, date_from, date_to, args.campaigns or None)
    print(f"daily rows upserted: {n} ({date_from}..{date_to})")
    return 0


def cmd_sync_all(args: argparse.Namespace) -> int:
    db.init_schema()
    with OzonPerformanceClient() as c:
        result = etl.sync_last_n_days(c, days=args.days)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def cmd_kpi(args: argparse.Namespace) -> int:
    date_to = _parse_date(args.date_to) if args.date_to else date.today() - timedelta(days=1)
    date_from = _parse_date(args.date_from) if args.date_from else date_to - timedelta(days=6)

    totals = analyze.totals(date_from, date_to)
    print(f"--- totals {date_from}..{date_to} ---")
    print(json.dumps(totals, indent=2, ensure_ascii=False, default=str))

    print(f"\n--- top {args.limit} campaigns by spend ---")
    rows = analyze.kpi_by_campaign(date_from, date_to, limit=args.limit)
    _print_table(rows)

    if args.sku:
        print(f"\n--- top {args.limit} SKUs by spend ---")
        rows = analyze.kpi_by_sku(date_from, date_to, limit=args.limit)
        _print_table(rows)
    return 0


def _print_table(rows: list[dict]) -> None:
    if not rows:
        print("(no data)")
        return
    headers = list(rows[0].keys())
    widths = {h: max(len(h), *(len(_fmt(r.get(h))) for r in rows)) for h in headers}
    print(" | ".join(h.ljust(widths[h]) for h in headers))
    print("-+-".join("-" * widths[h] for h in headers))
    for r in rows:
        print(" | ".join(_fmt(r.get(h)).ljust(widths[h]) for h in headers))


def _fmt(v) -> str:
    if v is None:
        return "-"
    if isinstance(v, float):
        return f"{v:.4f}" if abs(v) < 1 else f"{v:.2f}"
    return str(v)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ozon-perf", description="Ozon Performance API ETL & analytics")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="Create SQLite schema").set_defaults(func=cmd_init)
    sub.add_parser("ping", help="Test credentials / token fetch").set_defaults(func=cmd_ping)
    sub.add_parser("sync-campaigns", help="Fetch campaign list").set_defaults(func=cmd_sync_campaigns)

    sd = sub.add_parser("sync-daily", help="Fetch daily campaign stats")
    sd.add_argument("--from", dest="date_from")
    sd.add_argument("--to", dest="date_to")
    sd.add_argument("--days", type=int, help="Last N days (ending yesterday)")
    sd.add_argument("--campaigns", nargs="*", help="Campaign IDs (default: all)")
    sd.set_defaults(func=cmd_sync_daily)

    sa = sub.add_parser("sync-all", help="Sync campaigns + last N days of stats")
    sa.add_argument("--days", type=int, default=7)
    sa.set_defaults(func=cmd_sync_all)

    kpi = sub.add_parser("kpi", help="Print KPIs by campaign and SKU")
    kpi.add_argument("--from", dest="date_from")
    kpi.add_argument("--to", dest="date_to")
    kpi.add_argument("--limit", type=int, default=20)
    kpi.add_argument("--sku", action="store_true")
    kpi.set_defaults(func=cmd_kpi)

    return p


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
