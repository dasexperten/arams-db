---
name: inbox-triage
description: Scans all 4 Das Experten inboxes (eurasia, emea, export, marketing) for unread messages from the last 24 hours, classifies by urgency, drafts replies for URGENT/HIGH threads, and sends approved drafts after Aram review.
trigger_phrases:
  - утренняя почта
  - разбор inbox
  - triage
  - проверь почту
  - что в почте
  - morning inbox
  - triage inbox
  - check mail
  - inbox review
  - что пришло на почту
recurring:
  schedule: "Mon-Fri 09:00 Europe/Moscow"
  enabled: true
params:
  inboxes:
    type: array
    default: ["eurasia", "emea", "export", "marketing"]
    extractable: true
    description: "Specific inboxes to check. 'triage emea inbox' → inboxes: [emea]"
  lookback_hours:
    type: integer
    default: 24
    description: "How many hours back to search for unread messages"
  max_drafts:
    type: integer
    default: 10
    description: "Max drafts to generate per run (cost control)"
escalation_overrides:
  - step: "send_all_high_drafts"
    always_require_approval: true
total_steps: 10
---

# inbox-triage — Daily Inbox Triage Workflow

## Overview

Scans all 4 inboxes (or a specified subset) for unread messages from the last 24 hours.
Classifies each thread by urgency. Drafts replies for URGENT and HIGH threads using personizer.
Applies all mandatory gates. Sends Telegram summary to Aram. Sends approved drafts.

Can run on a schedule (09:00 Mon–Fri Moscow time) or on-demand.

---

## Step definitions

### Step 1: find_emails

**Type:** tool_call (read-only)
**Skill/tool:** emailer action=find
**Per inbox in `params.inboxes`:** send one `find` request with:
```json
{
  "action": "find",
  "query": "is:unread newer_than:<lookback_hours>h",
  "inbox": "<inbox_address>",
  "max_results": 25
}
```
**Output:** `data.raw_threads` — array of thread summaries per inbox
**Gate:** none (read-only)
**Telegram update:** "Step 1/10 — Сканирую 4 inbox..." (no buttons)
**On empty result for all inboxes:** send completion summary "Новых писем нет" and COMPLETE.

---

### Step 2: get_thread_context

**Type:** tool_call (read-only)
**Skill/tool:** emailer action=get_thread
**For each thread in `data.raw_threads`:** call get_thread to retrieve full history.
**Output:** `data.threads_with_context` — threads with full message history
**Gate:** none
**Telegram update:** "Step 2/10 — Загружаю контекст <N> тредов..."

---

### Step 3: classify_urgency

**Type:** skill_call
**Skill:** internal classification (no external LLM call for this step)

Apply urgency rules to each thread based on:

| Signal | Urgency |
|---|---|
| Subject contains "URGENT", "срочно", "ASAP", "DRINGEND", "عاجل" | URGENT |
| Order confirmation, payment request, customs clearance | URGENT |
| Complaint, return request, "habe ein Problem", "problema" | HIGH |
| Product question with purchase intent | HIGH |
| General product inquiry, existing customer follow-up | MEDIUM |
| Newsletter, marketing email, automated notification | LOW |
| Suspected spam (no body, unrecognized domain pattern) | SKIP |

Additional rules:
- Emails from contacts skill (B2B counterparties) → always minimum HIGH
- Escalation keywords ("хочу руководителя", "speak to manager", "Beschwerde") → URGENT
- Repeated unanswered thread (3rd email without reply detected in get_thread) → +1 urgency level

**Output:** `data.classified_threads`:
```json
{
  "URGENT": [{"thread_id": "...", "from": "...", "subject": "...", "inbox": "...", "snippet": "..."}],
  "HIGH":   [...],
  "MEDIUM": [...],
  "LOW":    [...],
  "SKIP":   [...]
}
```

**Gate:** none at this step (classification only)
**Telegram update:** "Step 3/10 — Классифицировано <N> писем: <U> URGENT, <H> HIGH, <M> MEDIUM, <L> LOW"

---

### Step 4: detect_language_and_routing

