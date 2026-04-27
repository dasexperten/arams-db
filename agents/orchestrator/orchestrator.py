"""
Das Experten Orchestrator — GitHub Actions runner.

Reads unread email from all inboxes via the emailer API,
classifies with Claude, drafts replies for urgent/important threads,
and sends a Telegram summary with the drafts.

No server, no webhook, no Apps Script. Runs on schedule or manually.
"""

import os, json, re, sys
import urllib.request, urllib.parse

# ── Config ────────────────────────────────────────────────────────────────────

INBOXES = {
    "eurasia":   "eurasia@dasexperten.de",
    "emea":      "emea@dasexperten.de",
    "export":    "export@dasexperten.de",
    "marketing": "marketing@dasexperten.de",
}
LOOKBACK_H  = 24
MAX_DRAFTS  = 5
MODEL_FAST  = "claude-haiku-4-5-20251001"
MODEL_MAIN  = "claude-sonnet-4-6"

# ── Env ───────────────────────────────────────────────────────────────────────

def env(key):
    v = os.environ.get(key, "")
    if not v:
        raise RuntimeError(f"Missing env var: {key}")
    return v

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def post_json(url, data):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(url, data=body,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def get_json(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read())

# ── Emailer API ───────────────────────────────────────────────────────────────

def emailer(payload):
    url  = env("EMAILER_EXEC_URL")
    resp = post_json(url, payload)
    if resp.get("error"):
        raise RuntimeError(resp["error"])
    return resp

# ── Claude API ────────────────────────────────────────────────────────────────

def claude(system, user, model=MODEL_FAST, max_tokens=10):
    url  = "https://api.anthropic.com/v1/messages"
    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type":      "application/json",
        "x-api-key":         env("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    if "error" in data:
        raise RuntimeError(data["error"]["message"])
    return data["content"][0]["text"]

# ── Telegram ──────────────────────────────────────────────────────────────────

def tg(text):
    token  = env("TELEGRAM_BOT_TOKEN")
    chat   = env("ARAM_TELEGRAM_CHAT_ID")
    url    = f"https://api.telegram.org/bot{token}/sendMessage"
    # Telegram HTML max 4096 chars
    text   = text[:4090]
    post_json(url, {"chat_id": chat, "text": text, "parse_mode": "HTML"})

# ── Email processing ──────────────────────────────────────────────────────────

CLASSIFY_SYSTEM = """\
Classify email urgency. Reply with ONE word only: URGENT, HIGH, MEDIUM, LOW, or SKIP.
URGENT = needs action today (payment, complaint, contract termination, legal).
HIGH   = important business email or B2B partner message.
MEDIUM = general customer inquiry.
LOW    = newsletter, automated notification, marketing.
SKIP   = spam, unsubscribe, read receipts."""

DRAFT_SYSTEM = """\
You are a professional customer service writer for Das Experten oral care brand.
Write a concise, helpful reply email.
Rules: match the customer's language, never fabricate product claims,
no subject line — body text only."""

def classify(thread):
    snippet = (thread.get("snippet") or "")[:300]
    prompt  = f"From: {thread.get('from','')}\nSubject: {thread.get('subject','')}\n{snippet}"
    try:
        label = claude(CLASSIFY_SYSTEM, prompt, MODEL_FAST, 5).strip().upper()
        label = re.sub(r"\W", "", label)
        return label if label in ("URGENT","HIGH","MEDIUM","LOW","SKIP") else "MEDIUM"
    except Exception:
        return "MEDIUM"

def get_body(thread):
    try:
        res = emailer({"action": "get_thread", "thread_id": thread["thread_id"]})
        msg = (res.get("messages") or [{}])[0]
        return (msg.get("body_plain") or msg.get("snippet") or "")[:500]
    except Exception:
        return thread.get("snippet") or ""

def make_draft(thread, body):
    prompt = (f"From: {thread.get('from','')}\n"
              f"Subject: {thread.get('subject','')}\n"
              f"Inbox: {thread.get('_inbox','')}\n\n{body}")
    try:
        return claude(DRAFT_SYSTEM, prompt, MODEL_MAIN, 250)
    except Exception:
        return "(Черновик недоступен — напиши вручную)"

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    tg("📬 Сканирую inbox…")

    # 1. Fetch unread threads
    threads = []
    for name, addr in INBOXES.items():
        try:
            res = emailer({"action": "find",
                           "query":  f"is:unread newer_than:{LOOKBACK_H}h",
                           "inbox":  addr,
                           "max_results": 30})
            for t in (res.get("threads") or []):
                t["_inbox"] = addr
            threads.extend(res.get("threads") or [])
        except Exception as e:
            print(f"find failed {addr}: {e}", file=sys.stderr)

    if not threads:
        tg("✅ Новых писем нет.")
        return

    # 2. Classify
    counts = {}
    important = []
    for t in threads:
        label = classify(t)
        t["_urgency"] = label
        counts[label] = counts.get(label, 0) + 1
        if label in ("URGENT", "HIGH") and len(important) < MAX_DRAFTS:
            important.append(t)

    # 3. Summary
    summary = (
        f"📊 <b>Inbox — {len(threads)} писем</b>\n"
        + (f"🔴 Срочные: {counts.get('URGENT',0)}\n"    if counts.get('URGENT') else "")
        + (f"🟠 Важные: {counts.get('HIGH',0)}\n"       if counts.get('HIGH')   else "")
        + (f"🟡 Обычные: {counts.get('MEDIUM',0)}\n"    if counts.get('MEDIUM') else "")
        + (f"⚪ Уведомления: {counts.get('LOW',0)}\n"   if counts.get('LOW')    else "")
    )
    tg(summary)

    if not important:
        tg("Срочных писем нет.")
        return

    # 4. Draft and send each important email to Telegram
    tg(f"✍️ Готовлю черновики для {len(important)} письма…")
    for email in important:
        body  = get_body(email)
        draft = make_draft(email, body)
        icon  = "🔴" if email["_urgency"] == "URGENT" else "🟠"
        msg   = (
            f"{icon} <b>{email.get('subject','(без темы)')[:100]}</b>\n"
            f"От: {email.get('from','?')[:80]}\n\n"
            f"<b>Черновик ответа:</b>\n{draft[:600]}"
        )
        tg(msg)

    tg("✅ Готово. Черновики выше — скопируй и отправь из Gmail.")

if __name__ == "__main__":
    main()
