#!/usr/bin/env python3
"""
gmail_quick_reply.py — find one Gmail thread by query, draft a brief reply
using the marketolog skill as the system prompt, post it back to the same
thread (default: as a draft for review; optional: send live), and leave a
Drive trail of what was done.

Pipeline:
  1. emailer find         — locate first thread matching the query
  2. emailer get_thread   — pull full conversation
  3. Anthropic API        — draft reply with marketolog SKILL.md as system prompt
  4. emailer reply        — post to the same thread (draft or send)
  5. emailer archive      — write a markdown trail to Drive

Inputs (env):
  EMAILER_URL              — Apps Script web app URL (GitHub Secret)
  ANTHROPIC_API_KEY        — Claude API key (GitHub Secret)
  QUERY                    — Gmail search query (free text or operator syntax)
  MODE                     — "draft" (default) or "send"
  ADDITIONAL_INSTRUCTIONS  — optional per-call direction for the reply
                             (e.g. "вежливо отказать", "подтвердить встречу вторник 14:00")
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from anthropic import Anthropic

EMAILER_URL = os.environ["EMAILER_URL"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
QUERY = os.environ["QUERY"]
MODE = (os.environ.get("MODE") or "draft").strip().lower()
if MODE not in ("draft", "send"):
    MODE = "draft"
ADDITIONAL = (os.environ.get("ADDITIONAL_INSTRUCTIONS") or "").strip()

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
MAX_TOKENS = 700


# --- emailer call: explicit two-step POST → GET (Apps Script always 302s) ---


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def call_emailer(payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8"}
    post_req = urllib.request.Request(EMAILER_URL, data=body, headers=headers, method="POST")
    location = None
    try:
        resp = _OPENER.open(post_req, timeout=120)
        # No redirect — direct JSON.
        raw = resp.read()
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            return {"success": False, "error": "Direct response not JSON: {}".format(exc)}
    except urllib.error.HTTPError as exc:
        if exc.code in (301, 302, 303, 307, 308):
            location = exc.headers.get("Location")
            if not location:
                return {"success": False, "error": "Redirect with no Location header"}
        else:
            return {"success": False, "error": "POST HTTP {}: {}".format(
                exc.code, exc.read().decode("utf-8", "replace"))}
    except urllib.error.URLError as exc:
        return {"success": False, "error": "POST URL error: {}".format(exc.reason)}

    try:
        with urllib.request.urlopen(location, timeout=120) as r:
            raw = r.read()
        return json.loads(raw.decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError) as exc:
        return {"success": False, "error": "GET error: {}".format(exc)}
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return {"success": False, "error": "Redirect response not JSON: {}".format(exc)}


# --- system prompt: load marketolog SKILL.md verbatim and wrap with reply rules ---

_SKILL_PATH = Path(__file__).parent.parent / ".claude" / "skills" / "marketolog" / "SKILL.md"
_marketolog_md = _SKILL_PATH.read_text(encoding="utf-8") if _SKILL_PATH.exists() else ""

SYSTEM_PROMPT = """Ты пишешь короткие персональные ответы на Gmail-письма от имени Aram Badalyan / Das Experten.

Твоя задача в каждом запросе:
1. Прочитать всю цепочку, понять контекст и тон.
2. Написать короткий (3–6 строк) ответ на ПОСЛЕДНЕЕ сообщение в цепочке.
3. Применить принципы маркетолога ниже — для остроты и точности фраз.

Жёсткие правила:
- Язык ответа = язык исходного письма (русский → русский, английский → английский, etc.).
- Длина: 3–6 коротких строк. Без воды, без преамбул.
- Голос: прямой, тёплый, по-человечески, peer-to-peer. Без корпоративного тона и без преувеличенной вежливости.
- Никогда не подписывайся в конце — Gmail сам подставит подпись.
- Не выдумывай факты, цены, сроки, имена, события. Если для ответа нужна конкретика, которой нет в цепочке — оставляй формулировки общими.
- Если письмо — массовая рассылка / спам / явный auto-pitch — короткий вежливый отказ или просьба об отписке.
- Если автор уже задал прямой вопрос — отвечай конкретно на него, не уходи в маркетинг.
- Если автор предлагает встречу/звонок — подтверждай только если время явно указано в дополнительных инструкциях оператора; иначе — мягкий встречный шаг (предложить альтернативу или попросить варианты).

