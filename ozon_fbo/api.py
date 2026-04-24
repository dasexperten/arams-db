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
                    fbo_present_stock, warehouse_name, ...}], "total": N}}
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
                "dimension": dimension or ["item_code"],
                "filters": [],
                "limit": limit,
                "offset": offset,
            },
        )

    def analytics_sales_iter(self, days: int = 30, page_size: int = 1000):
        """Yield {offer_id, orders_30d} dicts for all SKUs in the last N days."""
        date_to = date.today().isoformat()
        date_from = (date.today() - timedelta(days=days)).isoformat()
        offset = 0
        while True:
            resp = self.analytics_data(
                date_from=date_from,
                date_to=date_to,
                metrics=["ordered_units"],
                dimension=["item_code"],
                offset=offset,
                limit=page_size,
            )
            rows = (resp.get("result") or {}).get("data") or []
            for row in rows:
                dims = row.get("dimensions") or []
                mets = row.get("metrics") or []
                offer_id = dims[0].get("id", "") if dims else ""
                units = int(mets[0]) if mets else 0
                if offer_id:
                    yield {"offer_id": offer_id, "orders_30d": units}
            if len(rows) < page_size:
                break
            offset += len(rows)
