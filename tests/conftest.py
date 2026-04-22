import os
import tempfile

import pytest


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    monkeypatch.setenv("OZON_PERF_CLIENT_ID", "test-id")
    monkeypatch.setenv("OZON_PERF_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("OZON_PERF_BASE_URL", "https://api-performance.ozon.ru")
    monkeypatch.setenv("OZON_PERF_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("OZON_SELLER_CLIENT_ID", "42")
    monkeypatch.setenv("OZON_SELLER_API_KEY", "seller-key")
    monkeypatch.setenv("OZON_SELLER_BASE_URL", "https://api-seller.ozon.ru")
    monkeypatch.setenv("OZON_SELLER_DB_PATH", str(tmp_path / "seller.db"))
    monkeypatch.setenv("WB_FEEDBACKS_TOKEN", "wb-token")
    monkeypatch.setenv("WB_FEEDBACKS_BASE_URL", "https://feedbacks-api.wildberries.ru")
    monkeypatch.setenv("WB_SELLER_DB_PATH", str(tmp_path / "wb.db"))
    yield
