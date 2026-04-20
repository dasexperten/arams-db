import os
import time
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type


class OzonSellerError(Exception):
    pass


class OzonSellerAuthError(OzonSellerError):
    pass


class OzonSellerPremiumError(OzonSellerError):
    """Raised on 403 from endpoints that require Premium Plus subscription."""


class OzonSellerClient:
    def __init__(
        self,
        client_id: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.client_id = client_id or os.environ["OZON_SELLER_CLIENT_ID"]
        self.api_key = api_key or os.environ["OZON_SELLER_API_KEY"]
        self.base_url = (base_url or os.environ.get("OZON_SELLER_BASE_URL")
                         or "https://api-seller.ozon.ru").rstrip("/")
        self._http = httpx.Client(
            timeout=timeout,
            base_url=self.base_url,
            headers={
                "Client-Id": str(self.client_id),
                "Api-Key": self.api_key,
                "Content-Type": "application/json",
            },
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "OzonSellerClient":
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
            retry_after = float(resp.headers.get("Retry-After", "5"))
            time.sleep(retry_after)
            raise httpx.TransportError("rate limited, retrying")
        if resp.status_code == 401:
            raise OzonSellerAuthError(
                f"{method} {path}: 401 unauthorized — check OZON_SELLER_CLIENT_ID / OZON_SELLER_API_KEY"
            )
        if resp.status_code == 403:
            body = resp.text[:500]
            if path.startswith("/v1/review"):
                raise OzonSellerPremiumError(
                    f"{method} {path}: 403 — эндпоинты отзывов требуют подписку Premium Plus. "
                    f"Ответ: {body}"
                )
            raise OzonSellerError(f"{method} {path}: 403 forbidden: {body}")
        if resp.status_code >= 400:
            raise OzonSellerError(
                f"{method} {path} failed: {resp.status_code} {resp.text[:500]}"
            )
        return resp

    def get(self, path: str, params: dict | None = None) -> dict:
        return self.request("GET", path, params=params).json()

    def post(self, path: str, json: dict | None = None) -> dict:
        return self.request("POST", path, json=json or {}).json()
