#!/usr/bin/env python3
"""
gmail_analyze_sender.py — find a sender's most recent Gmail thread,
read it, run the my-tools/emailer routing logic via Claude API, and
print the structured analysis block straight to the Actions log.

No drafts, no replies, no email sent. Read + analyze + archive only.

Pipeline:
  1. emailer find (from:<sender>)         — discover threads
  2. emailer get_thread (latest match)    — full conversation
  3. emailer find (to:<email> in:sent)    — CRM history check
  4. Anthropic API                        — routing decision + block
                                            (system prompt = my-tools/README.md
                                             + Virtual_staff.md verbatim)
  5. emailer archive                      — Drive trail in
                                            REPORTER_FOLDER_ID/sender-analysis/

Inputs (env):
  EMAILER_URL          — Apps Script web app URL (GitHub Secret)
  ANTHROPIC_API_KEY    — Claude API key (GitHub Secret)
  SENDER_QUERY         — name or email of the sender (free text or
                         already-formed Gmail operator)

Output:
  Structured analysis block printed to stdout (visible in the Actions
  run log). Also archived as a markdown file in Drive.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from anthropic import Anthropic


EMAILER_URL = os.environ["EMAILER_URL"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
SENDER_QUERY = os.environ["SENDER_QUERY"].strip()

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")
MAX_TOKENS = 1500


# -------- emailer call: explicit two-step POST → GET --------


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
        with _OPENER.open(post_req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
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
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError) as exc:
        return {"success": False, "error": "GET error: {}".format(exc)}


# -------- query normalization --------

def normalize_query(raw: str) -> str:
    """If the user passed `from:something` keep it; otherwise wrap as from:..."""
    raw = raw.strip()
    if not raw:
        return ""
    if re.search(r"\b(from|to|subject|cc|bcc|in|is|has|label):", raw, re.IGNORECASE):
        return raw
    return "from:" + raw


def extract_email(addr: str) -> str:
    if not addr:
        return ""
    m = re.search(r"<([^>]+)>", addr)
    return (m.group(1) if m else addr).strip().lower()


def extract_name(addr: str) -> str:
    """Folder label for the lead.

    Priority:
      1. Display name from 'Display Name <email>' if present.
      2. Full email address (e.g. 'ishita@example.com') if no display name.
      3. 'unknown' if input is empty.
    """
    addr = (addr or "").strip()
    if not addr:
        return "unknown"
    m = re.match(r'^(?:"?(?P<name>[^"<]*?)"?\s*)?<(?P<email>[^>]+)>\s*$', addr)
    if m:
        name = (m.group("name") or "").strip()
        if name:
            return name
        return m.group("email").strip()
    return addr


# -------- load routing rules verbatim --------

REPO_ROOT = Path(__file__).resolve().parent.parent
MYTOOLS = REPO_ROOT / "my-tools"


def _read_if_exists(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


ROUTING_README = _read_if_exists(MYTOOLS / "README.md")
VIRTUAL_STAFF = _read_if_exists(MYTOOLS / "Virtual_staff.md")
INBOX_ROUTING = _read_if_exists(MYTOOLS / "emailer" / "reference" / "inbox-routing.md")
EMAILER_SKILL = _read_if_exists(MYTOOLS / "emailer" / "SKILL.md")


SYSTEM_PROMPT = f"""Ты — routing-аналитик emailer для Das Experten.

Твоя задача — посмотреть на входящее письмо и принять решение по маршрутизации:
- В какой inbox оно пришло (To-field) → sub-mode (Mode A executive / B-RU / B-EMEA / B-EXPORT / B-MARKETING).
- На каком языке написано тело письма.
- Покрыт ли язык виртуальным штатом Das Experten.
- Есть ли история переписки с этим адресом.
- Тип обращения и какая persona отвечает.

Выводишь ТОЛЬКО структурированный блок в строгом формате (см. ниже). Никаких преамбул, никаких пояснений вне блока, никаких драфтов писем.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROUTING RULES — my-tools/README.md (source of truth):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{ROUTING_README}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIRTUAL STAFF — my-tools/Virtual_staff.md (full personas):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{VIRTUAL_STAFF}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADDITIONAL ROUTING DOCS (if present):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{INBOX_ROUTING}

