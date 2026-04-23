import os
import time
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type


class WBFBOError(Exception):
    pass


class WBFBOAuthError(WBFBOError):
    pass


class WBFBOClient:
    """Thin httpx wrapper for WB Statistics/Analytics/Common APIs.

    Auth: single JWT token (WB_FEEDBACKS_TOKEN) sent as `Authorization` header
    without "Bearer" prefix — same token as wb_seller, different scopes.
    """

    def __init__(
        self,
        token: str | None = None,
        base_url: str = "",
        timeout: float = 60.0,
    ) -> None:
        self.token = token or os.environ["WB_FEEDBACKS_TOKEN"]
        self.base_url = base_url.rstrip("/")
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

    def __enter__(self) -> "WBFBOClient":
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
                or "20"
            )
            time.sleep(retry_after)
            raise httpx.TransportError("rate limited, retrying")
        if resp.status_code == 401:
            raise WBFBOAuthError(
                f"{method} {path}: 401 unauthorized — check WB_FEEDBACKS_TOKEN "
                f"(нужны скоупы Статистика + Аналитика)"
            )
        if resp.status_code == 403:
            raise WBFBOError(
                f"{method} {path}: 403 forbidden — у токена нет нужного скоупа. "
                f"Ответ: {resp.text[:300]}"
            )
        if resp.status_code >= 400:
            raise WBFBOError(
                f"{method} {path} failed: {resp.status_code} {resp.text[:500]}"
            )
        return resp

    def get(self, path: str, params: dict | None = None) -> Any:
        resp = self.request("GET", path, params=params)
        body = (resp.text or "").strip()
        if not body:
            return {}
        return resp.json()

    def post(self, path: str, json: dict | None = None) -> Any:
        resp = self.request("POST", path, json=json or {})
        body = (resp.text or "").strip()
        if not body:
            return {}
        return resp.json()
