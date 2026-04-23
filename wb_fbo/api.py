import os
import time
from datetime import datetime
from typing import Any, Iterator

from .client import WBFBOClient

PAGE_LIMIT = 250000
STOCKS_THROTTLE_SEC = 21  # WB limit: 1 req/20 sec; keep 1 sec spare


class WBFBOAPI:
    """WB FBO API — Statistics, Analytics, Common.

    Uses the same WB_FEEDBACKS_TOKEN as wb_seller. All three scopes
    (Feedbacks + Статистика + Аналитика) must be enabled when the token
    is issued in seller.wildberries.ru → Настройки → Доступ к API.
    """

    BASE_COMMON = "https://common-api.wildberries.ru"
    BASE_ANALYTICS = "https://seller-analytics-api.wildberries.ru"
    BASE_STATISTICS = "https://statistics-api.wildberries.ru"

    def __init__(self, token: str | None = None) -> None:
        self.token = token or os.environ["WB_FEEDBACKS_TOKEN"]
        self._common = WBFBOClient(self.token, self.BASE_COMMON)
        self._analytics = WBFBOClient(self.token, self.BASE_ANALYTICS)
        self._statistics = WBFBOClient(self.token, self.BASE_STATISTICS)

    def close(self) -> None:
        self._common.close()
        self._analytics.close()
        self._statistics.close()

    def __enter__(self) -> "WBFBOAPI":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def ping(self) -> dict:
        """GET /ping on common-api. Returns {"Status": "OK"} if token is valid."""
        return self._common.get("/ping")

    def stocks_report_page(self, offset: int = 0, limit: int = PAGE_LIMIT) -> list[dict]:
        """POST stocks-report with offset pagination.

        IMPORTANT: old GET /api/v1/supplier/stocks is disabled since 2026-06-23.
        Always use this endpoint.
        """
        body = {
            "locale": "ru",
            "filter": {
                "offsetPaid": offset,
                "limit": limit,
            },
        }
        resp = self._analytics.post(
            "/api/analytics/v1/stocks-report/wb-warehouses", body
        )
        if isinstance(resp, list):
            return resp
        if not isinstance(resp, dict):
            from .client import WBFBOError
            raise WBFBOError(
                f"stocks-report вернул неожиданный тип {type(resp).__name__!r}: {str(resp)[:300]}\n"
                f"Проверь скоупы токена WB_FEEDBACKS_TOKEN — нужны: Вопросы и отзывы + Статистика + Аналитика"
            )
        if resp.get("error") or resp.get("errors"):
            from .client import WBFBOError
            raise WBFBOError(
                f"stocks-report ошибка WB: {resp.get('errorText') or resp.get('errors') or resp}"
            )
        return resp.get("data") or resp.get("result") or []

    def stocks_report_iter(self) -> Iterator[tuple[list[dict], bool]]:
        """Yield (page_rows, has_more) with throttle between pages.

        Stops when a page returns fewer than PAGE_LIMIT rows.
        Caller must sleep STOCKS_THROTTLE_SEC between calls if not using this iterator.
        """
        offset = 0
        first = True
        while True:
            if not first:
                time.sleep(STOCKS_THROTTLE_SEC)
            first = False
            page = self.stocks_report_page(offset=offset, limit=PAGE_LIMIT)
            has_more = len(page) >= PAGE_LIMIT
            yield page, has_more
            if not has_more:
                break
            offset += PAGE_LIMIT

    def sales_list(self, date_from: datetime) -> list[dict]:
        """GET /api/v1/supplier/sales for the last N days.

        flag=0 → sales for the period (not delta).
        Returns all sales + returns; caller must filter by saleID prefix.
        """
        params = {
            "dateFrom": date_from.strftime("%Y-%m-%dT00:00:00"),
            "flag": 0,
        }
        resp = self._statistics.get("/api/v1/supplier/sales", params=params)
        if isinstance(resp, list):
            return resp
        return resp.get("data") or resp.get("result") or []
