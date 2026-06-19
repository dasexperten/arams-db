# emailer — inbox routing

Source of truth for the 6 Das Experten inboxes, the sender whitelist, and the
auto-detection algorithm used by `reply` and `reply_all`.

> **Placeholder note:** `sales@dasexperten.de` and `support@dasexperten.de` are
> PENDING — send-as alias not yet configured in Gmail. They are listed in the
> code whitelist so the system is ready, but any send from these addresses will
> fail at the Gmail layer until the alias setup is completed.

---

## Sender inbox whitelist

Only these six addresses may appear in the `"from"` field of any outgoing
action. They are hardcoded in `ALLOWED_SENDER_INBOXES` inside
`dist/emailer-bundle.gs`. Every address must exist as a send-as alias in the
Workspace account; Gmail will reject the send otherwise.

| Inbox | Sub-mode | Primary audience |
|---|---|---|
| `eurasia@dasexperten.de` | B-RU | Russian-speaking customers, CIS |
| `emea@dasexperten.de` | B-EMEA | European and Middle-Eastern customers |
| `export@dasexperten.de` | B-EXPORT | International B2B and export markets |
| `marketing@dasexperten.de` | B-MARKETING | PR, bloggers, media, campaigns |
| `sales@dasexperten.de` | TBD — pending alias setup | TBD — pending alias setup |
| `support@dasexperten.de` | TBD — pending alias setup | TBD — pending alias setup |

---

## Auto-detection rule for reply / reply_all

When `"from"` is omitted from a `reply` or `reply_all` payload, the script
determines the correct outgoing inbox automatically:

1. Fetch all messages in the thread via `GmailApp.getThreadById(threadId).getMessages()`.
2. For each message, extract the raw `To` and `CC` header strings.
3. Split each header on commas to get individual address tokens.
4. Strip display names — extract only the bare email from `"Name <email>"` format.
5. Lowercase-compare each bare email against the four whitelisted inboxes.
6. **First match wins** — return that inbox address as the outgoing `from`.
7. If no message in the entire thread contains a whitelisted address in `To`
   or `CC`, fall back to the script owner's primary address
   (daxexperten@gmail.com) and write a warning to the Apps Script execution log.

This ensures that a customer who wrote to `emea@dasexperten.de` always receives
a reply from `emea@dasexperten.de`, with no caller configuration needed.

---

## Persona routing algorithm (sub-mode → persona)

Once the sub-mode is determined (Step 1 below), follow Steps 2–4 to select
the correct virtual staff member. Full persona definitions and signatures live
in `my-tools/Virtual_staff.md`.

### Step 1 — determine sub-mode from inbox

| Incoming `To` field | Sub-mode |
|---|---|
| `eurasia@dasexperten.de` | B-RU |
| `emea@dasexperten.de` | B-EMEA |
| `export@dasexperten.de` | B-EXPORT |
| `marketing@dasexperten.de` | B-MARKETING |

For outbound `send` (no existing thread), use the `"from"` value to infer
sub-mode if known; otherwise determine from recipient/context.

### Step 2 — detect language

Analyse `body_plain` (first 500 chars) for language markers:

| Marker examples | Language |
|---|---|
| Привет, Здравствуйте, Спасибо, пожалуйста | Russian |
| Guten Tag, Danke, Bitte, Mit freundlichen | German |
| Buongiorno, Grazie, Cordiali saluti | Italian |
| Hola, Gracias, Saludos | Spanish |
| مرحبا, شكرا, مع أطيب التحيات | Arabic |
| All other / inconclusive | English (default) |

### Step 3 — determine conversation type (B-RU only)

Scan body for keyword clusters:

| Cluster | Type |
|---|---|
| доставк*, трекинг, посылка, курьер | delivery |
| качество, брак, возврат, повреждён* | quality |
| цена, опт, партнёрство, дистрибуц* | sales |
| блог*, обзор, коллаборац*, PR | PR |
| руководитель, жалоба, эскалац* | escalation |

### Step 4 — CRM continuity check

Before assigning a new persona, query the LOG_SHEET (`find` action with
`"to:<sender_email> in:sent"`) to see if any virtual staff member has
previously corresponded with this sender.

- **Match found** → that persona continues the thread regardless of language or
  conversation type. One customer, one staff member.
- **No match** → assign persona by sub-mode + language + conversation type
  (Steps 1–3). Record the new assignment in LOG_SHEET on first send.

---

## HALT conditions

Routing **must halt** and surface a decision to Aram when:

- Language detected is French, Chinese, Japanese, Korean, or other language
  with no matching persona in the target sub-mode.
- Conversation type is escalation and the original persona is not Татьяна Агеева
  (B-RU) — must confirm escalation path before replying.
- Incoming inbox is unknown (To-field does not match any of the 4 whitelisted
  inboxes and it is not a direct/personal email).
- Mode A vs Mode B is ambiguous (recipient not found in contacts and domain
  does not match a known corporate list).

Return a structured HALT message to Aram with: detected sub-mode, language,
CRM status, and at least two resolution options.
