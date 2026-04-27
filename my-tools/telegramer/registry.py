"""Per-name → chat_id registry for telegramer.

Lives as `telegramer/contacts.json` so the registry is committed to git
and visible to every workflow run. Keys are short canonical names ("Aram",
"Ivan_Petrov", "Vendor_X"). Values are integer chat_ids.

A bot can only DM users who have started a chat with it. The registry
captures the chat_id once they've done so.
"""
from __future__ import annotations

import json
from pathlib import Path

REGISTRY_PATH = Path(__file__).parent / "contacts.json"


class ContactRegistry:
    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path else REGISTRY_PATH
        self.contacts: dict[str, int] = {}
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            self.contacts = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            self.contacts = {}

    def _save(self) -> None:
        self.path.write_text(
            json.dumps(self.contacts, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def lookup(self, name: str) -> int | None:
        return self.contacts.get(name)

    def add(self, name: str, chat_id: int) -> None:
        self.contacts[name] = int(chat_id)
        self._save()

    def remove(self, name: str) -> None:
        self.contacts.pop(name, None)
        self._save()


_registry: ContactRegistry | None = None


def get_registry() -> ContactRegistry:
    global _registry
    if _registry is None:
        _registry = ContactRegistry()
    return _registry