{EMAILER_SKILL}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ВЫХОДНОЙ ФОРМАТ — заполнить ВСЕ поля. Если поле невозможно определить — поставь `(unknown)` и опиши причину в RED FLAGS / GAPS.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

---
ОТПРАВИТЕЛЬ:    <email>
ДОМЕН:          <example.com — комментарий: gmail / corporate / подозрительный?>
INBOX:          <to-address>
SUB-MODE:       <Mode A / B-RU / B-EMEA / B-EXPORT / B-MARKETING>
ЯЗЫК:           <en / hi / hinglish / ru / other-XX>
ПОКРЫТИЕ ЯЗЫКА: <да / нет — если нет, причина>
CRM:            <new / led by <persona> (last contact <yyyy-mm-dd>)>
ТИП ОБРАЩЕНИЯ:  <блогер / клиент B2C / B2B запрос / другое — уточни>
PERSONA:        <имя сотрудника штата / "Mode A — Aram Badalyan" / "HALT — язык не покрыт" / "HALT — другое">
SUMMARY:        <2-3 предложения по сути письма>
ЧТО ОНА ХОЧЕТ:
  - <action item 1>
  - <action item 2>
  - ...
RED FLAGS / GAPS:
  - <если есть; иначе одну строку — "нет">
---

Hard rules:
- Если язык НЕ покрыт штатом → PERSONA = "HALT — язык не покрыт", и в RED FLAGS укажи язык + что нужно расширить штат.
- Hinglish: если базовая структура English с вкраплениями Hindi (kya, hai, accha, namaste, ji) → обрабатывай как English. Если базовая структура Hindi → HALT.
- Никогда не ври про CRM-историю — если данных нет, ставь `new`.
- Никогда не предлагай конкретный текст ответа — только маршрутизация и анализ.
"""


# -------- pipeline --------

print("Sender query:        {!r}".format(SENDER_QUERY))
norm_query = normalize_query(SENDER_QUERY)
print("Normalized query:    {!r}".format(norm_query))
print()

# Step 1: find threads
print("Step 1: find sender's threads")
find_resp = call_emailer({"action": "find", "query": norm_query, "max_results": 5})
if not find_resp.get("success"):
    print("::error::find failed: {}".format(find_resp.get("error", "unknown")))
    sys.exit(1)

threads = find_resp.get("threads") or []
total = find_resp.get("total_found", len(threads))
if not threads:
    print("::error::No threads found for query {!r}.".format(norm_query))
    print("Try a more specific query: full email, or 'from:Name Surname'.")
    sys.exit(1)
print("Found {} thread(s). Picking the most recent.".format(total))

# Pick most recent by last_message_date
def _date_key(t):
    return t.get("last_message_date") or ""
threads_sorted = sorted(threads, key=_date_key, reverse=True)
target = threads_sorted[0]
target_tid = target["thread_id"]
print("  thread_id: {}".format(target_tid))
print("  subject:   {}".format(target.get("subject", "")))


# Step 2: get full thread
print()
print("Step 2: get_thread")
thread_resp = call_emailer({"action": "get_thread", "thread_id": target_tid})
if not thread_resp.get("success"):
    print("::error::get_thread failed: {}".format(thread_resp.get("error")))
    sys.exit(1)

messages = thread_resp.get("messages") or []
print("  messages in thread: {}".format(len(messages)))


# Step 3: derive sender email and check CRM
def _last_inbound_message(msgs):
    """The last message NOT from one of our own dasexperten domains."""
    for m in reversed(msgs):
        f = (m.get("from") or "")
        if "dasexperten" not in f.lower():
            return m
    return msgs[-1] if msgs else {}


inbound = _last_inbound_message(messages)
sender_email = extract_email(inbound.get("from", ""))
sender_name = extract_name(inbound.get("from", ""))
print("  inbound sender:     {}".format(sender_email))

print()
print("Step 3: CRM history check (to:{} in:sent)".format(sender_email or "?"))
crm_summary = "new"
if sender_email:
    crm_resp = call_emailer({
        "action": "find",
        "query": "to:{} in:sent".format(sender_email),
        "max_results": 5,
    })
    if crm_resp.get("success"):
        crm_threads = crm_resp.get("threads") or []
        if crm_threads:
            last = sorted(crm_threads, key=_date_key, reverse=True)[0]
            last_date = (last.get("last_message_date") or "")[:10]
            crm_summary = "existing — {} sent thread(s); most recent {}".format(
                len(crm_threads), last_date or "(date unknown)"
            )
        else:
            crm_summary = "new (no prior outbound from us to this address)"
    else:
        crm_summary = "(crm check failed: {})".format(crm_resp.get("error"))
print("  CRM:                {}".format(crm_summary))


# Step 4: build user message for Claude
def _truncate(s, n=4000):
    s = s or ""
    return s if len(s) <= n else s[:n] + "\n\n[…truncated…]"


brief_lines = []
brief_lines.append("=== THREAD METADATA ===")
brief_lines.append("Subject:        {}".format(thread_resp.get("subject", "")))
brief_lines.append("Participants:   {}".format(", ".join(thread_resp.get("participants") or [])))
brief_lines.append("Messages:       {}".format(len(messages)))
brief_lines.append("CRM history:    {}".format(crm_summary))
brief_lines.append("")
brief_lines.append("=== FULL THREAD (oldest → newest) ===")
for m in messages:
    brief_lines.append("")
    brief_lines.append("--- {} ---".format(m.get("date", "")))
    brief_lines.append("From: {}".format(m.get("from", "")))
    to_list = m.get("to") or []
    if to_list:
        brief_lines.append("To:   {}".format(", ".join(to_list) if isinstance(to_list, list) else to_list))
    cc_list = m.get("cc") or []
    if cc_list:
        brief_lines.append("Cc:   {}".format(", ".join(cc_list) if isinstance(cc_list, list) else cc_list))
    brief_lines.append("")
    brief_lines.append(_truncate(m.get("body_plain", ""), 4000))

user_msg = "\n".join(brief_lines)


# Step 5: Claude API → analysis block
print()
print("Step 4: routing analysis via Claude ({}, max_tokens={})".format(MODEL, MAX_TOKENS))
client = Anthropic(api_key=ANTHROPIC_API_KEY, timeout=90.0)
resp = client.messages.create(
    model=MODEL,
    max_tokens=MAX_TOKENS,
    system=[{
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    }],
    messages=[{"role": "user", "content": user_msg}],
)
analysis = "\n".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
if not analysis:
    print("::error::Claude returned empty analysis. stop_reason={}".format(resp.stop_reason))
    sys.exit(1)

print()
print("=" * 70)
print("ANALYSIS")
print("=" * 70)
print(analysis)
print("=" * 70)
print()

# Step 6: archive trail
print("Step 5: archive analysis to Drive (sender-analysis/)")
trail = []
trail.append("# Sender analysis · {}".format(SENDER_QUERY))
trail.append("")
trail.append("- **Sender email:** {}".format(sender_email))
trail.append("- **Thread:** {}".format(target_tid))
trail.append("- **Subject:** {}".format(thread_resp.get("subject", "")))
trail.append("- **Messages:** {}".format(len(messages)))
trail.append("- **CRM:** {}".format(crm_summary))
trail.append("")
trail.append("## Routing analysis")
trail.append("")
trail.append(analysis)
trail.append("")
trail.append("## Last inbound body")
trail.append("")
trail.append("```")
trail.append(_truncate((inbound.get("body_plain") or "").strip(), 5000))
trail.append("```")

archive_resp = call_emailer({
    "action": "archive",
    "title": "Sender analysis — {}".format(SENDER_QUERY)[:80],
    "body_plain": "\n".join(trail),
    "archive_label": sender_name,
    "context": "gmail-analyze-sender workflow · query={} · email={}".format(SENDER_QUERY, sender_email),
})
if archive_resp.get("success"):
    print("::notice::Drive trail: {}".format(archive_resp.get("archive_doc_link")))
else:
    print("::warning::archive failed: {}".format(archive_resp.get("error")))

print()
print("Done.")
