---
name: emailer
description: Email delivery tool for Das Experten outbound and inbound communications across 4 inboxes (eurasia, emea, export, marketing). Trigger when user says any of these or close variants (in any language) - send email, отправь письмо, write an email, ответь на письмо, напиши клиенту, find email, найди письмо, what was in the thread, что было в треде, draft email, черновик письма, скачай вложение, download attachment, archive correspondence, заархивируй переписку. Also fires when another skill (personizer, sales-hunter, blog-writer, review-master) generates content and calls [[TOOL emailer action=...]]. Uses Virtual_staff.md for sender persona routing across 13 virtual employees. Never generates content - only wraps and delivers what came from a skill.
---

# emailer — Email delivery tool for Das Experten

```yaml
ROLE: TOOL
CHANNEL: email
TRIGGER: both
BACKEND: <EMAILER_EXEC_URL>  # See SETUP_NOTES.md for actual deployed URL
AUTH: Apps Script Web App, executed as account owner; secrets in Script Properties
STATUS: active
DEPENDENCIES: contacts, Virtual_staff.md (B2C personas), product-skill (when product mentioned), inbox-routing.md, actions.md
```

---

## When this tool fires

Three scenarios:

1. **Direct trigger** — Aram explicitly asks to send an email with content already provided ("отправь это письмо клиенту X", "send draft to TORI-GEORGIA").
2. **Skill-driven** — another skill (personizer, sales-hunter, blog-writer, review-master) finished generating content and calls `[[TOOL: emailer?action=...]]`. emailer wraps the content with persona signature and delivers.
3. **Inbound response** — incoming email arrives in one of 4 inboxes; emailer identifies sender, language, intent and routes to the correct sub-mode for response generation.

This tool **never generates strategic content**. It only:
- Selects the correct sender persona based on context
- Applies brand wrapper (signature, tone, language rules)
- Delivers via the Apps Script Web App (POST to `/exec`)
- Logs operations to `LOG_SHEET_ID`
- Archives outbound to `REPORTER_FOLDER_ID`

---

## Three-mode signature routing

**Source of truth for personas, signatures, tones:** `my-tools/Virtual_staff.md`.
**Source of truth for routing algorithm:** `my-tools/emailer/reference/inbox-routing.md`.

emailer MUST identify which mode applies before sending. No defaults — if mode unclear, HALT and ask Aram.

### Mode A — Executive / B2B (Aram Badalyan)

**When:** recipient is a corporate counterparty.

Detection logic:
1. Lookup recipient email in `contacts` skill (das-group, buyers, manufacturers, logistics, services)
2. If found → Mode A applies
3. If recipient domain matches known corporate domain (honghui.cn, jinxia.cn, inter-freight.ru, etc.) → Mode A applies

Standard signature for Mode A:

```
Best regards,

Aram Badalyan
General Manager
Das Experten International LLC / Das Experten Eurasia LLC
```

For Russian-language B2B (Eurasia counterparties):

```
С уважением,

Арам Бадалян
Генеральный директор
ООО "Дас Экспертен Евразия"
```

Tone: per Virtual_staff.md — concise/dry English for international, прямой/без помпы for Russian.

### Mode B — Customer service / B2C (Virtual staff)

**When:** recipient is end customer / blogger / media (not in contacts).

Sub-mode determined by **incoming inbox**:

| Inbox | Sub-mode | Default persona |
|---|---|---|
| eurasia@dasexperten.de | B-RU | Мария Косарева |
| emea@dasexperten.de | B-EMEA | Klaus Weber (EN/DE default) |
| export@dasexperten.de | B-EXPORT | Sarah Mitchell |
| marketing@dasexperten.de | B-MARKETING | Catherine Bauer (EN) / Ирина (RU) |

Specific persona within sub-mode determined by 4-step algorithm in `inbox-routing.md`.

### Mode C — Personal communication

**When:** Aram writes personally, not as General Manager. Rare for emailer (Aram personal email usually outside this tool).

If detected → HALT and confirm with Aram which signature to use.

### Mode selection algorithm

