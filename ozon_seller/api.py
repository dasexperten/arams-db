from typing import Iterator

from .client import OzonSellerClient


REVIEW_STATUSES = ("UNPROCESSED", "PROCESSED", "ALL")
COMMENT_SORT_DIRS = ("ASC", "DESC")


class SellerAPI:
    def __init__(self, client: OzonSellerClient) -> None:
        self.c = client

    def reviews_count(self) -> dict:
        return self.c.post("/v1/review/count", {})

    def reviews_list(
        self,
        status: str = "ALL",
        limit: int = 100,
        last_id: str = "",
        sort_dir: str = "DESC",
    ) -> dict:
        if status not in REVIEW_STATUSES:
            raise ValueError(f"status must be one of {REVIEW_STATUSES}, got {status!r}")
        limit = max(1, min(int(limit), 100))
        return self.c.post(
            "/v1/review/list",
            {
                "limit": limit,
                "last_id": last_id or "",
                "sort_dir": sort_dir,
                "status": status,
            },
        )

    def reviews_iter(
        self,
        status: str = "ALL",
        page_size: int = 100,
        sort_dir: str = "DESC",
    ) -> Iterator[dict]:
        last_id = ""
        while True:
            page = self.reviews_list(
                status=status, limit=page_size, last_id=last_id, sort_dir=sort_dir,
            )
            reviews = page.get("reviews") or []
            for review in reviews:
                yield review
            if not page.get("has_next"):
                return
            next_last_id = page.get("last_id") or ""
            if not next_last_id or next_last_id == last_id:
                return
            last_id = next_last_id

    def review_info(self, review_id: str) -> dict:
        return self.c.post("/v1/review/info", {"review_id": review_id})

    def change_status(self, review_ids: list[str], status: str) -> dict:
        if status not in ("PROCESSED", "UNPROCESSED"):
            raise ValueError(f"status must be PROCESSED or UNPROCESSED, got {status!r}")
        if not review_ids:
            return {"result": "noop"}
        if len(review_ids) > 100:
            raise ValueError("change_status accepts at most 100 review_ids per call")
        return self.c.post(
            "/v1/review/change-status",
            {"review_ids": list(review_ids), "status": status},
        )

    def comments_list(
        self,
        review_id: str,
        limit: int = 100,
        offset: int = 0,
        sort_dir: str = "ASC",
    ) -> dict:
        if sort_dir not in COMMENT_SORT_DIRS:
            raise ValueError(f"sort_dir must be one of {COMMENT_SORT_DIRS}, got {sort_dir!r}")
        return self.c.post(
            "/v1/review/comment/list",
            {
                "review_id": review_id,
                "limit": max(1, min(int(limit), 100)),
                "offset": max(0, int(offset)),
                "sort_dir": sort_dir,
            },
        )

    def comments_iter(self, review_id: str, page_size: int = 100) -> Iterator[dict]:
        offset = 0
        while True:
            page = self.comments_list(review_id, limit=page_size, offset=offset)
            comments = page.get("comments") or []
            if not comments:
                return
            for comment in comments:
                yield comment
            if len(comments) < page_size:
                return
            offset += len(comments)
