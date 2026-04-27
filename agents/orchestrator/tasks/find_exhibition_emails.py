"""
Task: Find all event-related emails from the last 2 months.
Strategy: read full body of each recent email, let Claude judge
by full context whether it's about a business event.

Output: GitHub Actions step summary + results/exhibitions.md
"""

import os, sys, json, urllib.request
from datetime import datetime

# Just date + exclude noise. No keyword filter — we read bodies.
SEARCH_QUERY = "newer_than:60d -in:sent -in:trash -in:spam -category:promotions -category:social -category:forums"

MAX_THREADS  = 50  # emailer hard cap
MODEL_FILTER = "claude-haiku-4-5-20251001"
MODEL_DETAIL = "claude-sonnet-4-6"

# ── HTTP ──────────────────────────────────────────────────────────────────────

def post_json(url, data):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(url, data=body,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

def emailer(payload):
    resp = post_json(os.environ["EMAILER_EXEC_URL"], payload)
    if resp.get("error"):
        raise RuntimeError(resp["error"])
    return resp

def get_body(thread_id):
    try:
        res = emailer({"action": "get_thread", "thread_id": thread_id})
        msgs = res.get("messages") or []
        if not msgs:
            return ""
        m = msgs[0]
        return (m.get("body_plain") or m.get("plain_body") or m.get("snippet") or "")[:2000]
    except Exception as e:
        print(f"    get_body error: {e}", file=sys.stderr)
        return ""

def claude(system, user, model=MODEL_DETAIL, max_tokens=300):
    body = json.dumps({
        "model": model, "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type":      "application/json",
            "x-api-key":         os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
        })
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())
    if "error" in d:
        raise RuntimeError(d["error"]["message"])
    return d["content"][0]["text"].strip()

# ── Prompts ───────────────────────────────────────────────────────────────────

FILTER_SYSTEM = """\
You read business emails and decide if each is about a business EVENT
that Das Experten (a German oral care brand) might attend, host, or consider.

EVENT includes:
- Exhibitions, trade shows, expos, fairs (e.g. Cosmoprof, IDS, CIDPEX, CPHI, Vivatech)
- Conferences, congresses, conventions, symposiums
- Seminars, webinars, workshops, masterclasses
- Forums, summits, panels
- Business meeting invitations (face-to-face, including B2B partner meetings)
- Networking events, gatherings, receptions
- Award ceremonies, presentations
- Save-the-date notices, registration invitations for any of the above

NOT events:
- Order confirmations, payment receipts
- Customer complaints, support requests
- Marketing newsletters with no event invitation
- Spam, automated notifications
- Internal company announcements (unless inviting to a specific meeting/event)

Read the FULL email content carefully — context matters more than keywords.
A vague invitation to "присоединиться к нам в Москве 15 мая" is an EVENT.

Reply with ONE WORD ONLY: EVENT or NOT"""

ANALYSIS_SYSTEM = """\
You are an assistant for Das Experten (German oral care brand).
Analyze this event-related email in 3-4 sentences IN RUSSIAN:
- Что за мероприятие, когда и где
- Чего хочет отправитель (приглашение / партнёрство / спонсорство / выступление / другое)
- Релевантность для Das Experten (Высокая / Средняя / Низкая) и почему"""

DRAFT_SYSTEM = """\
You are a business writer for Das Experten oral care brand.
Write a SHORT 3-4 sentence reply to this event email.
Be polite and direct. If interested — express interest, ask the key question.
If not relevant — politely decline.
Match the sender's language. Body only, no subject line."""

# ── Helpers ───────────────────────────────────────────────────────────────────

def f(t, *keys):
    for k in keys:
        v = t.get(k)
        if v: return v
    return ""

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Searching last 60 days, up to {MAX_THREADS} threads…")

    try:
        res = emailer({"action": "find", "query": SEARCH_QUERY, "max_results": MAX_THREADS})
    except Exception as e:
        print(f"FATAL find error: {e}", file=sys.stderr)
        write_summary(f"## Ошибка\n\n`{e}`")
        sys.exit(1)

    threads = res.get("threads") or []
    print(f"Got {len(threads)} threads to scan.")
    if not threads:
        write_summary("## Мероприятия\n\nПисем за 60 дней не найдено.")
        return

    # Read body + classify every thread
    events = []
    for i, t in enumerate(threads):
        subj = f(t, 'subject')[:70]
        sender = f(t, 'last_message_from', 'from')[:50]
        body = get_body(t.get("thread_id", ""))
        ctx  = (
            f"From: {sender}\n"
            f"Subject: {f(t, 'subject')}\n\n"
            f"{body}"
        )
        try:
            verdict = claude(FILTER_SYSTEM, ctx, MODEL_FILTER, 5).strip().upper()
        except Exception as e:
            print(f"  filter error {i}: {e}", file=sys.stderr)
            verdict = "NOT"
        is_event = "EVENT" in verdict
        if is_event:
            t["_body"] = body
            events.append(t)
        mark = "✓" if is_event else "·"
        print(f"  {i+1:2d}/{len(threads)} {mark} {verdict[:5]:<5} | {sender[:30]:<30} | {subj}")

    print(f"\nFound {len(events)} event-related emails.")

    if not events:
        write_summary(
            f"## Мероприятия\n\n"
            f"Просмотрено **{len(threads)}** писем за 60 дней.\n"
            f"Ни одно не оказалось про мероприятие/выставку/конференцию."
        )
        return

    # Detailed analysis + draft per event
    results = []
    for i, t in enumerate(events):
        subj = f(t, 'subject')[:60]
        print(f"  analyze {i+1}/{len(events)}: {subj}")
        ctx = (
            f"From: {f(t, 'last_message_from', 'from')}\n"
            f"Subject: {f(t, 'subject')}\n\n"
            f"{t.get('_body', '')}"
        )
        try:    analysis = claude(ANALYSIS_SYSTEM, ctx, MODEL_DETAIL, 250)
        except Exception as e: analysis = f"(ошибка анализа: {e})"
        try:    draft = claude(DRAFT_SYSTEM, ctx, MODEL_DETAIL, 200)
        except Exception as e: draft = f"(ошибка черновика: {e})"
        results.append({
            "thread_id": t.get("thread_id", ""),
            "subject":   f(t, "subject") or "(без темы)",
            "from":      f(t, "last_message_from", "from") or "?",
            "analysis":  analysis,
            "draft":     draft,
        })

    # Render markdown
    lines = [
        f"# Мероприятия — {datetime.now().strftime('%d.%m.%Y')}",
        f"\nПросмотрено писем: **{len(threads)}**",
        f"Найдено приглашений на мероприятия: **{len(results)}**\n",
        "---",
    ]
    for n, r in enumerate(results, 1):
        lines += [
            f"\n## {n}. {r['subject']}",
            f"**От:** {r['from']}",
            f"**Thread ID:** `{r['thread_id']}`\n",
            "### Анализ", r["analysis"], "",
            "### Черновик ответа", r["draft"], "",
            "---",
        ]
    md = "\n".join(lines)
    write_summary(md)
    os.makedirs("results", exist_ok=True)
    with open("results/exhibitions.md", "w", encoding="utf-8") as fp:
        fp.write(md)
    print(f"\nDone. {len(results)} events → results/exhibitions.md")

def write_summary(text):
    p = os.environ.get("GITHUB_STEP_SUMMARY")
    if p:
        with open(p, "w", encoding="utf-8") as fp:
            fp.write(text)

if __name__ == "__main__":
    main()