```
Step 1: Determine primary mode
   1. Recipient in contacts skill as corporate? → Mode A
   2. Recipient is end customer / blogger / media? → Mode B → go to Step 2
   3. Personal? → Mode C → HALT for confirmation
   4. Cannot determine → HALT, ask Aram

Step 2: Determine B sub-mode (only if Mode B)
   By incoming inbox (To-field of incoming or From-field of outgoing thread):
   - eurasia@ → B-RU
   - emea@ → B-EMEA
   - export@ → B-EXPORT
   - marketing@ → B-MARKETING

Step 3-4: See inbox-routing.md (CRM check first, then language + conversation type)
```

---

## Universal brand wrapper rules

Apply to every outbound email regardless of mode:

1. **Language:** match the incoming email language. Never reply in different language than customer used.
2. **Quotation marks:** never «ёлочки» — only " " or ' '
3. **Forbidden:** affectionate phrases, wellbeing inquiries, references to past advice (Mode A)
4. **Forbidden — absolute permanent prohibition:** mention of German origin, German science, "from Germany", "made in Germany", "немецкое производство" in any mode, any language. Domain `.de` is working compromise; do NOT amplify in text.
5. **Forbidden:** fabricating bank details, IBANs, SWIFT codes, tax IDs, contract numbers — if data missing, return error, never invent. Pull from `contacts` skill instead.
6. **Conversion Gate:** every B2C email must increase probability of purchase / repurchase / recommendation. Polite-but-not-converting = fail.
7. **Product Knowledge Gate:** mandatory verification via `product-skill` for any product/ingredient/mechanism mention.
8. **One-customer-one-staff:** never break CRM continuity in Mode B (see inbox-routing.md Step 4).

---

## Pre-send checklist

Before calling the Apps Script `/exec` endpoint, emailer MUST verify:

- [ ] Mode identified (A / B / C) — no default guessing
- [ ] Sub-mode identified for B (B-RU / B-EMEA / B-EXPORT / B-MARKETING)
- [ ] Specific persona selected per Virtual_staff.md and inbox-routing.md
- [ ] CRM tag checked for existing customer relationship (LOG_SHEET lookup)
- [ ] Language matches incoming email
- [ ] Tone matches persona and culture
- [ ] Signature complete (greeting + name + role + email)
- [ ] Product Knowledge Gate passed (if product mentioned)
- [ ] Conversion Gate passed (if B2C)
- [ ] Germany mention check passed (text body, all languages)
- [ ] No fabricated bank/legal identifiers
- [ ] Action selected per actions.md decision tree
- [ ] Required fields for action populated (recipient, subject, body, thread_id as applicable)

If any check fails → HALT or rewrite. Never bypass.

---

## Channel-specific section (email)

### Backend

- **API endpoint:** Apps Script Web App `/exec` URL — stored as `<EMAILER_EXEC_URL>` placeholder (actual URL in `SETUP_NOTES.md`)
- **Method:** HTTP POST with JSON body
- **Auth:** Apps Script runs as account owner (daxexperten@gmail.com); no auth header needed for POST request itself; secrets (LOG_SHEET_ID, REPORTER_FOLDER_ID, INBOX_ATTACHMENTS_FOLDER_ID) live in Script Properties
- **Required scopes:** Gmail, Drive, Docs, Sheets — authorized once via `authorize()` function
- **Rate limits:** Gmail send quota = ~100 emails/day for free Gmail, ~1500/day for Workspace; emailer queues with backoff if hit

### Message format constraints

- **Max length:** No hard limit (Gmail accepts large bodies; Reporter Doc fails on >80KB — use `archive` action for huge text instead)
- **Supported formatting:** HTML (preferred for branded emails) + plain-text fallback (mandatory for accessibility and spam filters)
- **Attachments:** delivered via Drive link (not as MIME attachment) — caller passes `attachment_link` in payload, appears in email body as "Open attachment" link
- **Threading:** Gmail handles In-Reply-To and References headers automatically via `thread.reply()` — replies never become orphans

### Multi-inbox sending

