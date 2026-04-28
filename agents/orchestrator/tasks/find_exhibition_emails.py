"""
Task: Find all event-related emails from the last 2 months.
Events = exhibitions, conferences, seminars, forums, summits, meetings,
         congresses, workshops, presentations, invitations.

Three-stage pipeline:
  1. Regex pre-filter  — free, filters obvious non-events (invoices, receipts, noreply senders)
  2. Claude Haiku      — reads email body, decides EVENT vs NOT
  3. Claude Sonnet     — full analysis in Russian + draft reply

Pagination: weekly date windows (9 × up to 50 = ~450 unique threads) to
bypass the emailer's hard cap of 50 results per query.

Output: GitHub Actions step summary + results/exhibitions.md
Telegram: one message per confirmed event.
"""

import os, sys, json, re, urllib.request
from datetime import datetime, timedelta, date

LOOKBACK_DAYS = 60
WINDOW_DAYS   = 7
PER_WINDOW    = 50

# Base query: exclude sent/trash/spam/promo/social noise
BASE_QUERY = "-in:sent -in:trash -in:spam -category:promotions -category:social -category:forums"

MODEL_FILTER = "claude-haiku-4-5-20251001"
MODEL_DETAIL = "claude-sonnet-4-6"

# ── Regex pre-filters (stage 1 — free) ───────────────────────────────────────

JUNK_SENDER_RE = re.compile(
    r"noreply|no-reply|donotreply|do-not-reply|billing@|support@|"
    r"postmaster@|mailer-daemon|notifications?@|info@|newsletter@|"
    r"unsubscribe|автоответ|автоуведомление",
    re.IGNORECASE,
)

JUNK_SUBJECT_RE = re.compile(
    r"\binvoice\b|\breceipt\b|\bpassword\b|\bverif|\bconfirm your|\b"
    r"order #|\btracking|\bshipment|\bdelivery|\bsupport ticket|\b"
    r"счёт\b|квитанци|подтвердите|сбросить пароль|ваш заказ|отслеживани",
    re.IGNORECASE,
)

def is_junk_by_regex(thread):
    sender  = f(thread, "last_message_from", "from")
    subject = f(thread, "subject")
    return bool(JUNK_SENDER_RE.search(sender) or JUNK_SUBJECT_RE.search(subject))

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

def fetch_all_threads():
    """Weekly windows over last LOOKBACK_DAYS days — bypasses 50-result cap."""
    today     = datetime.utcnow().date()
    seen      = {}
    all_threads = []
    for w in range(0, LOOKBACK_DAYS, WINDOW_DAYS):
        end_d   = today - timedelta(days=w)
        start_d = today - timedelta(days=w + WINDOW_DAYS)
        query   = f"{BASE_QUERY} after:{start_d.isoformat()} before:{end_d.isoformat()}"
        try:
            res = emailer({"action": "find", "query": query, "max_results": PER_WINDOW})
            for t in (res.get("threads") or []):
                tid = t.get("thread_id")
                if tid and tid not in seen:
                    seen[tid] = True
                    all_threads.append(t)
        except Exception as e:
            print(f"  WARN window {start_d}–{end_d}: {e}", file=sys.stderr)
    return all_threads

def get_body(thread_id):
    try:
        res = emailer({"action": "get_thread", "thread_id": thread_id})
        msg = (res.get("messages") or [{}])[0]
        return (msg.get("body_plain") or msg.get("snippet") or "")[:1500]
    except Exception:
        return ""

# ── Field helper (emailer returns last_message_from, not from) ────────────────

def f(t, *keys):
    for k in keys:
        v = t.get(k)
        if v:
            return v
    return ""

# ── Claude ────────────────────────────────────────────────────────────────────

