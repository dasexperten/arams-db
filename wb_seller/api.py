from typing import Iterator

from .client import WBSellerClient


ORDER_DIRS = ("dateAsc", "dateDesc")


class WBAnswerRejected(Exception):
    """Raised when WB returns 2xx but with `error: true` in the envelope."""


class WBFeedbacksAPI:
    """Wildberries Feedbacks API (`feedbacks-api.wildberries.ru`).

    Covers отзывы (feedbacks). Questions — отдельный набор эндпоинтов
    `/api/v1/questions/*`, добавим по аналогии при необходимости.

    Endpoint-contract (на момент написания, проверять по
    https://dev.wildberries.ru/openapi/user-communication/):

    GET  /api/v1/feedbacks/count-unanswered
    GET  /api/v1/feedbacks/count
    GET  /api/v1/feedbacks              — список
    POST /api/v1/feedbacks/answer       — опубликовать ответ {id, text}
    PATCH /api/v1/feedbacks             — отредактировать ответ {id, text}
    """

    def __init__(self, client: WBSellerClient) -> None:
        self.c = client

    def count_unanswered(self) -> dict:
        return self.c.get("/api/v1/feedbacks/count-unanswered")

    def count(
        self,
        is_answered: bool | None = None,
        nm_id: int | None = None,
        date_from: int | None = None,
        date_to: int | None = None,
    ) -> dict:
        params: dict = {}
        if is_answered is not None:
            params["isAnswered"] = "true" if is_answered else "false"
        if nm_id:
            params["nmId"] = int(nm_id)
        if date_from:
            params["dateFrom"] = int(date_from)
        if date_to:
            params["dateTo"] = int(date_to)
        return self.c.get("/api/v1/feedbacks/count", params=params or None)

    def feedbacks_list(
        self,
        is_answered: bool = False,
        take: int = 1000,
        skip: int = 0,
        order: str = "dateDesc",
        nm_id: int | None = None,
        date_from: int | None = None,
        date_to: int | None = None,
    ) -> dict:
        if order not in ORDER_DIRS:
            raise ValueError(f"order must be one of {ORDER_DIRS}, got {order!r}")
        # WB docs: take 1..5000, skip 0..200000.
        take = max(1, min(int(take), 5000))
        skip = max(0, min(int(skip), 200000))
        params: dict = {
            "isAnswered": "true" if is_answered else "false",
            "take": take,
            "skip": skip,
            "order": order,
        }
        if nm_id:
            params["nmId"] = int(nm_id)
        if date_from:
            params["dateFrom"] = int(date_from)
        if date_to:
            params["dateTo"] = int(date_to)
        return self.c.get("/api/v1/feedbacks", params=params)

    def feedbacks_iter(
        self,
        is_answered: bool = False,
        page_size: int = 1000,
        order: str = "dateDesc",
        nm_id: int | None = None,
    ) -> Iterator[dict]:
        skip = 0
        while True:
            resp = self.feedbacks_list(
                is_answered=is_answered,
                take=page_size,
                skip=skip,
                order=order,
                nm_id=nm_id,
            )
            data = resp.get("data") or {}
            feedbacks = data.get("feedbacks") or []
            if not feedbacks:
                return
            for f in feedbacks:
                yield f
            if len(feedbacks) < page_size:
                return
            skip += len(feedbacks)
            if skip >= 200000:
                return

    def answer_create(self, feedback_id: str, text: str) -> dict:
        """Publish a new answer to a feedback. The reply becomes public on the
        product page after WB moderation (usually minutes).

        WB v1 contract: `POST /api/v1/feedbacks/answer` with body `{id, text}`.
        On success returns 204 No Content (empty body) OR a JSON envelope
        `{"data":null, "error":false, "errorText":""}`. On business errors WB
        returns 2xx with `error: true` — we surface that as an exception.

        `text` — до 5000 символов (WB не даёт строгого лимита в API, но
        модерация может отклонить слишком длинные простыни).
        """
        text = (text or "").strip()
        if not text:
            raise ValueError("answer_create: text must be non-empty")
        if len(text) > 5000:
            raise ValueError(
                f"answer_create: text too long ({len(text)} chars, keep under 5000)"
            )
        resp = self.c.post(
            "/api/v1/feedbacks/answer",
            {"id": str(feedback_id), "text": text},
        )
        # Envelope with explicit error flag.
        if isinstance(resp, dict) and resp.get("error") is True:
            err = resp.get("errorText") or resp.get("additionalErrors") or "unknown"
            raise WBAnswerRejected(f"WB rejected feedback {feedback_id}: {err}")
        return resp

    def answer_edit(self, feedback_id: str, text: str) -> dict:
        """Edit an already-published answer. Only works while `answer.editable`
        is `true` (WB ограничивает окно редактирования)."""
        text = (text or "").strip()
        if not text:
            raise ValueError("answer_edit: text must be non-empty")
        return self.c.patch(
            "/api/v1/feedbacks",
            {"id": str(feedback_id), "text": text},
        )