The emailer supports outbound email from all 4 Das Experten inboxes. Pass the
optional `"from"` field on `send`, `reply`, or `reply_all` to specify the
sending address. Accepted values are `eurasia@dasexperten.de`,
`emea@dasexperten.de`, `export@dasexperten.de`, and `marketing@dasexperten.de`
— anything else returns an `INVALID_FROM` error immediately. For `reply` and
`reply_all`, the inbox is **auto-detected** from the thread's `To`/`CC` headers
if `"from"` is omitted, so replies automatically originate from the same inbox
the customer originally wrote to. See `my-tools/emailer/inbox-routing.md` for
the whitelist and detection rule, and `my-tools/emailer/actions.md` for the
full `from` parameter contract.

### 7 actions exposed

See `my-tools/emailer/actions.md` for full decision tree, required/optional fields, returns, and error codes.

| Action | Use when |
|---|---|
| `send` | New outgoing email (no existing thread) |
| `reply` | Reply to one sender in existing thread |
| `reply_all` | Reply to all (To + CC) in existing thread |
| `find` | Search Gmail for messages by query |
| `get_thread` | Get full chronological history of a thread |
| `download_attachment` | Save attachment to Drive |
| `archive` | Save large text to Drive (gmail-search transcripts, analysis reports) |

Universal flag `draft_only: true` for `send` / `reply` / `reply_all` creates Gmail draft instead of sending. Reporter NOT called for drafts.

### Channel-specific signature formats (full list)

#### Mode A — Aram Badalyan

**English (international B2B):**
```
Best regards,

Aram Badalyan
General Manager
Das Experten International LLC / Das Experten Eurasia LLC
```

**Russian (CIS B2B):**
```
С уважением,

Арам Бадалян
Генеральный директор
ООО "Дас Экспертен Евразия"
```

#### Mode B-RU — Eurasia staff (eurasia@dasexperten.de)

**Мария Косарева — Customer support:**
```
С уважением,
Мария Косарева
Клиентская поддержка Das Experten
eurasia@dasexperten.de
```

**Елена Дорохова — Quality:**
```
С уважением,
Елена Дорохова
Отдел качества Das Experten
eurasia@dasexperten.de
```

**Алексей Штерн — Sales:**
```
С уважением,
Алексей Штерн
Отдел продаж Das Experten
eurasia@dasexperten.de
```

**Ирина Величко — PR (also marketing@):**
```
С уважением,
Ирина Величко
PR & Communications Das Experten
marketing@dasexperten.de
```

**Татьяна Агеева — Head, escalations:**
```
С уважением,
Татьяна Агеева
Руководитель отдела клиентского сервиса Das Experten
eurasia@dasexperten.de
```

#### Mode B-EMEA — EMEA staff (emea@dasexperten.de)

