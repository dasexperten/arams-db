from datetime import date, timedelta

from ozon_seller import OzonSellerClient


class OzonFBOAPI:
    """Thin wrapper around OzonSellerClient for FBO-specific endpoints."""

    def __init__(self, client: OzonSellerClient | None = None) -> None:
        self._own = client is None
        self.c = client or OzonSellerClient()

    def close(self) -> None:
        if self._own:
            self.c.close()

    def __enter__(self) -> "OzonFBOAPI":
        return self

    def __exit__(self, *_) -> None:
        self.close()

    def ping(self) -> dict:
        """Verify credentials by fetching FBO stock (limit=1)."""
        return self.c.post(
            "/v2/analytics/stock_on_warehouses",
            {"limit": 1, "offset": 0, "warehouse_type": "fbo"},
        )

    def stock_on_warehouses(self, offset: int = 0, limit: int = 1000) -> dict:
        """POST /v2/analytics/stock_on_warehouses — FBO stock per warehouse.

        Response: {"result": {"rows": [{sku, item_code, item_name,
                    free_to_sell_amount, warehouse_name, ...}], "total": N}}
        """
        return self.c.post(
            "/v2/analytics/stock_on_warehouses",
            {"limit": limit, "offset": offset, "warehouse_type": "fbo"},
        )

    def stock_on_warehouses_iter(self, page_size: int = 1000):
        """Iterate all FBO stock rows across all pages."""
        offset = 0
        while True:
            resp = self.stock_on_warehouses(offset=offset, limit=page_size)
            rows = (resp.get("result") or {}).get("rows") or []
            for row in rows:
                yield row
            if len(rows) < page_size:
                break
            offset += len(rows)

    def analytics_data(
        self,
        date_from: str,
        date_to: str,
        metrics: list[str] | None = None,
        dimension: list[str] | None = None,
        offset: int = 0,
        limit: int = 1000,
    ) -> dict:
        """POST /v1/analytics/data — orders/revenue analytics.

        Response: {"result": {"data": [{"dimensions": [...], "metrics": [...]}],
                               "totals": [...]}}
        """
        return self.c.post(
            "/v1/analytics/data",
            {
                "date_from": date_from,
                "date_to": date_to,
                "metrics": metrics or ["ordered_units"],
                "dimension": dimension or ["sku"],
                "filters": [],
                "limit": limit,
                "offset": offset,
            },
        )

    def probe_analytics(self) -> None:
        """Try every known dimension field/value combo; print which ones succeed."""
        import json as _json
        d_to = date.today().isoformat()
        d_from = (date.today() - timedelta(days=7)).isoformat()
        combos = [
            {"dimension":  ["sku"]},
            {"dimension":  ["day"]},
            {"dimension":  ["spu"]},
            {"dimensions": ["sku"]},
            {"dimensions": ["day"]},
            {"dimension":  ["sku", "day"]},
            {"dimensions": ["sku", "day"]},
        ]
        base = {"date_from": d_from, "date_to": d_to,
                "metrics": ["ordered_units"], "filters": [], "limit": 1, "offset": 0}
        for combo in combos:
            body = {**base, **combo}
            key = list(combo.keys())[0]
            val = list(combo.values())[0]
            label = f"{key}={val}"
            try:
                resp = self.c.post("/v1/analytics/data", body)
                rows = (resp.get("result") or {}).get("data") or []
                print(f"  OK  {label}  rows={len(rows)}")
            except Exception as e:
                print(f"  ERR {label}  → {e}")


    def analytics_sales_iter(self, days: int = 30, page_size: int = 1000):
        """Yield {sku, orders_30d} dicts for all SKUs in the last N days."""
        date_to = date.today().isoformat()
        date_from = (date.today() - timedelta(days=days)).isoformat()
        offset = 0
        while True:
            resp = self.analytics_data(
                date_from=date_from,
                date_to=date_to,
                metrics=["ordered_units"],
                dimension=["sku"],
                offset=offset,
                limit=page_size,
            )
            rows = (resp.get("result") or {}).get("data") or []
            for row in rows:
                dims = row.get("dimensions") or []
                mets = row.get("metrics") or []
                sku_id = dims[0].get("id", "") if dims else ""
                units = int(float(mets[0])) if mets else 0
                if sku_id:
                    yield {"sku": sku_id, "orders_30d": units}
            if len(rows) < page_size:
                break
            offset += len(rows)
