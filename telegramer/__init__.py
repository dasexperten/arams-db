"""telegramer — Telegram tool for Das Experten agents.

Mirrors the role of `emailer` for Telegram: agents call it instead of
re-implementing Bot API plumbing. Single class with a small action set
(send, send_file, get_updates) plus a contact registry so agents can
target people by name (`Aram`, `Ivan`) instead of chat_ids.

Hard Telegram constraint: a bot cannot DM a user who has not started a
conversation with it first. Use `python -m telegramer updates` after a
new contact taps /start to discover their chat_id, then register.
"""
from .api import Telegramer
from .registry import ContactRegistry, get_registry

__all__ = ["Telegramer", "ContactRegistry", "get_registry"]
