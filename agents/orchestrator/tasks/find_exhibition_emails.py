"""
Task: Find all event-related emails from the last 2 months.
Pipeline:
  1. fetch all threads from period (weekly windows, dedupe)
  2. cheap regex pre-filter — skip obvious junk (no API calls)
  3. fetch body + Claude Haiku filter — keep only event-related
  4. Claude Sonnet — analysis + draft per event

Output: GitHub Actions step summary + results/exhibitions.md
"""

import os, sys, json, re, urllib.request
from datetime import datetime, timedelta

LOOKBACK_DAYS = 60
WINDOW_DAYS   = 7
PER_WINDOW    = 50

BASE_QUERY = "-in:sent -in:trash -in:spam -category:promotions -category:social -category:forums"

MODEL_FILTER = "claude-haiku-4-5-20251001"
MODEL_DETAIL = "claude-sonnet-4-6"

# ── Regex pre-filter (no API calls) ──────────────────────────────────────────

JUNK_SENDER_PATTERNS = [
    r'\bnoreply\b', r'\bno-reply\b', r'\bdonotreply\b', r'\bdo-not-reply\b',
    r'\bnotifications?@', r'\bnotify@', r'\bmailer-daemon\b', r'\bpostmaster@',
    r'\bauto-?reply\b', r'\bautoresponder\b', r'\bdelivery-noreply\b',
    r'\bbilling@', r'\binvoicing@', r'\baccounts@', r'\bpayments?@',
    r'\bsupport@', r'\bhelp@', r'\bcustomercare@', r'\bcs@',
    r'\bsystem@', r'\bservice@', r'\bnews@', r'\bnewsletter@',
    r'\bunsubscribe@', r'\bbounce', r'\bdaemon@',
    r'@.*\.amazonses\.com', r'@email\.', r'@mailgun', r'@sendgrid',
    r'@mandrill', r'@sparkpost', r'@postmark',
]

JUNK_SUBJECT_PATTERNS = [
    # English
    r'\binvoice\b', r'\breceipt\b', r'\bpayment confirm', r'\border confirm',
    r'\bshipping confirm', r'\bdelivery (notification|update)', r'\btracking',
    r'\byour order', r'\byour package', r'\byour shipment', r'\byour parcel',
    r'\byour invoice', r'\byour receipt',
    r'\bpassword\b', r'\bverify\b', r'\bverification\b', r'\b2fa\b',
    r'\blogin (alert|attempt)', r'\bsecurity alert', r'\bsign[- ]?in',
    r'\baccount (suspended|locked|blocked)', r'\baccount activity',
    r'\bunsubscribe', r'\bdigest\b', r'\bweekly summary', r'\bmonthly summary',
    r'\bcron job', r'\bbackup',
    # Russian
    r'\bсчёт\b', r'\bсчет\b', r'\bквитанц', r'\bоплат[аы] получ',
    r'\bподтверж.*заказ', r'\bваш заказ', r'\bваше отправление',
    r'\bотправление\b', r'\bтрек.*номер', r'\bдоставк[аи]',
    r'\bпароль\b', r'\bподтвержд.*код', r'\bкод подтверж',
    r'\bвход в аккаунт', r'\bвхода в аккаунт',
    r'\bотписк', r'\bдайджест', r'\bнедельн.*обзор',
    # German
    r'\brechnung\b', r'\bbestellbest', r'\bzahlungsbest',
    r'\blieferbest', r'\bversandbest', r'\bsendungsverfolg',
    r'\bpasswort\b', r'\bbestät.*code',
]

JUNK_SENDER_RE  = re.compile('|'.join(JUNK_SENDER_PATTERNS),  re.IGNORECASE)
JUNK_SUBJECT_RE = re.compile('|'.join(JUNK_SUBJECT_PATTERNS), re.IGNORECASE)

def is_obviously_junk(thread):
    sender = (f(thread, 'last_message_from', 'from') or '').lower()
    subject = (f(thread, 'subject') or '').lower()
    if JUNK_SENDER_RE.search(sender):  return True
    if JUNK_SUBJECT_RE.search(subject): return True
    return False

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
        "https://api.anthropic.com/v1/messages", data=body,
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
- Exhibitions, trade shows, expos, fairs (e.g. Cosmoprof, IDS, CIDPEX, CPHI)
- Conferences, congresses, conventions, symposiums
- Seminars, webinars, workshops, masterclasses
- Forums, summits, panels
- Business meeting invitations (face-to-face, B2B partner meetings)
- Networking events, gatherings, receptions
- Award ceremonies, presentations
- Save-the-date notices, registration invitations

