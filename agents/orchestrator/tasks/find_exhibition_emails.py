"""
Task: Find all event-related emails from the last 2 months.
Events = exhibitions, conferences, seminars, forums, summits, meetings,
         congresses, workshops, presentations, invitations.

Two-stage: broad keyword search → Claude filter → analysis + draft.
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

# Wide keyword net — Russian / English / German / Italian / Spanish / French
SEARCH_QUERY = (
    "newer_than:60d ("
    # Russian
    "выставка OR выставки OR конференция OR конференции OR семинар OR "
    "форум OR форумы OR саммит OR конгресс OR мероприятие OR мероприятия OR "
    "встреча OR собрание OR приглашение OR регистрация OR \"save the date\" OR "
    # English
    "exhibition OR expo OR \"trade show\" OR \"trade fair\" OR conference OR "
    "seminar OR summit OR forum OR congress OR convention OR symposium OR "
    "workshop OR meeting OR invitation OR webinar OR event OR "
    # German
    "messe OR tagung OR konferenz OR kongress OR einladung OR seminar OR "
    # Italian / Spanish / French
    "fiera OR convegno OR feria OR salon OR colloque"
    ")"
)

MODEL_FILTER  = "claude-haiku-4-5-20251001"
MODEL_DETAIL  = "claude-sonnet-4-6"

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
        return (msg.get("body_plain") or msg.get("snippet") or "")[:1000]
    except Exception:
        return ""

# ── Claude ────────────────────────────────────────────────────────────────────

def claude(system, user, model=MODEL_DETAIL, max_tokens=300):
    url  = "https://api.anthropic.com/v1/messages"
    body = json.dumps({
        "model": model,
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

# ── Prompts ───────────────────────────────────────────────────────────────────

FILTER_SYSTEM = """\
You decide if an email is about a business event Das Experten (an oral care brand)
might attend or consider attending.

EVENT = exhibition, trade show, expo, fair, conference, seminar, forum, summit,
         congress, convention, symposium, workshop, meeting invitation, webinar,
         business gathering, networking event, presentation invitation.

Reply with ONE WORD ONLY:
EVENT — yes, this is about a business event/meeting/conference/exhibition
NOT   — no, it's about something else (orders, marketing newsletters, payments, support, spam)"""

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

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("Searching for event-related emails (last 60 days)...")

    all_threads = []
    seen = set()
    for name, addr in INBOXES.items():
        try:
            res = emailer({"action": "find", "query": SEARCH_QUERY,
                           "inbox": addr, "max_results": 100})
            for t in (res.get("threads") or []):
                if t.get("thread_id") not in seen:
                    t["_inbox"] = addr
                    all_threads.append(t)
                    seen.add(t["thread_id"])
        except Exception as e:
            print(f"  WARN: find {addr}: {e}", file=sys.stderr)

    print(f"Keyword stage: {len(all_threads)} candidates.")

    if not all_threads:
        write_summary("## Мероприятия\n\nПисем по теме за последние 60 дней не найдено.")
        return

    events = []
    for i, t in enumerate(all_threads):
        snippet = (t.get("snippet") or "")[:300]
        ctx = f"From: {t.get('from','')}\nSubject: {t.get('subject','')}\n{snippet}"
        try:
            verdict = claude(FILTER_SYSTEM, ctx, MODEL_FILTER, 5).strip().upper()
        except Exception as e:
            print(f"  filter error {i}: {e}", file=sys.stderr)
            verdict = "EVENT"
        if "EVENT" in verdict:
            events.append(t)
        print(f"  filter {i+1}/{len(all_threads)}: {verdict[:5]} — {(t.get('subject','') or '')[:60]}")

    print(f"Filter stage: {len(events)} actual events.")

    if not events:
        write_summary(
            f"## Мероприятия\n\nПо ключевым словам найдено {len(all_threads)} писем, "
            f"но Claude отфильтровал — реальных приглашений на мероприятия нет."
        )
        return

    results = []
    for i, t in enumerate(events):
        print(f"  analyze {i+1}/{len(events)}: {(t.get('subject','') or '')[:60]}")
        body  = get_body(t["thread_id"])
        ctx   = (f"From: {t.get('from','')}\n"
                 f"Subject: {t.get('subject','')}\n"
                 f"Inbox: {t['_inbox']}\n\n{body}")
        try:    analysis = claude(ANALYSIS_SYSTEM, ctx, MODEL_DETAIL, 200)
        except Exception as e: analysis = f"(ошибка анализа: {e})"
        try:    draft = claude(DRAFT_SYSTEM, ctx, MODEL_DETAIL, 200)
        except Exception as e: draft = f"(ошибка черновика: {e})"
        results.append({
            "thread_id": t["thread_id"],
            "inbox":     t["_inbox"],
            "subject":   t.get("subject", "(без темы)"),
            "from":      t.get("from", "?"),
            "analysis":  analysis,
            "draft":     draft,
        })

    lines = [
        f"# Мероприятия — {datetime.now().strftime('%d.%m.%Y')}",
        f"\nКандидатов по ключевым словам: **{len(all_threads)}**",
        f"После фильтра Claude: **{len(results)} реальных приглашений**\n",
        "---",
    ]
    for n, r in enumerate(results, 1):
        lines += [
            f"\n## {n}. {r['subject']}",
            f"**От:** {r['from']}  |  **Inbox:** {r['inbox']}",
            f"**Thread ID:** `{r['thread_id']}`\n",
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
    os.makedirs("results", exist_ok=True)
    with open("results/exhibitions.md", "w", encoding="utf-8") as f:
        f.write(md)
    print(f"\nDone. {len(results)} events → results/exhibitions.md")

def write_summary(text):
    f = os.environ.get("GITHUB_STEP_SUMMARY")
    if f:
        with open(f, "w", encoding="utf-8") as fp:
            fp.write(text)

if __name__ == "__main__":
    main()
