"""telegramer CLI.

Run as:
    python -m telegramer send --to Aram --text "Hello"
    python -m telegramer send --chat-id 12345 --text "Hello"
    python -m telegramer send-file --to Aram --path report.pdf --caption "Q2"
    python -m telegramer register --name Aram --chat-id 12345
    python -m telegramer list
    python -m telegramer updates
"""
from __future__ import annotations

import argparse
import json
import sys

from .api import Telegramer
from .registry import get_registry


def _print_json(obj) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def main() -> int:
    p = argparse.ArgumentParser(prog="telegramer", description="Telegram tool for Das Experten agents.")
    sub = p.add_subparsers(dest="cmd", required=True)

    s_send = sub.add_parser("send", help="Send a text message")
    s_send.add_argument("--to", help="Contact name from registry")
    s_send.add_argument("--chat-id", type=int, help="Direct chat_id (bypasses registry)")
    s_send.add_argument("--text", required=True)
    s_send.add_argument("--parse-mode", choices=["HTML", "MarkdownV2"], default=None)

    s_file = sub.add_parser("send-file", help="Send a file as document")
    s_file.add_argument("--to")
    s_file.add_argument("--chat-id", type=int)
    s_file.add_argument("--path", required=True)
    s_file.add_argument("--caption", default=None)

    s_reg = sub.add_parser("register", help="Add or update a contact in the registry")
    s_reg.add_argument("--name", required=True)
    s_reg.add_argument("--chat-id", type=int, required=True)

    sub.add_parser("list", help="List registered contacts")

    sub.add_parser("updates", help="Pull recent bot updates (find chat_ids of new contacts)")

    args = p.parse_args()
    tg = Telegramer()

    if args.cmd == "send":
        out = tg.send(
            text=args.text,
            name=args.to,
            chat_id=args.chat_id,
            parse_mode=args.parse_mode,
        )
        _print_json(out)
        return 0

    if args.cmd == "send-file":
        out = tg.send_file(
            path=args.path,
            name=args.to,
            chat_id=args.chat_id,
            caption=args.caption,
        )
        _print_json(out)
        return 0

    if args.cmd == "register":
        get_registry().add(args.name, args.chat_id)
        print(f"Registered: {args.name} → {args.chat_id}")
        return 0

    if args.cmd == "list":
        contacts = get_registry().contacts
        if not contacts:
            print("Registry is empty. Run `updates` after a contact taps /start, then `register`.")
            return 0
        for name, cid in sorted(contacts.items()):
            print(f"  {name:30s} → {cid}")
        return 0

    if args.cmd == "updates":
        out = tg.get_updates()
        results = out.get("result", [])
        if not results:
            print("No recent updates. Ask the contact to send any message to the bot, then re-run.")
            return 0
        seen: dict[int, str] = {}
        for upd in results:
            msg = upd.get("message") or upd.get("edited_message") or {}
            chat = msg.get("from") or msg.get("chat") or {}
            cid = chat.get("id")
            if cid is None:
                continue
            label_parts = [chat.get("first_name"), chat.get("last_name"), f"@{chat.get('username')}" if chat.get("username") else None]
            label = " ".join(p for p in label_parts if p) or "(no name)"
            seen[cid] = label
        registered = set(get_registry().contacts.values())
        print("Recent chats with the bot:")
        for cid, label in sorted(seen.items()):
            mark = "✓ already registered" if cid in registered else "  NEW — register with: python -m telegramer register --name '<short_name>' --chat-id {}".format(cid)
            print(f"  {cid:>15}  {label:30s}  {mark}")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
