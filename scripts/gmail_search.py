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


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Stops urllib from following 3xx so we can capture the Location ourselves."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_NO_REDIRECT_OPENER = urllib.request.build_opener(_NoRedirect)


def call_emailer(payload):
    """Two-step Apps Script call: POST /macros/s/.../exec returns 302 to
    script.googleusercontent.com, where the JSON body lives. Python's default
    redirect handler proved unreliable here (empty response), so we drive it
    explicitly: POST + capture Location header, then GET the redirect target."""

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8"}

    # Step 1: POST without following redirects, capture Location.
    post_req = urllib.request.Request(EMAILER_URL, data=body, headers=headers, method="POST")
    try:
        resp = _NO_REDIRECT_OPENER.open(post_req, timeout=120)
        # If no redirect happened, Apps Script returned data directly.
        raw = resp.read()
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            return {"success": False, "error": "Direct response not JSON: {} | first 200 chars: {!r}".format(
                exc, raw[:200])}
    except urllib.error.HTTPError as exc:
        if exc.code in (301, 302, 303, 307, 308):
            location = exc.headers.get("Location")
            if not location:
                return {"success": False, "error": "Redirect {} with no Location header".format(exc.code)}
        else:
            return {
                "success": False,
                "error": "POST HTTP {}: {}".format(exc.code, exc.read().decode("utf-8", "replace")),
            }
    except urllib.error.URLError as exc:
        return {"success": False, "error": "POST URL error: {}".format(exc.reason)}

    # Step 2: GET the redirect target.
    try:
        with urllib.request.urlopen(location, timeout=120) as r:
            raw = r.read()
    except urllib.error.HTTPError as exc:
        return {"success": False, "error": "GET HTTP {}: {}".format(exc.code, exc.read().decode("utf-8", "replace"))}
    except urllib.error.URLError as exc:
        return {"success": False, "error": "GET URL error: {}".format(exc.reason)}

    try:
        return json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return {"success": False, "error": "Redirect response not JSON: {} | first 200 chars: {!r}".format(
            exc, raw[:200])}


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
print()
print("Step 4: archive transcript to Drive (REPORTER_FOLDER_ID/gmail-search/)")
md_text = "\n".join(md) if total > 0 else "_No threads matched query._"
archive_resp = call_emailer({
    "action": "archive",
    "title": "Gmail search · {}".format(QUERY),
    "body_plain": md_text,
    "archive_label": "gmail-search",
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
