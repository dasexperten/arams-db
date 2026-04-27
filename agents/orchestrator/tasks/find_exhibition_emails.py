"""
Task: Find all exhibition-related emails from the last 2 months.
For each: 3-4 sentence analysis + short draft reply.
Output: GitHub Actions step summary + results/exhibitions.md
"""

import os, sys, json, re, urllib.request
from datetime import datetime

INBOXES = {
    "eurasia":   "eurasia@dasexperten.de",
    "emea":      "emea@dasexperten.de",
    "export":    "export@dasexperten.de",
    "marketing": "marketing@dasexperten.de",
}

SEARCH_QUERY = (
    "newer_than:60d ("
    "выставка OR выставки OR exhibition OR expo OR messe OR "
    "\"trade show\" OR \"trade fair\" OR salon OR \"fair 2026\" OR \"fair 2025\""
    ")"
)

MODEL = "claude-sonnet-4-6"

# ── HTTP ──────────────────────────────────────────────────────────────────────

def post_json(url, data):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(url, data=body,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

# ── Emailer ───────────────────────────────────────────────────────────────────

def emailer(payload):
    url  = os.environ["EMAILER_EXEC_URL"]
    resp = post_json(url, payload)
    if resp.get("error"):
        raise RuntimeError(resp["error"])
    return resp

def get_body(thread_id):
    try:
        res = emailer({"action": "get_thread", "thread_id": thread_id})
        msg = (res.get("messages") or [{}])[0]
        return (msg.get("body_plain") or msg.get("snippet") or "")[:800]
    except Exception:
        return ""

# ── Claude ────────────────────────────────────────────────────────────────────

def claude(system, user, max_tokens=300):
    url  = "https://api.anthropic.com/v1/messages"
    body = json.dumps({
        "model": MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type":      "application/json",
        "x-api-key":         os.environ["ANTHROPIC_API_KEY"],
        "anthropic-version": "2023-06-01",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    if "error" in data:
        raise RuntimeError(data["error"]["message"])
    return data["content"][0]["text"].strip()

ANALYSIS_SYSTEM = """\
You are an assistant for Das Experten, a German oral care brand.
Analyze this email about an exhibition/trade show in 3-4 sentences:
- What exhibition is mentioned and when/where
- What the sender wants or is offering
- Whether this is relevant for Das Experten (Yes/Maybe/No) and why
Reply in Russian."""

DRAFT_SYSTEM = """\
You are a business writer for Das Experten oral care brand.
Write a short, professional reply to this exhibition email in 3-4 sentences.
Be polite, express interest if relevant, ask the key clarifying question if needed.
Match the sender's language. No subject line — body only."""

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("Searching for exhibition emails (last 60 days)...")

    all_threads = []
    seen_ids = set()

    for name, addr in INBOXES.items():
        try:
            res = emailer({"action": "find", "query": SEARCH_QUERY,
                           "inbox": addr, "max_results": 50})
            for t in (res.get("threads") or []):
                if t.get("thread_id") not in seen_ids:
                    t["_inbox"] = addr
                    t["_inbox_name"] = name
                    all_threads.append(t)
                    seen_ids.add(t["thread_id"])
        except Exception as e:
            print(f"  Warning: {addr}: {e}", file=sys.stderr)

    print(f"Found {len(all_threads)} threads.")

    if not all_threads:
        write_summary("## Выставки\n\nПисем про выставки за последние 2 месяца не найдено.")
        return

    results = []
    for i, t in enumerate(all_threads):
        print(f"  Processing {i+1}/{len(all_threads)}: {t.get('subject','')[:60]}")
        body     = get_body(t["thread_id"])
        ctx      = f"From: {t.get('from','')}\nSubject: {t.get('subject','')}\nInbox: {t['_inbox']}\n\n{body}"
        analysis = claude(ANALYSIS_SYSTEM, ctx, 200)
        draft    = claude(DRAFT_SYSTEM,    ctx, 200)
        results.append({
            "thread_id": t["thread_id"],
            "inbox":     t["_inbox"],
            "subject":   t.get("subject", "(без темы)"),
            "from":      t.get("from", "?"),
            "analysis":  analysis,
            "draft":     draft,
        })

    # Write markdown report
    lines = [
        f"# Письма про выставки — {datetime.now().strftime('%d.%m.%Y')}",
        f"\nНайдено: **{len(results)} писем**\n",
        "---",
    ]
    for n, r in enumerate(results, 1):
        lines += [
            f"\n## {n}. {r['subject']}",
            f"**От:** {r['from']}  |  **Inbox:** {r['inbox']}",
            f"**Thread ID:** `{r['thread_id']}`",
            "",
            "### Анализ",
            r["analysis"],
            "",
            "### Черновик ответа",
            r["draft"],
            "",
            "---",
        ]

    md = "\n".join(lines)
    write_summary(md)

    # Save to file
    os.makedirs("results", exist_ok=True)
    with open("results/exhibitions.md", "w", encoding="utf-8") as f:
        f.write(md)
    print(f"\nDone. Results saved to results/exhibitions.md")

def write_summary(text):
    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file:
        with open(summary_file, "w", encoding="utf-8") as f:
            f.write(text)

if __name__ == "__main__":
    main()