**Type:** skill_call
**For each URGENT and HIGH thread:**
1. Detect language of sender's message (first 500 chars of latest message body)
2. Determine sub-mode from inbox (eurasia → B-RU, emea → B-EMEA, etc.)
3. Look up sender email in contacts skill → if found, Mode A (Aram); else Mode B
4. Apply Virtual_staff.md routing to pick specific persona

**Output:** `data.thread_routing`:
```json
{
  "<thread_id>": {
    "mode": "B",
    "sub_mode": "B-EMEA",
    "language": "de",
    "persona": "Klaus Weber",
    "can_auto_draft": true,
    "routing_blocked": false,
    "routing_block_reason": null
  }
}
```

`can_auto_draft: false` when:
- Language not covered by any persona → needs Aram decision
- Ambiguous mode (Mode A vs B unclear)
- Escalation detected → persona = Татьяна Агеева (special handling)

**Gate:** Signature Routing Gate for any ambiguous routing (HALT if mode unclear)

---

### Step 5: handle_routing_blocks (conditional)

**Type:** user_decision
**Fires only if** any thread has `routing_blocked: true` in `data.thread_routing`.

For each blocked thread, send Type 2 (Multiple Choice) message:
```
🤖 ORCHESTRATOR — Inbox/Route
Step 5/10

Не удаётся автоматически определить отправителя для:
  От: <sender>
  Inbox: <inbox>
  Язык: <language> (не покрыт штатом)
  Тема: <subject>

[URGENT — отвечу сам]  [Klaus (по-английски)]  [Пропустить это письмо]

wf_id: <wf_id>
```

On response: update `data.thread_routing[thread_id]` with Aram's choice.
Threads Aram chose to skip are moved to SKIP bucket.

---

### Step 6: draft_urgent_high

**Type:** skill_call
**Skill:** personizer
**For each thread with `can_auto_draft: true` and urgency URGENT or HIGH** (up to `params.max_drafts` limit):

Construct personizer prompt:
```
Draft a reply from <persona> at Das Experten.
Inbox: <inbox_email>
Sender language: <language>
Conversation type: <support/sales/complaint/escalation/PR>
Thread history:
<thread messages, newest first, max 2000 chars>

Follow Virtual_staff.md tone and signature rules for <persona>.
Apply Conversion Gate (B2C) or Aram style (B2B) as appropriate.
```

**Output:** `data.drafts`:
```json
{
  "<thread_id>": {
    "draft_v1": "...",
    "persona": "Klaus Weber",
    "mode": "B-EMEA",
    "language": "de"
  }
}
```

**Gates applied per draft (in order):**
1. Product Knowledge Gate (if product mentioned in draft)
2. Germany-Mention Check (scan entire draft body)
3. Conversion Gate (B2C drafts only)
4. Signature Routing Gate (verify persona matches routing)

If any gate HALTs for a thread → mark `data.drafts[thread_id].gate_halted: true` and the specific gate.
Halted threads surface in Step 7 for Aram's review.

---

### Step 7: summary_to_aram

**Type:** user_decision (Telegram Type 3 — Approval with options)
**Gate:** none

Compose summary message:

```
🤖 ORCHESTRATOR — Inbox/Review
Step 7/10

За последние 24ч. найдено <total> писем в 4 inbox.
  🔴 URGENT: <U> (<list of subjects, max 3>)
  🟠 HIGH:   <H>
  🟡 MEDIUM: <M>
  ⚪ LOW:    <L> (будут помечены прочитанными)
  ⏭ ПРОПУЩЕНО: <S>

Черновики готовы: <drafted> из <draftable>
⚠️ Требуют вашего решения (gate): <halted>

[Утвердить все HIGH/URGENT]  [Просмотреть по одному]  [Пропустить всё]

wf_id: <wf_id>
```

If gate-halted threads exist: add per-thread gate resolution before summary.
Each gate HALT sent as separate Urgent (Type 5) message.
After all gate HALTs resolved: send the main summary.

---

### Step 8: per_thread_review (conditional)

**Type:** user_decision (loop)
**Fires only if** Aram clicked "Просмотреть по одному" in Step 7.

