# telegramer — Telegram tool for Das Experten agents

Mirrors `emailer` for Telegram. Single Python package any agent or workflow can call to send text, send files, find new chat_ids, and look up contacts by short name instead of raw chat_ids.

## Hard Telegram constraint

A bot **cannot DM a user who has not started a conversation with it first.** This is a Telegram anti-spam rule, not ours. The contact has to tap **/start** in the bot once. After that the bot knows their `chat_id` and can message them freely.

Workflow per new contact:
1. Send them a link to the bot (e.g. `t.me/YourBot`).
2. Ask them to tap **/start** (or send any message).
3. From the repo, run `python -m telegramer updates` (or trigger the **Telegram Pull Updates** workflow). It prints recent chat_ids with names attached.
4. Register the contact: `python -m telegramer register --name "Ivan" --chat-id 123456789`.

After registration, agents target them by name — never by raw chat_id.

## Action surface

Same six actions whether you import the class, call the CLI, or hit `Telegramer.dispatch()` from a Claude tool-use loop:

| action          | what it does                                              |
|-----------------|-----------------------------------------------------------|
| `send`          | Send a text message (max 4096 chars).                     |
| `send_file`     | Send a file as a Telegram document.                       |
| `get_updates`   | Pull recent bot activity to discover new chat_ids.        |
| `list_contacts` | Snapshot of the registry.                                 |
| `register`      | Add or update name → chat_id in the registry.             |

Recipient resolution: `chat_id` (explicit) > `name` (registry) > `TELEGRAM_CHAT_ID` env (default — your own).

## Use from Python

```python
from telegramer import Telegramer

tg = Telegramer()                                  # picks up TELEGRAM_BOT_TOKEN from env
tg.send(name="Aram", text="Deploy finished ✅")    # by name
tg.send(chat_id=123456, text="Direct send")        # by chat_id
tg.send(text="Self-notification")                  # falls back to TELEGRAM_CHAT_ID
tg.send_file(name="Aram", path="report.xlsx", caption="Weekly")
```

## Use from a CLI / workflow

```bash
export TELEGRAM_BOT_TOKEN=...
python -m telegramer send --to Aram --text "Hello"
python -m telegramer send-file --to Aram --path report.pdf --caption "Q2"
python -m telegramer register --name Ivan --chat-id 123456789
python -m telegramer list
python -m telegramer updates       # find new chat_ids after a /start
```

## Use from a Claude tool-use agent

```python
tg = Telegramer()
out = tg.dispatch({
    "action": "send",
    "to": "Aram",
    "text": "Found 3 unanswered partner emails. See attached.",
})
```

Same pattern as the emailer — drop both into the agent's tool list and Claude picks which to call.

## Required secrets in GitHub repo

- `TELEGRAM_BOT_TOKEN` — already present (used by other workflows).
- `TELEGRAM_CHAT_ID` — Aram's personal chat_id, used as the default sink when no `to`/`chat_id` is passed.

## Files

```
telegramer/
  __init__.py        — package exports
  api.py             — Telegramer class
  registry.py        — ContactRegistry + JSON persistence
  __main__.py        — CLI entry point
  contacts.json      — registry state (committed)
  README.md          — this file
```