ФОРМАТ ВЫХОДА:
ТОЛЬКО тело письма, готовое к вставке в Gmail. Без префикса "Ответ:", без кавычек вокруг, без объяснений того, что ты сделал. Никаких "[имя]" и шаблонов — пиши законченный текст.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПРИНЦИПЫ МАРКЕТОЛОГА (применяй ДЛЯ ОСТРОТЫ ФОРМУЛИРОВОК):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

""" + _marketolog_md


# --- Step 1: find one matching thread ---

print("Search query:           {!r}".format(QUERY))
print("Mode:                   {}".format(MODE))
if ADDITIONAL:
    print("Extra instructions:     {!r}".format(ADDITIONAL))
print()

print("Step 1: find first matching thread")
find_resp = call_emailer({"action": "find", "query": QUERY, "max_results": 1})
if not find_resp.get("success"):
    print("::error::find failed: {}".format(find_resp.get("error", "unknown")))
    sys.exit(1)
threads = find_resp.get("threads") or []
if not threads:
    print("::error::No threads matched the query — refine and re-run.")
    sys.exit(1)
thread_id = threads[0].get("thread_id")
print("Found thread: {} — {}".format(thread_id, threads[0].get("subject", "")))


# --- Step 2: pull full thread ---

print()
print("Step 2: fetch full thread")
thread_resp = call_emailer({"action": "get_thread", "thread_id": thread_id})
if not thread_resp.get("success"):
    print("::error::get_thread failed: {}".format(thread_resp.get("error", "unknown")))
    sys.exit(1)

subject = thread_resp.get("subject", "")
participants = thread_resp.get("participants") or []
messages = thread_resp.get("messages") or []
last_msg = messages[-1] if messages else {}
last_from = last_msg.get("from", "")
print("Thread:        {} message(s)".format(len(messages)))
print("Subject:       {}".format(subject))
print("Last from:     {}".format(last_from))


# --- Step 3: draft via Claude API ---

conv_parts = []
conv_parts.append("Тема цепочки: {}".format(subject or "(без темы)"))
conv_parts.append("Участники: {}".format(", ".join(participants) or "(не указаны)"))
conv_parts.append("Сообщений в цепочке: {}".format(len(messages)))
conv_parts.append("")
conv_parts.append("=== ЦЕПОЧКА (от старого к новому) ===")
for msg in messages:
    body_plain = (msg.get("body_plain", "") or "").strip()
    if len(body_plain) > 3500:
        body_plain = body_plain[:3500] + "\n\n[…обрезано…]"
    conv_parts.append("")
    conv_parts.append("--- {} от {} ---".format(msg.get("date", ""), msg.get("from", "")))
    conv_parts.append(body_plain or "(пусто)")

conv_parts.append("")
conv_parts.append("=== ЗАДАЧА ===")
conv_parts.append("Напиши краткий ответ на ПОСЛЕДНЕЕ сообщение в этой цепочке (от {!r}).".format(last_from))
if ADDITIONAL:
    conv_parts.append("")
    conv_parts.append("Дополнительные указания оператора (применить буквально):")
    conv_parts.append(ADDITIONAL)

user_body = "\n".join(conv_parts)

print()
print("Step 3: drafting reply via Claude ({}, max_tokens={})".format(MODEL, MAX_TOKENS))
client = Anthropic(api_key=ANTHROPIC_API_KEY, timeout=90.0)
resp = client.messages.create(
    model=MODEL,
    max_tokens=MAX_TOKENS,
    system=[{
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    }],
    messages=[{"role": "user", "content": user_body}],
)
reply_text = "\n".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
if not reply_text:
    print("::error::Claude returned empty body. stop_reason={}".format(resp.stop_reason))
    sys.exit(1)

print("Reply drafted: {} chars  (input={}, output={}, cache_read={})".format(
    len(reply_text),
    getattr(resp.usage, "input_tokens", 0) or 0,
    getattr(resp.usage, "output_tokens", 0) or 0,
    getattr(resp.usage, "cache_read_input_tokens", 0) or 0,
))
print()
print("--- Drafted reply ---")
print(reply_text)
print("--- end of reply ---")


# --- Step 4: post via emailer (draft or send) ---

print()
draft_only = (MODE == "draft")
print("Step 4: posting via emailer (mode={})".format("DRAFT" if draft_only else "SEND"))
reply_resp = call_emailer({
    "action": "reply",
    "thread_id": thread_id,
    "body_plain": reply_text,
    "draft_only": draft_only,
    "context": "gmail-quick-reply workflow · query={} · mode={}".format(QUERY, MODE),
})
if not reply_resp.get("success"):
    print("::error::emailer reply failed: {}".format(reply_resp.get("error", "unknown")))
    sys.exit(1)

if draft_only:
    print("::notice::Draft created in Gmail. {}".format(
        reply_resp.get("draft_link") or "(check Gmail → Drafts)"))
else:
    print("::notice::Reply sent. message_id={}".format(reply_resp.get("message_id")))
    if reply_resp.get("archive_doc_link"):
        print("::notice::Reporter archive (email Doc): {}".format(reply_resp["archive_doc_link"]))


# --- Step 5: Drive trail ---

print()
print("Step 5: write Drive trail to gmail-quick-reply/")
last_body = (last_msg.get("body_plain", "") or "").strip()
if len(last_body) > 5000:
    last_body = last_body[:5000] + "\n\n[…обрезано…]"

trail_md = []
trail_md.append("# Quick reply · {}".format(QUERY))
trail_md.append("")
trail_md.append("- **Mode:**     {}".format(MODE))
trail_md.append("- **Subject:**  {}".format(subject))
trail_md.append("- **Thread:**   {}".format(thread_id))
trail_md.append("- **Last from:** {}".format(last_from))
if ADDITIONAL:
    trail_md.append("- **Operator instructions:** {}".format(ADDITIONAL))
trail_md.append("")
trail_md.append("## Last incoming message")
trail_md.append("")
trail_md.append("```")
trail_md.append(last_body or "(empty)")
trail_md.append("```")
trail_md.append("")
trail_md.append("## Reply drafted")
trail_md.append("")
trail_md.append("```")
trail_md.append(reply_text)
trail_md.append("```")

import re as _re


def _extract_email(s):
    m = _re.search(r"<([^>]+)>", s or "")
    return (m.group(1) if m else (s or "")).strip().lower()


def _extract_name(addr):
    """Folder label: display name if present, else full email, else unknown."""
    addr = (addr or "").strip()
    if not addr:
        return "unknown"
    m = _re.match(r'^(?:"?(?P<name>[^"<]*?)"?\s*)?<(?P<email>[^>]+)>\s*$', addr)
    if m:
        name = (m.group("name") or "").strip()
        if name:
            return name
        return m.group("email").strip()
    return addr


lead_name = _extract_name(last_from)
lead_email = _extract_email(last_from)

archive_resp = call_emailer({
    "action": "archive",
    "title": "Quick reply — {}".format((subject or QUERY)[:60]),
    "body_plain": "\n".join(trail_md),
    "archive_label": lead_name,
    "context": "gmail-quick-reply workflow · query={} · mode={} · email={}".format(QUERY, MODE, lead_email),
})
if archive_resp.get("success"):
    print("::notice::Drive trail: {}".format(archive_resp.get("archive_doc_link")))
else:
    print("::warning::archive failed: {}".format(archive_resp.get("error")))

print()
print("Done.")