For each draft in URGENT + HIGH order:
Send Type 3 (Approval) message with draft preview:

```
🤖 ORCHESTRATOR — Inbox/Thread
Step 8/10 (письмо <N> из <total>)

📧 От: <sender> (<inbox>)
   Тема: <subject>
   Язык: <language>
   Отправитель: <persona>

Черновик:
"<draft_text, first 800 chars>"

[Отправить]  [Редактировать]  [Пропустить]

wf_id: <wf_id>
```

On "Редактировать": free-text prompt → Aram types corrections → update draft in state → re-apply gates → re-show.
On "Пропустить": mark thread as skipped, move to next.
On "Отправить": queue for bulk send in Step 9.

For bulk approval ("Утвердить все HIGH/URGENT" from Step 7): all non-halted URGENT+HIGH drafts queued directly for Step 9.

---

### Step 9: send_approved_drafts

**Type:** tool_call
**Skill/tool:** emailer action=reply (or send if new thread)

For each draft in the approved queue:
```json
{
  "action": "reply",
  "thread_id": "<thread_id>",
  "body_html": "<formatted draft>",
  "body_plain": "<plain text version>",
  "context": "inbox-triage/<persona>/<inbox>",
  "draft_only": false
}
```

For new threads (no existing thread_id, URGENT outreach):
```json
{
  "action": "send",
  "recipient": "<from-routing>",
  "subject": "Re: <original_subject>",
  "body_html": "...",
  "body_plain": "...",
  "draft_only": false
}
```

**On emailer response:**
- `success: true` → record `data.sent_results[thread_id] = reporter_doc_link`
- `success: false` → record error, continue with remaining drafts (non-fatal per thread)

**Telegram update:** "Step 9/10 — Отправляю <N> писем..."

---

### Step 10: handle_medium_low_and_complete

**Type:** skill_call + tool_call + archive

**MEDIUM threads:**
- For straightforward MEDIUM threads (delivery confirmation, simple product question with verified answer):
  - Generate brief draft via personizer (same gate rules)
  - Add to `data.medium_drafts` — but do NOT send automatically
  - Include in completion summary with note "Medium drafts готовы, отправить?"
  - Aram can trigger a follow-up send via separate Telegram message
- For complex MEDIUM threads: mark as flagged for manual handling

**LOW threads:**
- Call emailer.find + mark as read (Gmail label action)
- Archive newsletters and automated emails
- Flag suspected spam for Aram review

**Archive and log:**
- Compute run metrics (total found, sent, skipped, errors, gate overrides)
- Move instance JSON to `archived/`
- Update Sheet index

**Completion message:**

```
🤖 ORCHESTRATOR — Inbox/Done ✓
Step 10/10

Разобрано писем: <total>
  Отправлено: <sent>
  Черновики MEDIUM: <medium_count> (ждут вашего решения)
  Пропущено/архив: <skipped>
  Ошибок: <errors>

Время: <duration>
Архив: <Drive link>

wf_id: <wf_id>
```

If medium drafts exist, append:
```
Черновики MEDIUM готовы. Отправить?
[Отправить все MEDIUM]  [Позже]
```

---

## Persona routing quick reference

| Inbox | Sender type | Default persona |
|---|---|---|
| eurasia@ | B2C — delivery/payment | Мария Косарева |
| eurasia@ | B2C — complaint/return | Елена Дорохова |
| eurasia@ | B2C — product/upsell | Алексей Штерн |
| eurasia@ | B2C — blogger/media | Ирина Величко |
| eurasia@ | B2C — escalation | Татьяна Агеева |
| emea@ | B2C — German/English | Klaus Weber (support) / Anna Schmidt (sales) |
| emea@ | B2C — Italian | Marco Rossi |
| emea@ | B2C — Spanish (Castilian) | Sofia García |
| emea@ | B2C — Arabic | Ahmed Al-Rashid |
| emea@ | B2C — Unsupported language | HALT → Aram decides |
| export@ | B2C — English | Sarah Mitchell (support) / James Carter (sales) |
| export@ | B2C — Spanish (LatAm) | María Fernández |
| marketing@ | PR — Russian | Ирина Величко |
| marketing@ | PR — International | Catherine Bauer |
| Any inbox | B2B counterparty (in contacts) | Aram Badalyan (Mode A) |

