from typing import Iterator

from .client import OzonSellerClient


REVIEW_STATUSES = ("UNPROCESSED", "PROCESSED", "ALL")
COMMENT_SORT_DIRS = ("ASC", "DESC")
QUESTION_STATUSES = ("UNPROCESSED", "PROCESSED", "ALL")


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
        # Ozon constraint: ReviewListRequest.Limit must be in [20, 100]
        limit = max(20, min(int(limit), 100))
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

    def questions_count(self) -> dict:
        return self.c.post("/v1/question/count", {})

    def questions_list(
        self,
        status: str = "UNPROCESSED",
        limit: int = 100,
        last_id: str = "",
        sort_dir: str = "DESC",
    ) -> dict:
        if status not in QUESTION_STATUSES:
            raise ValueError(f"status must be one of {QUESTION_STATUSES}, got {status!r}")
        limit = max(1, min(int(limit), 100))
        return self.c.post(
            "/v1/question/list",
            {
                "limit": limit,
                "last_id": last_id or "",
                "sort_dir": sort_dir,
                "status": status,
            },
        )

    def questions_iter(
        self,
        status: str = "UNPROCESSED",
        page_size: int = 100,
        sort_dir: str = "DESC",
    ) -> Iterator[dict]:
        last_id = ""
        while True:
            page = self.questions_list(
                status=status, limit=page_size, last_id=last_id, sort_dir=sort_dir,
            )
            questions = page.get("questions") or []
            for question in questions:
                yield question
            if not page.get("has_next"):
                return
            next_last_id = page.get("last_id") or ""
            if not next_last_id or next_last_id == last_id:
                return
            last_id = next_last_id

    def question_answer_create(self, question_id: str, answer_text: str, sku: int | str = 0) -> dict:
        answer_text = (answer_text or "").strip()[:1000]
        if not answer_text:
            raise ValueError("question_answer_create: answer_text must be non-empty")
        return self.c.post(
            "/v1/question/answer/create",
            {
                "question_id": str(question_id),
                "text": answer_text,
                "sku": int(sku) if sku else 0,
            },
        )

    def product_info_list(self, skus: list[str | int]) -> list[dict]:
        """Return product info (incl. offer_id) for a list of Ozon SKUs."""
        resp = self.c.post("/v3/product/info/list", {"sku": [str(s) for s in skus]})
        return (resp.get("result") or {}).get("items") or []

    def product_info_by_offer_ids(self, offer_ids: list[str]) -> list[dict]:
        """Return product info (incl. Ozon numeric SKU) for a list of offer_ids."""
        resp = self.c.post("/v3/product/info/list", {"offer_id": list(offer_ids)})
        return (resp.get("result") or {}).get("items") or []

    def products_list_all(self) -> Iterator[dict]:
        """Iterate all seller products yielding {product_id, offer_id} dicts."""
        last_id = ""
        while True:
            resp = self.c.post(
                "/v2/product/list",
                {"filter": {}, "last_id": last_id, "limit": 100},
            )
            result = resp.get("result") or {}
            items = result.get("items") or []
            for item in items:
                yield item
            if not items:
                return
            next_last_id = result.get("last_id") or ""
            if not next_last_id or next_last_id == last_id:
                return
            last_id = next_last_id

    def comment_create(
        self,
        review_id: str,
        text: str,
        mark_review_as_processed: bool = True,
        parent_comment_id: str | int = "",
    ) -> dict:
        text = (text or "").strip()
        if not text:
            raise ValueError("comment_create: text must be non-empty")
        if len(text) > 1000:
            raise ValueError(
                f"comment_create: text too long ({len(text)} chars, max 1000 per Ozon limits)"
            )
        # Ozon requires parent_comment_id as a STRING (protobuf string field);
        # empty string means "reply to the review itself, not to another comment".
        parent = str(parent_comment_id).strip() if parent_comment_id else ""
        return self.c.post(
            "/v1/review/comment/create",
            {
                "review_id": str(review_id),
                "text": text,
                "mark_review_as_processed": bool(mark_review_as_processed),
                "parent_comment_id": parent,
            },
        )
