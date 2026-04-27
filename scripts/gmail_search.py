#!/usr/bin/env python3
"""
gmail_search.py — call the emailer Apps Script web app to find Gmail threads
matching a search query, fetch the full content of each, and write the
collected correspondence to disk as markdown + JSON.

Files produced (in the workflow workspace):
  transcript.md    — human-readable Markdown, one section per thread
  transcript.json  — machine-readable, full thread/message tree

Both are uploaded as the workflow artifact `gmail-search-result` so Aram
can download them from the run summary, paste into Claude / hand off to
analysis agents, and decide separately whether to reply or forward.

Inputs (env):
  EMAILER_URL    — Apps Script web app URL (GitHub Secret)
  QUERY          — Gmail search syntax string (e.g. "Московская ярмарка моды"
                   or "from:user@example.com")
  MAX_THREADS    — number of matching threads to fetch fully (default 20, cap 50)

This script never sends or drafts email. find + get_thread only.
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

if MAX_THREADS < 1:
    MAX_THREADS = 1
if MAX_THREADS > 50:
    MAX_THREADS = 50

print("Search query: {!r}".format(QUERY))
print("Max threads:  {}".format(MAX_THREADS))
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

thread_summaries = find_resp.get("threads", []) or []
total = find_resp.get("total_found", len(thread_summaries))
print("Found {} thread(s).".format(total))

# ----- Step 2: fetch each thread fully -----
print()
print("Step 2: fetch full content of each thread")

full_threads = []
failed_threads = []

for i, summary in enumerate(thread_summaries, start=1):
    tid = summary.get("thread_id", "")
    if not tid:
        continue
    print("  ({}/{}) thread_id={}".format(i, len(thread_summaries), tid))

    thread_resp = call_emailer({"action": "get_thread", "thread_id": tid})
    if not thread_resp.get("success"):
        err = thread_resp.get("error", "unknown")
        print("    ::warning::failed: {}".format(err))
        failed_threads.append({"thread_id": tid, "error": err})
        continue

    full_threads.append({
        "thread_id": tid,
        "subject": thread_resp.get("subject") or "(no subject)",
        "participants": thread_resp.get("participants") or [],
        "message_count": thread_resp.get("message_count", 0),
        "gmail_url": "https://mail.google.com/mail/u/0/#inbox/{}".format(tid),
        "messages": thread_resp.get("messages") or [],
    })

# ----- Step 3a: write transcript.json (machine-readable) -----
result = {
    "query": QUERY,
    "total_found": total,
    "fetched_count": len(full_threads),
    "failed_count": len(failed_threads),
    "failed_threads": failed_threads,
    "threads": full_threads,
}
with open("transcript.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print()
print("Wrote transcript.json ({:,} bytes)".format(os.path.getsize("transcript.json")))

# ----- Step 3b: write transcript.md (human-readable) -----
md = []
md.append("# Gmail search: `{}`".format(QUERY))
md.append("")
md.append("- **Found:** {}".format(total))
md.append("- **Fetched fully:** {}".format(len(full_threads)))
if failed_threads:
    md.append("- **Failed:** {}".format(len(failed_threads)))
md.append("")

if total == 0:
    md.append("_No threads matched the query._")
else:
    for i, t in enumerate(full_threads, start=1):
        md.append("---")
        md.append("")
        md.append("## {}. {}".format(i, t["subject"]))
        md.append("")
        md.append("- **Thread:** [{}]({})".format(t["thread_id"], t["gmail_url"]))
        md.append("- **Participants:** {}".format(", ".join(t["participants"])))
        md.append("- **Messages:** {}".format(t["message_count"]))
        md.append("")
        for msg in t["messages"]:
            date = msg.get("date", "") or ""
            from_ = msg.get("from", "") or ""
            attachments = msg.get("attachment_names") or []
            body = (msg.get("body_plain", "") or "").strip()

            md.append("### {} — {}".format(date, from_))
            if attachments:
                md.append("_Attachments: {}_".format(", ".join(attachments)))
            md.append("")
            if body:
                # quote-block the body for visual separation
                md.append("```")
                md.append(body)
                md.append("```")
            else:
                md.append("_(empty)_")
            md.append("")

    if failed_threads:
        md.append("---")
        md.append("")
        md.append("## Failed threads")
        md.append("")
        for ft in failed_threads:
            md.append("- `{}` — {}".format(ft["thread_id"], ft["error"]))

with open("transcript.md", "w", encoding="utf-8") as f:
    f.write("\n".join(md) + "\n")
print("Wrote transcript.md  ({:,} bytes)".format(os.path.getsize("transcript.md")))

# ----- Step 4: archive the transcript to Drive via emailer (no email sent) -----
import re as _re


def _extract_email(s):
    m = _re.search(r"<([^>]+)>", s or "")
    return (m.group(1) if m else (s or "")).strip().lower()


def _extract_name(addr):
    addr = (addr or "").strip()
    if not addr:
        return ""
    m = _re.match(r'^(?:"?(?P<name>[^"<]*?)"?\s*)?<(?P<email>[^>]+)>\s*$', addr)
    if m:
        name = (m.group("name") or "").strip()
        if name:
            return name
        return m.group("email").split("@", 1)[0]
    if "@" in addr:
        return addr.split("@", 1)[0]
    return addr


# Lead-centric label by NAME: if every fetched thread is tied to a single
# external participant, file under that person's name. Otherwise fall back to
# the generic searches/ folder.
def _resolve_archive_label(threads_, query_):
    external = {}  # email → name
    for t in threads_:
        for p in t.get("participants") or []:
            email = _extract_email(p)
            if email and "dasexperten" not in email:
                external.setdefault(email, _extract_name(p) or email.split("@", 1)[0])
    if len(external) == 1:
        return next(iter(external.values()))
    # If user typed `from:something@x.com` and that resolved to one of the
    # participants, prefer the name we collected for it.
    m = _re.search(r"from:\s*([^\s]+@[^\s]+)", query_, _re.IGNORECASE)
    if m:
        target = m.group(1).strip().lower()
        if target in external:
            return external[target]
        return target.split("@", 1)[0]
    return "searches"


archive_label = _resolve_archive_label(full_threads, QUERY)
print()
print("Step 4: archive transcript to Drive (REPORTER_FOLDER_ID/{}/)".format(archive_label))
md_text = "\n".join(md) if total > 0 else "_No threads matched query._"
archive_resp = call_emailer({
    "action": "archive",
    "title": "Gmail search — {}".format(QUERY),
    "body_plain": md_text,
    "archive_label": archive_label,
    "context": "gmail-search workflow · query={} · {} thread(s)".format(QUERY, len(full_threads)),
})

archive_link = None
if archive_resp.get("success"):
    archive_link = archive_resp.get("archive_doc_link")
    print("::notice::Archive Doc: {}".format(archive_link))
else:
    print("::warning::Archive failed (transcript files still uploaded as artifact): {}".format(
        archive_resp.get("error", "unknown")
    ))

# ----- Step 5: log a compact preview to the Actions log -----
print()
print("=" * 60)
print("Summary")
print("=" * 60)
print("Query:         {}".format(QUERY))
print("Total found:   {}".format(total))
print("Fetched:       {}".format(len(full_threads)))
if failed_threads:
    print("Failed:        {}".format(len(failed_threads)))
if archive_link:
    print("Archive Doc:   {}".format(archive_link))
print()
if full_threads:
    print("Threads (subject — last sender):")
    for t in full_threads:
        last_from = t["messages"][-1].get("from", "") if t["messages"] else ""
        print("  {}  — {}".format(t["subject"][:60], last_from[:50]))

if total == 0:
    print()
    print("::warning::No threads matched. Refine the query and re-run.")
    sys.exit(0)

print()
print("::notice::Download transcript.md / transcript.json from the run artifact 'gmail-search-result'.")
sys.exit(0)