Source of truth for all persona details: `my-tools/Virtual_staff.md`.

---

## Mandatory gates for this workflow

All gates from `reference/consistency-rules.md` apply. This workflow specifically:

1. **Product Knowledge Gate** — Step 6 (drafting). Applied to every draft containing product mention.
2. **Germany-Mention Check** — Step 6 (drafting). Applied to every draft body, all languages.
3. **Conversion Gate** — Step 6 (drafting). Applied to all B2C drafts.
4. **Signature Routing Gate** — Step 4 (routing). Applied when persona cannot be determined.
5. **Contacts Gate** — Step 4 (routing). Applied when sender is B2B and data needed.

Legalizer Gate: not typically triggered by customer emails. Applied if any MEDIUM/HIGH thread contains contract/NDA/legal request.

---

## Telegram message examples (Russian)

### Example: summary with no issues

```
🤖 ORCHESTRATOR — Inbox/Review
Step 7/10

За последние 24ч. найдено 8 писем в 4 inbox.
  🔴 URGENT: 1 (Ahmed — доставка UAE потеряна)
  🟠 HIGH:   3 (2 жалобы eurasia, 1 продукт emea)
  🟡 MEDIUM: 2
  ⚪ LOW:    2 (помечены прочитанными)

Черновики готовы: 4 из 4 пригодных.
Gate: все ✓

[Утвердить все URGENT/HIGH]  [Просмотреть по одному]  [Пропустить всё]

wf_id: INBOX_TRIAGE_2026_04_27_01
```

### Example: gate halt before summary

```
🤖 ORCHESTRATOR — Gate/Product 🔴
Step 6/10 — ТРЕБУЕТ ВНИМАНИЯ

Черновик Алексея Штерн содержит:
  "INNOWEISS отбеливает на 5 тонов за 2 недели"
product-skill: данное утверждение об отбеливании в INNOWEISS не найдено.

[🔴 Удалить фразу из черновика]  [Переписать весь черновик]

wf_id: INBOX_TRIAGE_2026_04_27_01
```

### Example: per-thread review

```
🤖 ORCHESTRATOR — Inbox/Thread
Step 8/10 (письмо 1 из 4)

📧 От: fatima.ali@gmail.com (emea@dasexperten.de)
   Тема: My order hasn't arrived
   Язык: English
   Отправитель: Klaus Weber

Черновик:
"Hello Fatima,

Thank you for getting in touch. I understand your concern about the delivery.
Let me look into your order immediately. Could you confirm the order number
and the date you placed it? I'll come back to you with a clear update within
the day.

Best regards,
Klaus Weber
Customer Care | Das Experten
emea@dasexperten.de"

[Отправить]  [Редактировать]  [Пропустить]

wf_id: INBOX_TRIAGE_2026_04_27_01
```

### Example: completion summary

```
🤖 ORCHESTRATOR — Inbox/Done ✓
Step 10/10

Разобрано писем: 8
  Отправлено: 4
  Черновики MEDIUM: 2 (ждут вашего решения)
  Пропущено/архив: 2
  Ошибок: 0

Время: 11 минут
Архив: https://drive.google.com/...

Черновики MEDIUM готовы. Отправить?
[Отправить все MEDIUM]  [Позже]

wf_id: INBOX_TRIAGE_2026_04_27_01
```

---

## Scheduled run behavior

When fired by Apps Script time trigger (not by Aram's Telegram message):
- `params.original_trigger = "scheduled: inbox-triage"`
- `params.inboxes = ["eurasia", "emea", "export", "marketing"]` (all 4)
- Workflow proceeds identically to manual run
- First message to Aram is the classification summary (Step 7)
- Aram can approve from Telegram without having sent any trigger message

If no unread emails are found → send brief note:
```
🤖 ORCHESTRATOR — Inbox/Done ✓
Утренняя почта: новых писем нет. До завтра.
wf_id: INBOX_TRIAGE_2026_04_27_01
```