NOT events:
- Order confirmations, payment receipts, invoices
- Customer support requests, complaints
- Marketing newsletters with no event invitation
- Spam, automated notifications

Read the FULL email content carefully — context matters more than keywords.

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

def fetch_all_threads():
    """Paginate by weekly date windows to bypass emailer's 50-result cap."""
    today = datetime.utcnow().date()
    seen, all_threads = {}, []
    for w in range(0, LOOKBACK_DAYS, WINDOW_DAYS):
        end   = today - timedelta(days=w)
        start = today - timedelta(days=w + WINDOW_DAYS)
        query = f"{BASE_QUERY} after:{start.isoformat()} before:{end.isoformat()}"
        print(f"  window {start} → {end}")
        try:
            res = emailer({"action": "find", "query": query, "max_results": PER_WINDOW})
        except Exception as e:
            print(f"    error: {e}", file=sys.stderr)
            continue
        threads = res.get("threads") or []
        new = 0
        for t in threads:
            tid = t.get("thread_id")
            if tid and tid not in seen:
                seen[tid] = True
                all_threads.append(t)
                new += 1
        print(f"    {len(threads)} threads, {new} new (total {len(all_threads)})")
    return all_threads

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Scanning last {LOOKBACK_DAYS} days in {WINDOW_DAYS}-day windows…")

    threads = fetch_all_threads()
    total = len(threads)
    print(f"\nFetched: {total} unique threads.")

    if not threads:
        write_summary(f"## Мероприятия\n\nПисем за {LOOKBACK_DAYS} дней не найдено.")
        return

    # 1. Cheap regex pre-filter — skip obvious junk
    candidates = []
    skipped = 0
    for t in threads:
        if is_obviously_junk(t):
            skipped += 1
            continue
        candidates.append(t)
    print(f"Pre-filter: skipped {skipped} obvious junk, {len(candidates)} remain.")

    if not candidates:
        write_summary(
            f"## Мероприятия\n\nИз **{total}** писем все отсеялись как мусор "
            f"(уведомления, счета, подтверждения)."
        )
        return

    # 2. Body + Claude filter
    events = []
    for i, t in enumerate(candidates):
        subj   = f(t, 'subject')[:70]
        sender = f(t, 'last_message_from', 'from')[:40]
        body   = get_body(t.get("thread_id", ""))
        ctx    = f"From: {sender}\nSubject: {f(t, 'subject')}\n\n{body}"
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
        print(f"  {i+1:3d}/{len(candidates)} {mark} {verdict[:5]:<5} | {sender[:30]:<30} | {subj}")

    print(f"\nFound {len(events)} event-related emails.")

    if not events:
        write_summary(
            f"## Мероприятия\n\n"
            f"Всего писем за {LOOKBACK_DAYS} дней: **{total}**\n"
            f"Отсеяно как явный мусор: **{skipped}**\n"
            f"Проверено Claude: **{len(candidates)}**\n\n"
            f"Ни одно не оказалось про мероприятие/выставку/конференцию."
        )
        return

    # 3. Detailed analysis + draft
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
        except Exception as e: analysis = f"(ошибка: {e})"
        try:    draft = claude(DRAFT_SYSTEM, ctx, MODEL_DETAIL, 200)
        except Exception as e: draft = f"(ошибка: {e})"
        results.append({
            "thread_id": t.get("thread_id", ""),
            "subject":   f(t, "subject") or "(без темы)",
            "from":      f(t, "last_message_from", "from") or "?",
            "analysis":  analysis,
            "draft":     draft,
        })

    # 4. Render markdown
    lines = [
        f"# Мероприятия — {datetime.now().strftime('%d.%m.%Y')}",
        f"\nВсего писем за {LOOKBACK_DAYS} дней: **{total}**",
        f"Отсеяно как мусор: **{skipped}**",
        f"Проверено Claude: **{len(candidates)}**",
        f"Найдено приглашений: **{len(results)}**\n",
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
