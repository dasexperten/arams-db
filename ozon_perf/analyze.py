from datetime import date

from . import db


def kpi_by_campaign(date_from: date, date_to: date, limit: int = 50) -> list[dict]:
    sql = """
    SELECT
        s.campaign_id,
        COALESCE(c.title, s.campaign_id)           AS title,
        c.advertising_type                         AS type,
        SUM(s.views)                               AS views,
        SUM(s.clicks)                              AS clicks,
        SUM(s.orders)                              AS orders,
        SUM(s.revenue)                             AS revenue,
        SUM(s.money_spent)                         AS spent,
        CASE WHEN SUM(s.views) > 0
             THEN 1.0 * SUM(s.clicks) / SUM(s.views) ELSE 0 END AS ctr,
        CASE WHEN SUM(s.clicks) > 0
             THEN 1.0 * SUM(s.orders) / SUM(s.clicks) ELSE 0 END AS cr,
        CASE WHEN SUM(s.orders) > 0
             THEN 1.0 * SUM(s.money_spent) / SUM(s.orders) ELSE NULL END AS cpo,
        CASE WHEN SUM(s.revenue) > 0
             THEN 1.0 * SUM(s.money_spent) / SUM(s.revenue) ELSE NULL END AS drr,
        CASE WHEN SUM(s.money_spent) > 0
             THEN 1.0 * SUM(s.revenue) / SUM(s.money_spent) ELSE NULL END AS roas
    FROM campaign_daily_stats s
    LEFT JOIN campaigns c ON c.campaign_id = s.campaign_id
    WHERE s.date BETWEEN ? AND ?
    GROUP BY s.campaign_id, c.title, c.advertising_type
    ORDER BY spent DESC
    LIMIT ?
    """
    with db.connect() as conn:
        return [dict(r) for r in conn.execute(sql, (date_from.isoformat(), date_to.isoformat(), limit))]


def kpi_by_sku(date_from: date, date_to: date, limit: int = 50) -> list[dict]:
    sql = """
    SELECT
        s.sku,
        SUM(s.views)       AS views,
        SUM(s.clicks)      AS clicks,
        SUM(s.orders)      AS orders,
        SUM(s.revenue)     AS revenue,
        SUM(s.money_spent) AS spent,
        CASE WHEN SUM(s.revenue) > 0
             THEN 1.0 * SUM(s.money_spent) / SUM(s.revenue) ELSE NULL END AS drr,
        CASE WHEN SUM(s.money_spent) > 0
             THEN 1.0 * SUM(s.revenue) / SUM(s.money_spent) ELSE NULL END AS roas
    FROM sku_daily_stats s
    WHERE s.date BETWEEN ? AND ?
    GROUP BY s.sku
    ORDER BY spent DESC
    LIMIT ?
    """
    with db.connect() as conn:
        return [dict(r) for r in conn.execute(sql, (date_from.isoformat(), date_to.isoformat(), limit))]


def totals(date_from: date, date_to: date) -> dict:
    sql = """
    SELECT
        SUM(views)       AS views,
        SUM(clicks)      AS clicks,
        SUM(orders)      AS orders,
        SUM(revenue)     AS revenue,
        SUM(money_spent) AS spent
    FROM campaign_daily_stats
    WHERE date BETWEEN ? AND ?
    """
    with db.connect() as conn:
        row = conn.execute(sql, (date_from.isoformat(), date_to.isoformat())).fetchone()
    data = dict(row) if row else {}
    spent = data.get("spent") or 0
    revenue = data.get("revenue") or 0
    data["drr"] = (spent / revenue) if revenue else None
    data["roas"] = (revenue / spent) if spent else None
    return data
