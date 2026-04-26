#!/usr/bin/env python3
"""
gmail_search.py — call the emailer Apps Script web app to find Gmail threads
matching a search query, fetch the full content of each, and email the
compiled transcript back to the user.

Inputs (env):
  EMAILER_URL    — Apps Script web app URL (GitHub Secret)
  QUERY          — Gmail search syntax string (e.g. "Московская ярмарка моды"
                   or "from:user@example.com")
  MAX_THREADS    — number of matching threads to fetch fully (default 20, cap 50)
  SEND_TO        — recipient email for the transcript (default expertendas@gmail.com)

Output:
  Plain-text transcript sent to SEND_TO via emailer's "send" action. The
  emailer's Reporter archives the transcript Doc as a side effect.
"""

import json
import os
import sys
import urllib.error
import urllib.request


def call_emailer(payload):
    req = urllib.request.Request(
        EMAILER_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return {
            "success": False,
            "error": "HTTP {}: {}".format(exc.code, exc.read().decode("utf-8", "replace")),
        }
    except urllib.error.URLError as exc:
        return {"success": False, "error": "URL error: {}".format(exc.reason)}


EMAILER_URL = os.environ["EMAILER_URL"]
QUERY = os.environ["QUERY"]
MAX_THREADS = int(os.environ.get("MAX_THREADS", "20") or "20")
SEND_TO = os.environ.get("SEND_TO", "expertendas@gmail.com") or "expertendas@gmail.com"

if MAX_THREADS < 1:
    MAX_THREADS = 1
if MAX_THREADS > 50:
    MAX_THREADS = 50

print("Search query: {!r}".format(QUERY))
print("Max threads:  {}".format(MAX_THREADS))
print("Send to:      {}".format(SEND_TO))
print()

# ----- Step 1: find -----
print("Step 1: find matching threads")
find_resp = call_emailer({
    "action": "find",
    "query": QUERY,
    "max_results": MAX_THREADS,
})

if not find_resp.get("success"):
    print("::error::find failed: {}".format(find_resp.get("error", "unknown")))
    sys.exit(1)

threads = find_resp.get("threads", []) or []
total = find_resp.get("total_found", len(threads))
print("Found {} thread(s).".format(total))

if total == 0:
    print("::warning::No threads matched the query — nothing to send.")
    sys.exit(0)

# ----- Step 2: fetch each thread -----
print()
print("Step 2: fetch full content of each thread")
parts = []
parts.append("=== Поиск: {} ===".format(QUERY))
parts.append("")
parts.append("Найдено: {} тред(ов)".format(total))
if total > MAX_THREADS:
    parts.append("(показаны первые {} в порядке выдачи Gmail)".format(MAX_THREADS))
parts.append("")

failed_threads = []

for i, summary in enumerate(threads, start=1):
    tid = summary.get("thread_id", "")
    if not tid:
        continue
    print("  ({}/{}) thread_id={}".format(i, len(threads), tid))

    thread_resp = call_emailer({"action": "get_thread", "thread_id": tid})
    if not thread_resp.get("success"):
        err = thread_resp.get("error", "unknown")
        print("    ::warning::failed: {}".format(err))
        failed_threads.append((tid, err))
        continue

    subject = thread_resp.get("subject") or "(без темы)"
    participants = ", ".join(thread_resp.get("participants") or [])
    msg_count = thread_resp.get("message_count", 0)

    parts.append("=" * 78)
    parts.append("Тред {}/{}: {}".format(i, len(threads), subject))
    parts.append("=" * 78)
    parts.append("Участники:  {}".format(participants))
    parts.append("Сообщений:  {}".format(msg_count))
    parts.append("Thread ID:  {}".format(tid))
    parts.append("Открыть:    https://mail.google.com/mail/u/0/#inbox/{}".format(tid))
    parts.append("")

    for msg in thread_resp.get("messages", []) or []:
        date = msg.get("date", "") or ""
        from_ = msg.get("from", "") or ""
        body = (msg.get("body_plain", "") or "").strip()
        attachments = msg.get("attachment_names") or []

        parts.append("-" * 78)
        parts.append("{}  ·  {}".format(date, from_))
        if attachments:
            parts.append("Вложения: {}".format(", ".join(attachments)))
        parts.append("-" * 78)
        parts.append(body if body else "(пусто)")
        parts.append("")

    parts.append("")

if failed_threads:
    parts.append("=" * 78)
    parts.append("Не удалось загрузить {} тред(ов):".format(len(failed_threads)))
    for tid, err in failed_threads:
        parts.append("  - {}: {}".format(tid, err))
    parts.append("")

transcript = "\n".join(parts)

# Tail summary in the Actions log too
print()
print("Transcript size: {:,} chars / {} thread(s) compiled".format(len(transcript), len(threads) - len(failed_threads)))

# ----- Step 3: send transcript via emailer -----
print()
print("Step 3: send transcript to {}".format(SEND_TO))
subject_line = "Переписка по запросу: {}".format(QUERY)
send_resp = call_emailer({
    "action": "send",
    "recipient": SEND_TO,
    "subject": subject_line,
    "body_plain": transcript,
    "context": "gmail-search workflow · query={}".format(QUERY),
})

if send_resp.get("success"):
    print("::notice::Transcript sent to {}".format(SEND_TO))
    archive_link = send_resp.get("archive_doc_link")
    if archive_link:
        print("::notice::Archive Doc: {}".format(archive_link))
    archive_err = send_resp.get("archive_error")
    if archive_err:
        print("::warning::Archive error (email still sent): {}".format(archive_err))
    sys.exit(0)
else:
    print("::error::send failed: {}".format(send_resp.get("error", "unknown")))
    sys.exit(1)
