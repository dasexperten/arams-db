import os
import time
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type


class WBSellerError(Exception):
    pass


class WBSellerAuthError(WBSellerError):
    pass


class WBSellerClient:
    """Thin httpx wrapper for the Wildberries Feedbacks/Questions API.

    Auth: single JWT token issued in seller cabinet
    (Настройки → Доступ к API → «Вопросы и отзывы»).
    Sent as the `Authorization` header value — without a "Bearer " prefix.

    Base URL defaults to `https://feedbacks-api.wildberries.ru`.
    """

    def __init__(
        self,
        token: str | None = None,
        base_url: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.token = token or os.environ["WB_FEEDBACKS_TOKEN"]
        self.base_url = (
            base_url
            or os.environ.get("WB_FEEDBACKS_BASE_URL")
            or "https://feedbacks-api.wildberries.ru"
        ).rstrip("/")
        self._http = httpx.Client(
            timeout=timeout,
            base_url=self.base_url,
            headers={
                "Authorization": self.token,
                "Content-Type": "application/json",
            },
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "WBSellerClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    @retry(
        reraise=True,
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type((httpx.TransportError, httpx.RemoteProtocolError)),
    )
    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        resp = self._http.request(method, path, **kwargs)
        if resp.status_code == 429:
            retry_after = float(
                resp.headers.get("X-Ratelimit-Retry")
                or resp.headers.get("Retry-After")
                or "5"
            )
            time.sleep(retry_after)
            raise httpx.TransportError("rate limited, retrying")
        if resp.status_code == 401:
            raise WBSellerAuthError(
                f"{method} {path}: 401 unauthorized — check WB_FEEDBACKS_TOKEN "
                f"(JWT-токен с категорией «Вопросы и отзывы»)"
            )
        if resp.status_code == 403:
            raise WBSellerError(
                f"{method} {path}: 403 forbidden — у токена нет доступа к "
                f"категории «Вопросы и отзывы». Ответ: {resp.text[:300]}"
            )
        if resp.status_code >= 400:
            raise WBSellerError(
                f"{method} {path} failed: {resp.status_code} {resp.text[:500]}"
            )
        return resp

    def get(self, path: str, params: dict | None = None) -> dict:
        return self.request("GET", path, params=params).json()

    def post(self, path: str, json: dict | None = None) -> dict:
        return self._parse(self.request("POST", path, json=json or {}))

    def patch(self, path: str, json: dict | None = None) -> dict:
        return self._parse(self.request("PATCH", path, json=json or {}))

    @staticmethod
    def _parse(resp: httpx.Response) -> dict:
        """Parse a non-GET response.

        WB v1 endpoints are inconsistent: some return a full JSON envelope
        (`{"data":..., "error":..., "errorText":...}`) on success, others
        return `200/204` with an empty body. We translate both into a dict
        the caller can inspect:
          - success with body   → parsed JSON
          - success without body → {"_status": <code>, "_empty": True}
          - 2xx with non-JSON   → {"_status": <code>, "_raw": <first 500 chars>}
        """
        body = (resp.text or "").strip()
        if not body:
            return {"_status": resp.status_code, "_empty": True}
        try:
            return resp.json()
        except Exception:
            return {"_status": resp.status_code, "_raw": body[:500]}
