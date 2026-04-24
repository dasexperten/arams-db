from datetime import date, timedelta
from typing import Iterator

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


    def finance_transactions_iter(
        self,
        date_from: str,
        date_to: str,
        operation_types: list[str] | None = None,
        page_size: int = 1000,
    ) -> Iterator[dict]:
        """Iterate /v3/finance/transaction/list, yielding individual operations.

        Response rows look like:
          {"operation_type": "MarketplaceServiceItemStorageFee",
           "amount": -150.5,
           "items": [{"sku": 123456789, "name": "..."}]}
        """
        page = 1
        while True:
            body: dict = {
                "filter": {
                    "date": {
                        "from": f"{date_from}T00:00:00.000Z",
                        "to":   f"{date_to}T23:59:59.999Z",
                    },
                    "transaction_type": "all",
                },
                "page": page,
                "page_size": page_size,
            }
            if operation_types:
                body["filter"]["operation_type"] = operation_types
            resp = self.c.post("/v3/finance/transaction/list", body)
            result = resp.get("result") or {}
            ops = result.get("operations") or []
            for op in ops:
                yield op
            page_count = int(result.get("page_count") or 1)
            if page >= page_count or not ops:
                break
            page += 1

    def storage_fees_by_sku(self, days: int = 30) -> dict[str, float]:
        """Return {sku_str: total_storage_fee_rub} for the last N days.

        Calls /v3/finance/transaction/list filtered to storage-related operations.
        Returns empty dict on any API error (graceful degradation).
        """
        date_to = date.today().isoformat()
        date_from = (date.today() - timedelta(days=days)).isoformat()
        storage_op_types = [
            "MarketplaceServiceItemStorageFee",
            "ClientReturnAgentOperationItemStorageFee",
        ]
        fees: dict[str, float] = {}
        try:
            for op in self.finance_transactions_iter(
                date_from=date_from,
                date_to=date_to,
                operation_types=storage_op_types,
            ):
                amount = float(op.get("amount") or 0)
                for item in (op.get("items") or []):
                    sku = str(item.get("sku") or "").strip()
                    if sku:
                        fees[sku] = fees.get(sku, 0.0) + abs(amount)
        except Exception:
            pass
        return fees

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
