import os
import tempfile

import pytest


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    monkeypatch.setenv("OZON_PERF_CLIENT_ID", "test-id")
    monkeypatch.setenv("OZON_PERF_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("OZON_PERF_BASE_URL", "https://api-performance.ozon.ru")
    monkeypatch.setenv("OZON_PERF_DB_PATH", str(tmp_path / "test.db"))
    yield
