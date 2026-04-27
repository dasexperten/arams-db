"""
Task: Find all event-related emails from the last 2 months.
Events = exhibitions, conferences, seminars, forums, summits, meetings,
         congresses, workshops, presentations, invitations.

Two-stage: broad keyword search → Claude filter → analysis + draft.
Output: GitHub Actions step summary + results/exhibitions.md
"""

import os, sys, json, urllib.request
from datetime import datetime

# Wide keyword net — Russian / English / German / Italian / Spanish / French
SEARCH_QUERY = (
    "newer_than:60d ("
    "выставка OR выставки OR конференция OR конференции OR семинар OR "
    "форум OR форумы OR саммит OR конгресс OR мероприятие OR мероприятия OR "
    "встреча OR собрание OR приглашение OR регистрация OR \"save the date\" OR "
    "exhibition OR expo OR \"trade show\" OR \"trade fair\" OR conference OR "
    "seminar OR summit OR forum OR congress OR convention OR symposium OR "
    "workshop OR meeting OR invitation OR webinar OR event OR "
    "messe OR tagung OR konferenz OR kongress OR einladung OR "
    "fiera OR convegno OR feria OR salon OR colloque"
    ")"
)

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
        return (m.get("body_plain") or m.get("plain_body") or m.get("snippet") or "")[:1000]
    except Exception:
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
You decide if an email is about a business event Das Experten (an oral care brand)
might attend or consider attending.

EVENT = exhibition, trade show, expo, fair, conference, seminar, forum, summit,
        congress, convention, symposium, workshop, meeting invitation, webinar,
        business gathering, networking event, presentation invitation.

Reply with ONE WORD ONLY:
EVENT — yes
NOT   — no (orders, marketing newsletters, payments, support, spam)"""

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

def thread_field(t, *keys):
    """Read first non-empty value across alternative key names."""
    for k in keys:
        v = t.get(k)
        if v:
            return v
    return ""

def make_ctx(t, body=""):
    return (
        f"From: {thread_field(t, 'last_message_from', 'from')}\n"
        f"Subject: {thread_field(t, 'subject')}\n"
        f"Snippet: {thread_field(t, 'last_message_snippet', 'snippet')}\n"
        + (f"\n{body}" if body else "")
    )

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("Searching for event-related emails (last 60 days)…")
    print(f"Query length: {len(SEARCH_QUERY)} chars")

    # 1. Single Gmail search (emailer ignores inbox param — searches all mail)
    try:
        res = emailer({"action": "find", "query": SEARCH_QUERY, "max_results": 50})
    except Exception as e:
        print(f"FATAL find error: {e}", file=sys.stderr)
        write_summary(f"## Ошибка\n\nemailer.find упал: `{e}`")
        sys.exit(1)

    threads = res.get("threads") or []
    print(f"Keyword stage: {len(threads)} candidates.")
    if threads:
        print("Sample first thread keys:", list(threads[0].keys()))

    if not threads:
        write_summary(
            "## Мероприятия\n\n"
            f"По ключевым словам ничего не найдено.\n\n"
            f"Запрос: `{SEARCH_QUERY[:200]}…`"
        )
        return

    # 2. Claude filter — only true event emails pass
    events = []
    for i, t in enumerate(threads):
        ctx = make_ctx(t)
        try:
            verdict = claude(FILTER_SYSTEM, ctx, MODEL_FILTER, 5).strip().upper()
        except Exception as e:
            print(f"  filter error {i}: {e}", file=sys.stderr)
            verdict = "EVENT"
        if "EVENT" in verdict:
            events.append(t)
        subj = thread_field(t, 'subject')[:60]
        print(f"  {i+1}/{len(threads)}: {verdict[:5]:<5} — {subj}")

    print(f"After filter: {len(events)} real events.")

    if not events:
        write_summary(
            f"## Мероприятия\n\nКандидатов: **{len(threads)}**\n\n"
            "Claude не признал ни одно из них настоящим приглашением на мероприятие.\n"
            "Возможно, выборка состоит из информационных писем без действий."
        )
        return

    # 3. Analysis + draft per event
    results = []
    for i, t in enumerate(events):
        subj = thread_field(t, 'subject')[:60]
        print(f"  analyze {i+1}/{len(events)}: {subj}")
        body = get_body(t.get("thread_id", ""))
        ctx  = make_ctx(t, body)
        try:    analysis = claude(ANALYSIS_SYSTEM, ctx, MODEL_DETAIL, 250)
        except Exception as e: analysis = f"(ошибка: {e})"
        try:    draft = claude(DRAFT_SYSTEM, ctx, MODEL_DETAIL, 200)
        except Exception as e: draft = f"(ошибка: {e})"
        results.append({
            "thread_id": t.get("thread_id", ""),
            "subject":   thread_field(t, "subject") or "(без темы)",
            "from":      thread_field(t, "last_message_from", "from") or "?",
            "analysis":  analysis,
            "draft":     draft,
        })

    # 4. Render markdown
    lines = [
        f"# Мероприятия — {datetime.now().strftime('%d.%m.%Y')}",
        f"\nКандидатов по ключевым словам: **{len(threads)}**",
        f"После фильтра Claude: **{len(results)} реальных приглашений**\n",
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
