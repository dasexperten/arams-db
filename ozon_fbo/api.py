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
            # regional dimensions — key candidates for delivery-region sales
            {"dimension":  ["delivery_region"]},
            {"dimension":  ["sku", "delivery_region"]},
            {"dimension":  ["region"]},
            {"dimension":  ["sku", "region"]},
            {"dimension":  ["delivery_city"]},
            {"dimension":  ["sku", "delivery_city"]},
        ]
        base = {"date_from": d_from, "date_to": d_to,
                "metrics": ["ordered_units"], "filters": [], "limit": 3, "offset": 0}
        for combo in combos:
            body = {**base, **combo}
            key = list(combo.keys())[0]
            val = list(combo.values())[0]
            label = f"{key}={val}"
            try:
                resp = self.c.post("/v1/analytics/data", body)
                rows = (resp.get("result") or {}).get("data") or []
                sample = ""
                if rows:
                    d = rows[0].get("dimensions") or []
                    sample = " dims=" + str([x.get("name") for x in d])
                print(f"  OK  {label}  rows={len(rows)}{sample}")
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

    def fbo_postings_iter(
        self,
        date_from: str,
        date_to: str,
        page_size: int = 1000,
    ) -> Iterator[dict]:
        """Iterate /v2/posting/fbo/list, yielding individual FBO postings.

        Requests analytics_data so each posting includes:
          analytics_data.region      — buyer's delivery region (oblast / krai)
          analytics_data.warehouse_name — fulfillment FBO warehouse
        Products are in posting["products"] as [{sku, quantity, ...}].
        """
        offset = 0
        while True:
            body = {
                "dir": "ASC",
                "filter": {
                    "since": f"{date_from}T00:00:00.000Z",
                    "to": f"{date_to}T23:59:59.999Z",
                },
                "limit": page_size,
                "offset": offset,
                "with": {"analytics_data": True},
            }
            resp = self.c.post("/v2/posting/fbo/list", body)
            result = resp.get("result") or []
            if isinstance(result, dict):
                result = result.get("postings") or []
            for posting in result:
                yield posting
            if len(result) < page_size:
                break
            offset += len(result)

    def analytics_sales_iter(self, days: int = 30, page_size: int = 1000):
        """Yield {sku, warehouse(=delivery region), orders_30d} per (sku, region).

        Three data paths, tried in order:
          1. FBO postings → analytics_data.region  (most granular, buyer's region)
          2. /v1/analytics/data dimension=delivery_region  (aggregated but regional)
          3. /v1/analytics/data dimension=sku  (global totals — last resort, wrong but visible)

        NEVER uses analytics_data.warehouse_name (fulfillment warehouse).
        """
        date_to = date.today().isoformat()
        date_from = (date.today() - timedelta(days=days)).isoformat()

        # Path 1: FBO postings with analytics_data.region
        try:
            results = list(self._sales_from_postings(date_from, date_to, page_size))
            n_regional = sum(1 for r in results if r.get("warehouse"))
            n_unknown = len(results) - n_regional
            print(f"[ozon-fbo] path1 FBO postings → {len(results)} rows, "
                  f"{n_regional} with region, {n_unknown} without", flush=True)
            if n_regional > 0:
                yield from results
                return
            print(f"[ozon-fbo] path1: analytics_data.region empty for all postings "
                  f"— trying analytics/data delivery_region", flush=True)
        except Exception as e:
            print(f"[ozon-fbo] path1 FAILED ({type(e).__name__}: {e})", flush=True)

        # Path 2: /v1/analytics/data with delivery_region dimension
        try:
            results2 = list(self._analytics_by_delivery_region(
                date_from, date_to, page_size))
            n2 = len(results2)
            print(f"[ozon-fbo] path2 analytics/delivery_region → {n2} rows", flush=True)
            if n2 > 0:
                yield from results2
                return
            print(f"[ozon-fbo] path2: no rows returned", flush=True)
        except Exception as e:
            print(f"[ozon-fbo] path2 FAILED ({type(e).__name__}: {e})", flush=True)

        # Path 3: global totals — every cluster gets same national number (wrong but visible)
        print("[ozon-fbo] path3 GLOBAL totals — no regional breakdown", flush=True)
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
                    yield {"sku": sku_id, "warehouse": None, "orders_30d": units}
            if len(rows) < page_size:
                break
            offset += len(rows)

    def _analytics_by_delivery_region(
        self, date_from: str, date_to: str, page_size: int = 1000
    ):
        """Yield {sku, warehouse(=delivery region name), orders_30d} from
        /v1/analytics/data with dimension=[sku, delivery_region].

        This is the buyer's delivery region — correct for demand planning.
        """
        offset = 0
        while True:
            resp = self.c.post(
                "/v1/analytics/data",
                {
                    "date_from": date_from,
                    "date_to": date_to,
                    "metrics": ["ordered_units"],
                    "dimension": ["sku", "delivery_region"],
                    "filters": [],
                    "limit": page_size,
                    "offset": offset,
                },
            )
            rows = (resp.get("result") or {}).get("data") or []
            for row in rows:
                dims = row.get("dimensions") or []
                mets = row.get("metrics") or []
                # dims[0] = sku, dims[1] = delivery_region
                sku_id = dims[0].get("id", "") if len(dims) > 0 else ""
                region = dims[1].get("name", "") if len(dims) > 1 else ""
                units = int(float(mets[0])) if mets else 0
                if sku_id and units > 0:
                    yield {"sku": sku_id, "warehouse": region, "orders_30d": units}
            if len(rows) < page_size:
                break
            offset += len(rows)

    def _sales_from_postings(self, date_from: str, date_to: str, page_size: int = 1000):
        """Aggregate FBO postings by buyer's delivery region.

        Strict region-only grouping:
          1. Use analytics_data.region (delivery region, e.g. "Ставропольский край")
          2. If region is missing → fall back to analytics_data.city
          3. If both missing → key as "" (UNKNOWN cluster)

        analytics_data.warehouse_name (fulfillment warehouse) is NEVER used here.
        """
        sales: dict[tuple[str, str], int] = {}
        cancelled = {"cancelled", "cancelled_from_backend", "cancelled_from_admin"}
        total = kept = no_region = 0
        for posting in self.fbo_postings_iter(date_from, date_to, page_size):
            total += 1
            if posting.get("status") in cancelled:
                continue
            ad = posting.get("analytics_data") or {}
            # Region first, then city — NEVER warehouse_name.
            location = str(ad.get("region") or ad.get("city") or "")
            if not location:
                no_region += 1
            for product in (posting.get("products") or []):
                sku = str(product.get("sku") or "")
                qty = int(product.get("quantity") or 0)
                if sku and qty > 0:
                    key = (sku, location)
                    sales[key] = sales.get(key, 0) + qty
                    kept += 1
        print(f"[ozon-fbo] FBO postings: {total} total, {kept} items aggregated, "
              f"{no_region} postings without region/city", flush=True)
        for (sku, location), units in sales.items():
            yield {"sku": sku, "warehouse": location, "orders_30d": units}

