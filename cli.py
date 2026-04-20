import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta

from dotenv import load_dotenv

from ozon_perf import OzonPerformanceClient
from ozon_perf import analyze, dashboard, db, etl


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


def cmd_sync_sku(args: argparse.Namespace) -> int:
    db.init_schema()
    if args.days:
        date_to = date.today() - timedelta(days=1)
        date_from = date_to - timedelta(days=args.days - 1)
    else:
        date_from = _parse_date(args.date_from)
        date_to = _parse_date(args.date_to)
    with OzonPerformanceClient() as c:
        n = etl.sync_sku_stats(c, date_from, date_to, args.campaigns or None,
                               group_by=args.group_by)
    print(f"SKU rows upserted: {n} ({date_from}..{date_to})")
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


def cmd_debug(args: argparse.Namespace) -> int:
    print("=" * 70)
    print("DEBUG: raw Ozon Performance API responses")
    print("=" * 70)

    with OzonPerformanceClient() as c:
        print("\n--- GET /api/client/campaign ---")
        resp = c.request("GET", "/api/client/campaign")
        print("status:", resp.status_code)
        print("body (first 3000 chars):")
        print(resp.text[:3000])

        date_to = date.today() - timedelta(days=1)
        date_from = date_to - timedelta(days=6)

        from ozon_perf.api import PerformanceAPI
        api = PerformanceAPI(c)
        campaigns = api.list_campaigns()
        print(f"\n--- list_campaigns() parsed {len(campaigns)} items ---")
        if campaigns:
            print("first campaign dict:")
            print(json.dumps(campaigns[0], ensure_ascii=False, indent=2, default=str))

        if campaigns:
            first_ids = [str(c.get("id") or c.get("campaignId")) for c in campaigns[:3]]
            first_ids = [x for x in first_ids if x and x != "None"]
            print(f"\n--- GET /api/client/statistics/daily/json for {first_ids} ---")
            try:
                resp = c.request("GET", "/api/client/statistics/daily/json", params={
                    "campaign_ids": first_ids,
                    "date_from": date_from.isoformat(),
                    "date_to": date_to.isoformat(),
                })
                print("status:", resp.status_code)
                print("body (first 3000 chars):")
                print(resp.text[:3000])
            except Exception as e:
                print("error:", e)
    return 0


def cmd_dashboard(args: argparse.Namespace) -> int:
    from pathlib import Path
    out = Path(args.out)
    if args.demo:
        dashboard.write_demo(out)
        print(f"demo dashboard written: {out.resolve()}")
        return 0
    db.init_schema()
    if args.days:
        date_to = date.today() - timedelta(days=1)
        date_from = date_to - timedelta(days=args.days - 1)
    else:
        date_to = _parse_date(args.date_to) if args.date_to else date.today() - timedelta(days=1)
        date_from = _parse_date(args.date_from) if args.date_from else date_to - timedelta(days=6)
    dashboard.write(out, date_from, date_to, db_path_label=os.environ.get("OZON_PERF_DB_PATH", ""))
    print(f"dashboard written: {out.resolve()} ({date_from}..{date_to})")
    return 0


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

    ss = sub.add_parser("sync-sku", help="Fetch SKU-level stats via async report")
    ss.add_argument("--from", dest="date_from")
    ss.add_argument("--to", dest="date_to")
    ss.add_argument("--days", type=int, help="Last N days (ending yesterday)")
    ss.add_argument("--campaigns", nargs="*", help="Campaign IDs (default: all)")
    ss.add_argument("--group-by", default="DATE", help="DATE | NO_GROUP_BY | PLACEMENT")
    ss.set_defaults(func=cmd_sync_sku)

    sa = sub.add_parser("sync-all", help="Sync campaigns + last N days of stats")
    sa.add_argument("--days", type=int, default=7)
    sa.set_defaults(func=cmd_sync_all)

    kpi = sub.add_parser("kpi", help="Print KPIs by campaign and SKU")
    kpi.add_argument("--from", dest="date_from")
    kpi.add_argument("--to", dest="date_to")
    kpi.add_argument("--limit", type=int, default=20)
    kpi.add_argument("--sku", action="store_true")
    kpi.set_defaults(func=cmd_kpi)

    sub.add_parser("debug", help="Print raw Ozon API responses (no secrets leaked)")\
        .set_defaults(func=cmd_debug)

    dash = sub.add_parser("dashboard", help="Generate HTML dashboard with charts")
    dash.add_argument("--from", dest="date_from")
    dash.add_argument("--to", dest="date_to")
    dash.add_argument("--days", type=int, help="Last N days (ending yesterday)")
    dash.add_argument("--out", default="dashboard.html")
    dash.add_argument("--demo", action="store_true", help="Use synthetic data (no DB needed)")
    dash.set_defaults(func=cmd_dashboard)

    return p


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
