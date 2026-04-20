import json
from datetime import date
from pathlib import Path

from . import analyze


TEMPLATE = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Ozon Performance — Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
         margin: 0; background: #0f1115; color: #e6e6e6; }
  header { padding: 24px 32px; border-bottom: 1px solid #2a2f3a; display: flex;
           justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 12px; }
  h1 { margin: 0; font-size: 22px; font-weight: 600; }
  header .range { color: #8a93a6; font-size: 14px; }
  main { padding: 24px 32px; max-width: 1400px; margin: 0 auto; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
           gap: 12px; margin-bottom: 24px; }
  .card { background: #161a22; border: 1px solid #2a2f3a; border-radius: 10px;
          padding: 16px; }
  .card .label { color: #8a93a6; font-size: 12px; text-transform: uppercase;
                 letter-spacing: 0.04em; }
  .card .value { font-size: 24px; font-weight: 600; margin-top: 6px; }
  .card.accent .value { color: #7dd3fc; }
  .card.warn .value { color: #fbbf24; }
  .card.bad .value { color: #f87171; }
  .card.good .value { color: #4ade80; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .panel { background: #161a22; border: 1px solid #2a2f3a; border-radius: 10px;
           padding: 16px; margin-bottom: 16px; }
  .panel h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; color: #c9d2e3; }
  canvas { max-height: 320px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #2a2f3a; }
  th { color: #8a93a6; font-weight: 500; text-transform: uppercase;
       font-size: 11px; letter-spacing: 0.04em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr:hover { background: #1c2230; }
  .muted { color: #8a93a6; }
  .footer { padding: 16px 32px; color: #55627b; font-size: 12px; border-top: 1px solid #2a2f3a; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>Ozon Performance</h1>
    <div class="range">Период: __RANGE__</div>
  </div>
  <div class="muted">Сгенерировано: __GENERATED__</div>
</header>

<main>
  <div class="cards" id="totals"></div>

  <div class="panel">
    <h2>Динамика расхода и выручки по дням</h2>
    <canvas id="timeChart"></canvas>
  </div>

  <div class="grid">
    <div class="panel">
      <h2>Топ-10 кампаний по расходу</h2>
      <canvas id="spendChart"></canvas>
    </div>
    <div class="panel">
      <h2>ДРР по кампаниям, %</h2>
      <canvas id="drrChart"></canvas>
    </div>
  </div>

  <div class="panel">
    <h2>Кампании</h2>
    <table id="campaignsTable">
      <thead><tr>
        <th>Кампания</th><th>Тип</th>
        <th class="num">Показы</th><th class="num">Клики</th>
        <th class="num">Заказы</th><th class="num">Выручка</th>
        <th class="num">Расход</th><th class="num">CTR</th>
        <th class="num">CR</th><th class="num">CPO</th>
        <th class="num">ДРР</th><th class="num">ROAS</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Топ-20 SKU по расходу</h2>
    <table id="skuTable">
      <thead><tr>
        <th>SKU</th>
        <th class="num">Показы</th><th class="num">Клики</th>
        <th class="num">Заказы</th><th class="num">Выручка</th>
        <th class="num">Расход</th><th class="num">ДРР</th>
        <th class="num">ROAS</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>
</main>

<div class="footer">
  Данные из SQLite (<code>__DB_PATH__</code>). Нажми F5 после перезапуска ETL, чтобы обновить.
</div>

<script>
const DATA = __DATA__;

const fmt = (v, digits = 0) => v == null ? '—'
  : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(v);
const fmtPct = (v) => v == null ? '—'
  : new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 2 }).format(v);
const fmtMoney = (v) => v == null ? '—'
  : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v) + ' ₽';

const totals = DATA.totals || {};
const cards = [
  { label: 'Показы', value: fmt(totals.views), cls: '' },
  { label: 'Клики', value: fmt(totals.clicks), cls: '' },
  { label: 'Заказы', value: fmt(totals.orders), cls: 'accent' },
  { label: 'Выручка', value: fmtMoney(totals.revenue), cls: 'good' },
  { label: 'Расход', value: fmtMoney(totals.spent), cls: 'warn' },
  { label: 'ДРР', value: fmtPct(totals.drr),
    cls: (totals.drr != null && totals.drr > 0.3) ? 'bad' : 'good' },
  { label: 'ROAS', value: totals.roas != null ? totals.roas.toFixed(2) + 'x' : '—',
    cls: (totals.roas != null && totals.roas < 3) ? 'bad' : 'good' },
];
document.getElementById('totals').innerHTML = cards.map(c =>
  `<div class="card ${c.cls}"><div class="label">${c.label}</div>
   <div class="value">${c.value}</div></div>`).join('');

const tlCtx = document.getElementById('timeChart');
if (DATA.timeline && DATA.timeline.length) {
  new Chart(tlCtx, {
    type: 'line',
    data: {
      labels: DATA.timeline.map(r => r.date),
      datasets: [
        { label: 'Выручка, ₽', data: DATA.timeline.map(r => r.revenue),
          borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.1)',
          tension: 0.25, fill: true },
        { label: 'Расход, ₽', data: DATA.timeline.map(r => r.spent),
          borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.1)',
          tension: 0.25, fill: true },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { ticks: { color: '#8a93a6' } }, x: { ticks: { color: '#8a93a6' } } },
      plugins: { legend: { labels: { color: '#c9d2e3' } } },
    },
  });
}

const camps = (DATA.campaigns || []).slice(0, 10);
new Chart(document.getElementById('spendChart'), {
  type: 'bar',
  data: {
    labels: camps.map(c => c.title || c.campaign_id),
    datasets: [{ label: 'Расход, ₽', data: camps.map(c => c.spent),
                 backgroundColor: '#60a5fa' }],
  },
  options: {
    indexAxis: 'y', responsive: true,
    scales: { y: { ticks: { color: '#8a93a6' } }, x: { ticks: { color: '#8a93a6' } } },
    plugins: { legend: { display: false } },
  },
});

new Chart(document.getElementById('drrChart'), {
  type: 'bar',
  data: {
    labels: camps.map(c => c.title || c.campaign_id),
    datasets: [{ label: 'ДРР, %', data: camps.map(c => c.drr == null ? 0 : c.drr * 100),
                 backgroundColor: camps.map(c =>
                   c.drr != null && c.drr > 0.3 ? '#f87171' : '#4ade80') }],
  },
  options: {
    indexAxis: 'y', responsive: true,
    scales: { y: { ticks: { color: '#8a93a6' } }, x: { ticks: { color: '#8a93a6' } } },
    plugins: { legend: { display: false } },
  },
});

const cTbody = document.querySelector('#campaignsTable tbody');
cTbody.innerHTML = (DATA.campaigns || []).map(c => `<tr>
  <td>${c.title || c.campaign_id}</td>
  <td>${c.type || '—'}</td>
  <td class="num">${fmt(c.views)}</td>
  <td class="num">${fmt(c.clicks)}</td>
  <td class="num">${fmt(c.orders)}</td>
  <td class="num">${fmt(c.revenue, 0)}</td>
  <td class="num">${fmt(c.spent, 0)}</td>
  <td class="num">${fmtPct(c.ctr)}</td>
  <td class="num">${fmtPct(c.cr)}</td>
  <td class="num">${fmt(c.cpo, 0)}</td>
  <td class="num">${fmtPct(c.drr)}</td>
  <td class="num">${c.roas == null ? '—' : c.roas.toFixed(2) + 'x'}</td>
</tr>`).join('');

const sTbody = document.querySelector('#skuTable tbody');
const skus = DATA.skus || [];
sTbody.innerHTML = skus.length ? skus.map(s => `<tr>
  <td>${s.sku}</td>
  <td class="num">${fmt(s.views)}</td>
  <td class="num">${fmt(s.clicks)}</td>
  <td class="num">${fmt(s.orders)}</td>
  <td class="num">${fmt(s.revenue, 0)}</td>
  <td class="num">${fmt(s.spent, 0)}</td>
  <td class="num">${fmtPct(s.drr)}</td>
  <td class="num">${s.roas == null ? '—' : s.roas.toFixed(2) + 'x'}</td>
</tr>`).join('') : '<tr><td colspan="8" class="muted">Нет данных по SKU — запусти sync-sku.</td></tr>';
</script>
</body>
</html>
"""


def render(
    date_from: date,
    date_to: date,
    campaign_limit: int = 50,
    sku_limit: int = 20,
    db_path_label: str = "",
) -> str:
    data = {
        "totals": analyze.totals(date_from, date_to),
        "campaigns": analyze.kpi_by_campaign(date_from, date_to, limit=campaign_limit),
        "skus": analyze.kpi_by_sku(date_from, date_to, limit=sku_limit),
        "timeline": _timeline(date_from, date_to),
    }
    return _render_with_data(data, date_from, date_to, db_path_label)


def _render_with_data(
    data: dict,
    date_from: date,
    date_to: date,
    db_path_label: str,
) -> str:
    from datetime import datetime
    return (TEMPLATE
            .replace("__DATA__", json.dumps(data, ensure_ascii=False, default=str))
            .replace("__RANGE__", f"{date_from.isoformat()} — {date_to.isoformat()}")
            .replace("__GENERATED__", datetime.now().strftime("%Y-%m-%d %H:%M"))
            .replace("__DB_PATH__", db_path_label or "data/ozon_performance.db"))


def _timeline(date_from: date, date_to: date) -> list[dict]:
    from . import db
    with db.connect() as conn:
        rows = conn.execute(
            """SELECT date,
                      SUM(views)       AS views,
                      SUM(clicks)      AS clicks,
                      SUM(orders)      AS orders,
                      SUM(revenue)     AS revenue,
                      SUM(money_spent) AS spent
               FROM campaign_daily_stats
               WHERE date BETWEEN ? AND ?
               GROUP BY date
               ORDER BY date""",
            (date_from.isoformat(), date_to.isoformat()),
        ).fetchall()
    return [dict(r) for r in rows]


def write(
    out_path: Path,
    date_from: date,
    date_to: date,
    campaign_limit: int = 50,
    sku_limit: int = 20,
    db_path_label: str = "",
) -> Path:
    html = render(date_from, date_to, campaign_limit, sku_limit, db_path_label)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    return out_path


def write_demo(out_path: Path) -> Path:
    demo_data = _demo_data()
    html = _render_with_data(demo_data, date.fromisoformat("2026-04-13"),
                             date.fromisoformat("2026-04-19"), "demo (synthetic)")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    return out_path


def _demo_data() -> dict:
    import random
    random.seed(42)
    campaigns_meta = [
        ("1001", "Trafareta — главная", "TRAFARETY"),
        ("1002", "Поисковое продвижение — бренд", "SEARCH_PROMO"),
        ("1003", "Баннеры — главная", "BANNER"),
        ("1004", "Видео — обувь", "VIDEO_BANNER"),
        ("1005", "Поиск — обувь", "SEARCH_PROMO"),
        ("1006", "Trafareta — одежда", "TRAFARETY"),
        ("1007", "Поиск — аксессуары", "SEARCH_PROMO"),
        ("1008", "Баннеры — распродажа", "BANNER"),
    ]
    campaigns = []
    timeline_map = {}
    for cid, title, ctype in campaigns_meta:
        base_spend = random.randint(5000, 40000)
        views = random.randint(30000, 200000)
        clicks = int(views * random.uniform(0.01, 0.05))
        orders = int(clicks * random.uniform(0.02, 0.08))
        revenue = orders * random.randint(800, 4000)
        spent = base_spend
        campaigns.append({
            "campaign_id": cid, "title": title, "type": ctype,
            "views": views, "clicks": clicks, "orders": orders,
            "revenue": revenue, "spent": spent,
            "ctr": clicks / views if views else 0,
            "cr": orders / clicks if clicks else 0,
            "cpo": spent / orders if orders else None,
            "drr": spent / revenue if revenue else None,
            "roas": revenue / spent if spent else None,
        })
    campaigns.sort(key=lambda c: c["spent"], reverse=True)

    for offset in range(7):
        d = (date.fromisoformat("2026-04-13")).toordinal() + offset
        ds = date.fromordinal(d).isoformat()
        timeline_map[ds] = {
            "date": ds,
            "views": random.randint(100000, 300000),
            "clicks": random.randint(3000, 9000),
            "orders": random.randint(100, 300),
            "revenue": random.randint(200000, 700000),
            "spent": random.randint(30000, 90000),
        }

    skus = []
    for i in range(20):
        views = random.randint(5000, 50000)
        clicks = int(views * random.uniform(0.01, 0.06))
        orders = int(clicks * random.uniform(0.02, 0.1))
        revenue = orders * random.randint(900, 5000)
        spent = random.randint(1000, 15000)
        skus.append({
            "sku": f"SKU-{100000 + i}",
            "views": views, "clicks": clicks, "orders": orders,
            "revenue": revenue, "spent": spent,
            "drr": spent / revenue if revenue else None,
            "roas": revenue / spent if spent else None,
        })
    skus.sort(key=lambda s: s["spent"], reverse=True)

    total_views = sum(c["views"] for c in campaigns)
    total_clicks = sum(c["clicks"] for c in campaigns)
    total_orders = sum(c["orders"] for c in campaigns)
    total_revenue = sum(c["revenue"] for c in campaigns)
    total_spent = sum(c["spent"] for c in campaigns)

    return {
        "totals": {
            "views": total_views, "clicks": total_clicks, "orders": total_orders,
            "revenue": total_revenue, "spent": total_spent,
            "drr": total_spent / total_revenue if total_revenue else None,
            "roas": total_revenue / total_spent if total_spent else None,
        },
        "campaigns": campaigns,
        "skus": skus,
        "timeline": sorted(timeline_map.values(), key=lambda r: r["date"]),
    }