**Klaus Weber — Customer Care (German #1, English #2):**

German:
```
Mit freundlichen Grüßen,
Klaus Weber
Customer Care | Das Experten
emea@dasexperten.de
```

English:
```
Best regards,
Klaus Weber
Customer Care | Das Experten
emea@dasexperten.de
```

**Anna Schmidt — Sales (German #1, English #2):**

German:
```
Mit freundlichen Grüßen,
Anna Schmidt
Customer Care | Das Experten
emea@dasexperten.de
```

English:
```
Best regards,
Anna Schmidt
Customer Care | Das Experten
emea@dasexperten.de
```

**Marco Rossi — Sales & Support (Italian #1, English #2):**

Italian:
```
Cordiali saluti,
Marco Rossi
Customer Care | Das Experten
emea@dasexperten.de
```

English:
```
Best regards,
Marco Rossi
Customer Care | Das Experten
emea@dasexperten.de
```

**Sofia García — Sales & Support (Castilian Spanish #1, English #2):**

Spanish:
```
Saludos cordiales,
Sofía García
Customer Care | Das Experten
emea@dasexperten.de
```

English:
```
Best regards,
Sofía García
Customer Care | Das Experten
emea@dasexperten.de
```

**Ahmed Al-Rashid — Customer Care & Sales (Gulf Arabic #1, English #2):**

Arabic:
```
مع أطيب التحيات،
أحمد الراشد
خدمة العملاء | Das Experten
emea@dasexperten.de
```

English:
```
Best regards,
Ahmed Al-Rashid
Customer Care | Das Experten
emea@dasexperten.de
```

#### Mode B-EXPORT — Export staff (export@dasexperten.de)

**Sarah Mitchell — Universal Customer Care (American English):**
```
Best regards,
Sarah Mitchell
Customer Care | Das Experten
export@dasexperten.de
```

**James Carter — Sales & B2B-light (American English):**
```
Best regards,
James Carter
Sales | Das Experten
export@dasexperten.de
```

**Maria Fernández — LatAm specialist (Latin American Spanish #1, English #2):**

Spanish:
```
Saludos cordiales,
María Fernández
Customer Care | Das Experten
export@dasexperten.de
```

English:
```
Best regards,
María Fernández
Customer Care | Das Experten
export@dasexperten.de
```

#### Mode B-MARKETING (marketing@dasexperten.de)

**Catherine Bauer — PR International (English #1, German #2):**

English:
```
Best regards,
Catherine Bauer
PR & Communications | Das Experten
marketing@dasexperten.de
```

German:
```
Mit freundlichen Grüßen,
Catherine Bauer
PR & Communications | Das Experten
marketing@dasexperten.de
```

**Ирина Величко — PR Eurasia (Russian, also for marketing@ when sender is Russian):**

See Mode B-RU section above.

### Inbound parsing — how emailer detects sender, language, sub-mode

When processing an incoming email (from `find` or `get_thread` results):

1. **Sender detection:** parse `From` field — extract bare email from "Name <email>" format
2. **Sub-mode detection:** check `To` field of incoming → matches one of 4 inboxes → assigns sub-mode (see inbox-routing.md Step 1)
3. **Language detection:** analyze `body_plain` (first 500 chars) for language markers — see inbox-routing.md Step 2 for full list
4. **CRM lookup:** call `find` action with `query: "to:<sender_email> in:sent"` to check if any persona has previously corresponded with this sender; first match in LOG_SHEET wins (see inbox-routing.md Step 4)
5. **Conversation type detection (B-RU only):** scan body for keywords matching delivery/quality/sales/PR/escalation patterns (see inbox-routing.md Step 3)

### Logging and archiving

**Logging:**
- Destination: Google Sheet, ID stored as Script Property `LOG_SHEET_ID`
- Schema V3 (14 columns): `timestamp | action | mode | draft_only | recipient | thread_id | subject | has_attachment | archive_status | archive_doc_link | archive_error | result_summary | success | error`
- Auto-headers on first run; legacy V2 sheets log compatible columns only with warning
- Read-only actions (`find`, `get_thread`) also logged with full payload audit trail

**Archiving:**
- Outbound emails (`send`, `reply`, `reply_all` non-draft): mandatory Reporter Doc generated in `REPORTER_FOLDER_ID/<sanitized_recipient_email>/`
- Doc layout: branded teal banner header + metadata table + context section + body block + attachment link + footer
- Inbound attachments (`download_attachment`): saved to `INBOX_ATTACHMENTS_FOLDER_ID/<sanitized_sender>/`
- Archive failures are **non-fatal** — email still sends; `archive_error` reported in response, `success: true` preserved
- Large texts (>80KB) — use `archive` action with `archive_label` param to bypass Reporter's DocumentApp limit

### Error handling

| Error | Cause | emailer response |
|---|---|---|
| `Missing required field: X` | Caller did not provide required param | Return error to caller, do not retry |
| `Invalid or inaccessible thread_id` | Thread doesn't exist or no permissions | Verify thread_id via `find`; if still failing, HALT |
| `Cannot access REPORTER_FOLDER_ID` | Drive folder ID misconfigured | Email still sent; report archive_error to Aram |
| Apps Script timeout (>6 min) | Massive operation (e.g. find with max_results=50) | Reduce scope, retry; if persistent, paginate |
| Daily Gmail quota exceeded | Too many sends | HALT, notify Aram; quota resets at midnight Pacific |
| Gmail Advanced Service disabled (drafts only) | Service not enabled in Apps Script | One-time fix: enable Gmail v1 Advanced Service in script editor |
| Auth revoked | Owner removed permissions or token expired | HALT, ask Aram to re-run `authorize()` from script editor |

---

## Examples

### Example 1: Direct trigger, Mode A, send

**User:** "Отправь TORI-GEORGIA подтверждение отгрузки за вчера, контейнер MSCU1234567"

```
emailer flow:
1. Lookup TORI-GEORGIA in contacts → found, corporate buyer (DEI 2026 contract, 60d) → Mode A
2. Aram is sender; CRM continuity not relevant for Mode A
3. Pull TORI-GEORGIA contact email from contacts skill
4. Apply EN dry business style (default for international B2B)
5. Apply Aram English signature
6. Pre-send checklist: passed
7. POST to /exec:
   {
     "action": "send",
     "recipient": "<from contacts>",
     "subject": "Shipment confirmation — container MSCU1234567",
     "body_html": "<p>Dear team,</p><p>Confirming shipment...</p>...",
     "body_plain": "..."
   }
8. Reporter creates archive Doc in /TORI-GEORGIA/ subfolder
9. Log row added to LOG_SHEET
```

### Example 2: Skill-driven, Mode B-EMEA, reply

**Skill personizer generated** response to German customer complaint about delivery delay.
**Skill calls:** `[[TOOL: emailer?action=reply&thread_id=abc123]]`

```
emailer flow:
1. Verify thread_id via find or get_thread → exists
2. Inspect To-field of incoming → emea@dasexperten.de → Mode B-EMEA
3. CRM lookup: this customer was previously answered by Klaus → Klaus continues (Step 4 override)
4. Language check: customer wrote in German → Klaus German signature
5. Apply Klaus tone (precise, factual, polite-formal, Sie-form)
6. Verify Product Knowledge Gate: complaint mentions "die Bürste" → product mentioned → product-skill check passed
7. Verify Conversion Gate: response includes goodwill gesture (free brush replacement) — increases retention
8. Verify Germany mention check: Klaus body mentions nothing about German origin
9. Pre-send checklist: passed
10. POST to /exec:
    {
      "action": "reply",
      "thread_id": "abc123",
      "body_html": "<p>Sehr geehrter Herr Mueller,</p><p>...</p>...",
      "body_plain": "...",
      "context": "Customer complaint about delivery delay — replacement offered"
    }
11. Reporter archive Doc created
12. LOG_SHEET updated, customer-Klaus link reinforced
```

### Example 3: Inbound parsing, new Italian customer

**Inbound:** email arrives from `marco.rossi@example.it` to `emea@dasexperten.de`, body in Italian asking about whitening toothpaste.

```
emailer flow:
1. find action triggered by user "посмотри новые письма на emea"
2. Returns thread with snippet "Buongiorno, vorrei informazioni sui dentifrici sbiancanti..."
3. Sub-mode detection: To = emea@ → B-EMEA
4. CRM lookup: marco.rossi@example.it not in LOG_SHEET → new customer
5. Language detection: Italian (markers: "Buongiorno", "vorrei", "sui")
6. Routing: Italian in B-EMEA → Marco Rossi
7. Conversation type: "vorrei informazioni" + "sbiancanti" → sales intent
8. [Skill personizer or Aram drafts content with Marco Rossi tone]
9. emailer applies Marco Italian signature
10. Verify all gates
11. POST reply
```

### Example 4: HALT scenario — French customer on emea@

**Inbound:** email from `pierre@example.fr` to `emea@dasexperten.de`, body in French.

```
emailer flow:
1. Sub-mode = B-EMEA
2. CRM: not found
3. Language: French detected
4. Routing: French not in EMEA staff coverage → HALT
5. Return to Aram:

   HALT — emailer routing requires manual decision.
   
   Incoming email:
     From:    pierre@example.fr
     To:      emea@dasexperten.de
     Subject: Question sur le dentifrice
     Snippet: "Bonjour, j'ai vu votre dentifrice sur le site et je voudrais..."
   
   Detected:
     Sub-mode: B-EMEA
     Language: French
     CRM:      new customer
   
   Reason for HALT: French is not covered by EMEA staff (Klaus DE/EN, Anna DE/EN, Marco IT/EN, Sofia ES/EN, Ahmed AR/EN).
   
   Options:
     (a) Klaus replies in English with explicit acknowledgment "I will respond in English"
     (b) Postpone reply pending French staff expansion
     (c) Other (Aram specifies)
```

### Example 5: Workflow combination — quarterly correspondence archive

**User:** "Заархивируй переписку с Hryceva за последние 90 дней"

```
emailer flow:
1. find → query: "to:hryceva@example.com OR from:hryceva@example.com newer_than:90d", max_results: 50
2. Iterate threads, get_thread per each (chronological)
3. Compose markdown transcript (timestamp, from, to, body)
4. archive → 
   {
     "action": "archive",
     "archive_label": "buyer-correspondence",
     "title": "Hryceva correspondence — Q1 2026",
     "body_plain": "<full transcript>",
     "context": "Quarterly archive for B2B correspondence audit"
   }
5. Returns Drive link to permanent archive
6. LOG_SHEET row added for archive operation
```

### Example 6: Draft for sensitive negotiation

**User:** "Подготовь черновик ответа фабрике Honghui насчёт задержки партии — не отправляй пока"

```
emailer flow:
1. find → existing thread with Honghui
2. get_thread → context loaded
3. Mode A (Honghui in contacts as manufacturer)
4. Aram English signature
5. POST to /exec:
   {
     "action": "reply",
     "thread_id": "<from find>",
     "body_html": "...",
     "body_plain": "...",
     "draft_only": true
   }
6. Reporter NOT called (draft only)
7. Returns draft_link
8. Aram opens Gmail Drafts, reviews, manually sends or edits
```

---

## Anti-patterns specific to emailer

| Anti-pattern | Why bad | Correct approach |
|---|---|---|
| Sending Mode A signature to a customer | Breaks B2C immersion, confuses customer | Lookup recipient in contacts; if not found, default to Mode B with sub-mode by inbox |
| Replying with `send` action when thread_id exists | Creates orphan email without threading | Always `reply` with thread_id |
| Switching persona mid-thread without explicit transfer | Breaks one-customer-one-staff rule | Either continue with original persona or include explicit "Передаю коллеге..." sentence |
| Sending without `draft_only` for first contact with new B2B partner | No safety net for tone/legal review | Always draft_only for first cold outreach to corporate |
| Skipping Product Knowledge Gate on "small" product mention | Single wrong fact = lost premium credibility | EVERY product/ingredient/mechanism mention requires product-skill check, no exceptions |
| Hardcoding bank details in email body when contacts skill returns "not available" | Fabricated financial data = legal liability | Halt and ask Aram for verified data |
| Replying in English to Russian-language customer for "consistency" | Customer feels not heard | Match incoming language always |
| Long email to Telegram-style recipient (informal partner) | Friction, slow response | Use telegramer tool instead when channel is wrong |

---

## Versioning

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-04-27 | Initial release. 4-inbox routing, 13 personas, 7 actions, full integration with Apps Script bundle. |

---

**Source of truth references:**
- Personas, signatures, tones → `my-tools/Virtual_staff.md`
- Routing algorithm → `my-tools/emailer/reference/inbox-routing.md`
- Action selection → `my-tools/emailer/reference/actions.md`
- Counterparty data → `my-skills/contacts/`
- Product facts → `my-skills/product-skill/`
- Backend code → `my-tools/emailer/backend/emailer-bundle.gs`
- Deployment config → `my-tools/emailer/SETUP_NOTES.md`

When in conflict between this SKILL.md and any source-of-truth file above — **source-of-truth wins**. This file is the operational entry point, not the canonical truth.