def claude(system, user, model=MODEL_DETAIL, max_tokens=300):
    url  = "https://api.anthropic.com/v1/messages"
    body = json.dumps({
        "model":      model,
        "max_tokens": max_tokens,
        "system":     system,
        "messages":   [{"role": "user", "content": user}],
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

NOT   = order, payment, invoice, marketing newsletter, password reset, shipping
        notification, support ticket, automated alert, spam.

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

# ── Telegram ──────────────────────────────────────────────────────────────────

def tg(text):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat  = os.environ.get("ARAM_TELEGRAM_CHAT_ID", "")
    if not token or not chat:
        return
    text = text[:4090]
    try:
        post_json(
            f"https://api.telegram.org/bot{token}/sendMessage",
            {"chat_id": chat, "text": text, "parse_mode": "HTML"},
        )
    except Exception as e:
        print(f"  TG send error: {e}", file=sys.stderr)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Scanning last {LOOKBACK_DAYS} days via {LOOKBACK_DAYS // WINDOW_DAYS} weekly windows…")

    # Stage 1 — fetch all threads (weekly windows)
    all_threads = fetch_all_threads()
    print(f"Fetched {len(all_threads)} unique threads total.")

    if not all_threads:
        msg = "## Мероприятия\n\nПисем за последние 60 дней не найдено."
        write_summary(msg)
        tg("📭 Выставки/конференции: писем за 60 дней не найдено.")
        return

    # Stage 1b — regex pre-filter (free, no API)
    candidates = [t for t in all_threads if not is_junk_by_regex(t)]
    junk_count = len(all_threads) - len(candidates)
    print(f"After regex pre-filter: {len(candidates)} candidates ({junk_count} junk skipped).")

    # Stage 2 — Haiku body filter
    events = []
    for i, t in enumerate(candidates):
        body    = get_body(t["thread_id"])
        sender  = f(t, "last_message_from", "from")
        subject = f(t, "subject")
        snippet = f(t, "last_message_snippet", "snippet")
        ctx = (f"From: {sender}\nSubject: {subject}\n\n"
               f"{body or snippet}")[:1200]
        try:
            verdict = claude(FILTER_SYSTEM, ctx, MODEL_FILTER, 5).upper()
        except Exception as e:
            print(f"  filter error [{i+1}]: {e}", file=sys.stderr)
            verdict = "EVENT"  # err on side of inclusion
        label = "EVENT" if "EVENT" in verdict else "NOT"
        print(f"  [{i+1}/{len(candidates)}] {label} — {subject[:70]}")
        if label == "EVENT":
            t["_body"] = body
            events.append(t)

    print(f"Haiku filter: {len(events)} actual events confirmed.")

    if not events:
        msg = (
            f"## Мероприятия\n\n"
            f"Кандидатов: **{len(all_threads)}** → после фильтра регулярок: **{len(candidates)}** "
            f"→ после Claude: **0 реальных приглашений**."
        )
        write_summary(msg)
        tg(f"📭 Выставки/конференции: {len(all_threads)} писем, ни одного реального приглашения.")
        return

    tg(f"📋 Найдено <b>{len(events)}</b> мероприятий из {len(all_threads)} писем. Анализирую…")

    # Stage 3 — Sonnet analysis + draft per event
    results = []
    for i, t in enumerate(events):
        sender  = f(t, "last_message_from", "from")
        subject = f(t, "subject")
        body    = t.get("_body", "")
        print(f"  analyze [{i+1}/{len(events)}]: {subject[:70]}")
        ctx = f"From: {sender}\nSubject: {subject}\n\n{body}"
        try:
            analysis = claude(ANALYSIS_SYSTEM, ctx, MODEL_DETAIL, 250)
        except Exception as e:
            analysis = f"(ошибка анализа: {e})"
        try:
            draft = claude(DRAFT_SYSTEM, ctx, MODEL_DETAIL, 200)
        except Exception as e:
            draft = f"(ошибка черновика: {e})"

        results.append({
            "thread_id": t["thread_id"],
            "subject":   subject or "(без темы)",
            "from":      sender or "?",
            "analysis":  analysis,
            "draft":     draft,
        })

        # Telegram: one message per event
        tg_msg = (
            f"📅 <b>{subject[:100]}</b>\n"
            f"От: {sender[:80]}\n\n"
            f"<b>Анализ:</b>\n{analysis[:600]}\n\n"
            f"<b>Черновик ответа:</b>\n{draft[:400]}"
        )
        tg(tg_msg)

    # Build markdown
    lines = [
        f"# Мероприятия — {datetime.now().strftime('%d.%m.%Y')}",
        f"\nВсего писем: **{len(all_threads)}** | После фильтров: **{len(results)}** реальных приглашений\n",
        "---",
    ]
    for n, r in enumerate(results, 1):
        lines += [
            f"\n## {n}. {r['subject']}",
            f"**От:** {r['from']}",
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
    with open("results/exhibitions.md", "w", encoding="utf-8") as fh:
        fh.write(md)
    print(f"\nDone. {len(results)} events → results/exhibitions.md")
    tg(f"✅ Готово. {len(results)} мероприятий — полный отчёт выше.")


def write_summary(text):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)


if __name__ == "__main__":
    main()
