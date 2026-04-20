import time
from datetime import date

from .client import OzonPerformanceClient, OzonPerformanceError


class PerformanceAPI:
    def __init__(self, client: OzonPerformanceClient) -> None:
        self.c = client

    def list_campaigns(self, campaign_ids: list[str] | None = None) -> list[dict]:
        params: dict = {}
        if campaign_ids:
            params["campaignIds"] = ",".join(campaign_ids)
        data = self.c.get("/api/client/campaign", params=params or None)
        return data.get("list") or data.get("items") or []

    def list_campaign_objects(self, campaign_id: str) -> list[dict]:
        data = self.c.get(f"/api/client/campaign/{campaign_id}/objects")
        return data.get("list") or []

    def daily_statistics(
        self,
        campaign_ids: list[str],
        date_from: date,
        date_to: date,
    ) -> dict:
        return self.c.get(
            "/api/client/statistics/daily/json",
            params={
                "campaignIds": ",".join(str(c) for c in campaign_ids),
                "dateFrom": date_from.isoformat(),
                "dateTo": date_to.isoformat(),
            },
        )

    def submit_statistics_report(
        self,
        campaign_ids: list[str],
        date_from: date,
        date_to: date,
        group_by: str = "NO_GROUP_BY",
    ) -> str:
        data = self.c.post(
            "/api/client/statistics",
            json={
                "campaigns": campaign_ids,
                "from": date_from.isoformat(),
                "to": date_to.isoformat(),
                "groupBy": group_by,
            },
        )
        uuid = data.get("UUID") or data.get("uuid")
        if not uuid:
            raise OzonPerformanceError(f"statistics request returned no UUID: {data}")
        return uuid

    def get_report_status(self, uuid: str) -> dict:
        return self.c.get(f"/api/client/statistics/{uuid}")

    def download_report(self, uuid: str) -> bytes:
        return self.c.get_raw("/api/client/statistics/report", params={"UUID": uuid})

    def wait_for_report(
        self,
        uuid: str,
        poll_interval: float = 5.0,
        timeout: float = 600.0,
    ) -> bytes:
        deadline = time.time() + timeout
        while True:
            status = self.get_report_status(uuid)
            state = (status.get("state") or status.get("status") or "").upper()
            if state in ("OK", "DONE", "SUCCESS"):
                return self.download_report(uuid)
            if state in ("ERROR", "FAILED", "CANCELLED"):
                raise OzonPerformanceError(f"report {uuid} failed: {status}")
            if time.time() > deadline:
                raise OzonPerformanceError(f"report {uuid} timed out, last status: {status}")
            time.sleep(poll_interval)
