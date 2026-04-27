"""Telegram Bot API wrapper for Das Experten agents.

Six call surfaces:
    send           — text message
    send_file      — document upload
    get_updates    — pull recent bot activity (find new chat_ids after /start)
    list_contacts  — snapshot of the registry
    register       — add name → chat_id (writes to contacts.json)
    dispatch       — action-based router so the same surface works as a
                     Claude API tool (parallels emailer's design)

Resolution order for the recipient:
    chat_id (explicit) > name (registry) > TELEGRAM_CHAT_ID (default)

Hard Telegram constraints (not our limits, theirs):
    - Bots cannot initiate chats. The recipient must /start the bot first.
    - sendMessage payload is capped at 4096 chars; raise instead of silently truncating.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx

from .registry import get_registry

DEFAULT_TIMEOUT = 30.0
FILE_TIMEOUT = 120.0
MAX_TEXT_LEN = 4096


class Telegramer:
    def __init__(
        self,
        bot_token: str | None = None,
        default_chat_id: str | int | None = None,
        registry=None,
    ) -> None:
        self.bot_token = bot_token or os.environ.get("TELEGRAM_BOT_TOKEN")
        if not self.bot_token:
            raise RuntimeError("TELEGRAM_BOT_TOKEN is not set.")
        env_chat = os.environ.get("TELEGRAM_CHAT_ID")
        self.default_chat_id = int(default_chat_id or env_chat) if (default_chat_id or env_chat) else None
        self.registry = registry or get_registry()
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"

    # ---------------- recipient resolution ----------------

    def _resolve_chat_id(self, *, name: str | None, chat_id: int | str | None) -> int:
        if chat_id is not None:
            return int(chat_id)
        if name:
            cid = self.registry.lookup(name)
            if cid is None:
                raise ValueError(
                    f"Contact '{name}' not in registry. "
                    "Register via `python -m telegramer register --name '{name}' --chat-id <id>` "
                    "after they /start the bot."
                )
            return int(cid)
        if self.default_chat_id is not None:
            return self.default_chat_id
        raise ValueError("No chat_id, name, or TELEGRAM_CHAT_ID default available.")

    # ---------------- public actions ----------------

    def send(
        self,
        *,
        text: str,
        name: str | None = None,
        chat_id: int | str | None = None,
        parse_mode: str | None = None,
        disable_preview: bool = True,
    ) -> dict[str, Any]:
        if not text:
            raise ValueError("send: text is empty.")
        if len(text) > MAX_TEXT_LEN:
            raise ValueError(
                f"send: text length {len(text)} exceeds Telegram limit {MAX_TEXT_LEN}. "
                "Split into chunks or use send_file for long content."
            )
        cid = self._resolve_chat_id(name=name, chat_id=chat_id)
        payload: dict[str, Any] = {
            "chat_id": cid,
            "text": text,
            "disable_web_page_preview": disable_preview,
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode

        with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
            r = client.post(f"{self.base_url}/sendMessage", json=payload)
            r.raise_for_status()
            return r.json()

    def send_file(
        self,
        *,
        path: str | Path,
        name: str | None = None,
        chat_id: int | str | None = None,
        caption: str | None = None,
    ) -> dict[str, Any]:
        cid = self._resolve_chat_id(name=name, chat_id=chat_id)
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(f"send_file: file not found: {path}")

        data: dict[str, Any] = {"chat_id": str(cid)}
        if caption:
            data["caption"] = caption
        with path.open("rb") as f:
            files = {"document": (path.name, f)}
            with httpx.Client(timeout=FILE_TIMEOUT) as client:
                r = client.post(f"{self.base_url}/sendDocument", data=data, files=files)
                r.raise_for_status()
                return r.json()

    def get_updates(self, *, offset: int | None = None, limit: int = 100) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit}
        if offset is not None:
            params["offset"] = offset
        with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
            r = client.get(f"{self.base_url}/getUpdates", params=params)
            r.raise_for_status()
            return r.json()

    def list_contacts(self) -> dict[str, int]:
        return dict(self.registry.contacts)

    def register(self, *, name: str, chat_id: int | str) -> dict[str, Any]:
        if not name:
            raise ValueError("register: name is empty.")
        self.registry.add(name, int(chat_id))
        return {"ok": True, "registered": name, "chat_id": int(chat_id)}

    # ---------------- action dispatcher ----------------

    def dispatch(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Action-based entry point for Claude API tool use.

        Mirrors the emailer pattern. Returns the same response shape on
        success and {ok: false, error: ...} on failure.
        """
        action = payload.get("action")
        try:
            if action == "send":
                return {"ok": True, "result": self.send(
                    text=payload["text"],
                    name=payload.get("to"),
                    chat_id=payload.get("chat_id"),
                    parse_mode=payload.get("parse_mode"),
                    disable_preview=payload.get("disable_preview", True),
                )}
            if action == "send_file":
                return {"ok": True, "result": self.send_file(
                    path=payload["path"],
                    name=payload.get("to"),
                    chat_id=payload.get("chat_id"),
                    caption=payload.get("caption"),
                )}
            if action == "get_updates":
                return {"ok": True, "result": self.get_updates(
                    offset=payload.get("offset"),
                    limit=payload.get("limit", 100),
                )}
            if action == "list_contacts":
                return {"ok": True, "result": self.list_contacts()}
            if action == "register":
                return self.register(name=payload["name"], chat_id=payload["chat_id"])
            return {"ok": False, "error": f"Unknown action: {action!r}"}
        except (httpx.HTTPError, ValueError, FileNotFoundError, KeyError) as exc:
            return {"ok": False, "action": action, "error": str(exc)}
