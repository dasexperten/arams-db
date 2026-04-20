import os
import time
import threading
from dataclasses import dataclass
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type


class OzonPerformanceError(Exception):
    pass


class OzonAuthError(OzonPerformanceError):
    pass


@dataclass
class _Token:
    value: str
    expires_at: float


class OzonPerformanceClient:
    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        base_url: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.client_id = client_id or os.environ["OZON_PERF_CLIENT_ID"]
        self.client_secret = client_secret or os.environ["OZON_PERF_CLIENT_SECRET"]
        self.base_url = (base_url or os.environ.get("OZON_PERF_BASE_URL")
                         or "https://api-performance.ozon.ru").rstrip("/")
        self._http = httpx.Client(timeout=timeout, base_url=self.base_url)
        self._token: _Token | None = None
        self._token_lock = threading.Lock()

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "OzonPerformanceClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def _fetch_token(self) -> _Token:
        resp = self._http.post(
            "/api/client/token",
            json={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "grant_type": "client_credentials",
            },
        )
        if resp.status_code >= 400:
            raise OzonAuthError(f"token request failed: {resp.status_code} {resp.text}")
        data = resp.json()
        expires_in = int(data.get("expires_in", 1800))
        return _Token(value=data["access_token"], expires_at=time.time() + expires_in - 60)

    def _auth_header(self) -> dict[str, str]:
        with self._token_lock:
            if self._token is None or time.time() >= self._token.expires_at:
                self._token = self._fetch_token()
            return {"Authorization": f"Bearer {self._token.value}"}

    @retry(
        reraise=True,
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type((httpx.TransportError, httpx.RemoteProtocolError)),
    )
    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        headers = kwargs.pop("headers", {}) | self._auth_header()
        resp = self._http.request(method, path, headers=headers, **kwargs)
        if resp.status_code == 401:
            with self._token_lock:
                self._token = None
            headers = kwargs.pop("headers", {}) | self._auth_header()
            resp = self._http.request(method, path, headers=headers, **kwargs)
        if resp.status_code == 429:
            retry_after = float(resp.headers.get("Retry-After", "5"))
            time.sleep(retry_after)
            raise httpx.TransportError("rate limited, retrying")
        if resp.status_code >= 400:
            raise OzonPerformanceError(
                f"{method} {path} failed: {resp.status_code} {resp.text[:500]}"
            )
        return resp

    def get(self, path: str, params: dict | None = None) -> dict:
        return self.request("GET", path, params=params).json()

    def post(self, path: str, json: dict | None = None) -> dict:
        return self.request("POST", path, json=json).json()

    def get_raw(self, path: str, params: dict | None = None) -> bytes:
        return self.request("GET", path, params=params).content
