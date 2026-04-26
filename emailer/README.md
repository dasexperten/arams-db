# Emailer (subfolder of `arams-db`)

Apps Script web app that sends Gmail messages on behalf of Aram's Das Experten
ecosystem. **Variant C: thin sender.** The caller (a separate GitHub Actions
workflow, n8n, dasoperator, or a manual `curl`) prepares the email content
fully — subject, body, optional attachment link — and POSTs it. The emailer:

1. Sends the email (new message or reply inside an existing Gmail thread).
2. Builds a Google Doc archive of the send and saves it to Drive.
3. Writes a row to the logging Google Sheet.

The emailer does **not** load skills, call Anthropic, or generate content. That
responsibility lives upstream in whichever workflow calls the emailer — the
same pattern used by `auto-reply.yml` and `auto-reply-wb.yml` in this repo.

This is **not a standalone repository** — it is a subfolder of
[`dasexperten/arams-db`](https://github.com/dasexperten/arams-db).

## Architecture inside `arams-db`

```
arams-db/
├── my-skills/                     (skills repo: read by orchestrator workflows)
│   ├── personizer/SKILL.md
│   ├── blog-writer/SKILL.md
│   └── ...
│
├── cli.py                         (existing orchestrator entry point)
├── .github/workflows/
│   ├── auto-reply.yml             (existing — Ozon review autoreply)
│   ├── auto-reply-wb.yml          (existing — WB review autoreply)
│   └── (future) sales-hunter.yml  (new orchestrator: finds clients, drafts via skill, calls emailer)
│
└── emailer/                       (THIS subfolder — Apps Script web app)
    ├── src/
    │   ├── Main.gs                (doPost entry point, routing)
    │   ├── GmailSender.gs         (sendNew + replyToThread)
    │   ├── ThreadResolver.gs      (Gmail thread context for replies)
    │   ├── DriveManager.gs        (folder + share-link helper)
    │   ├── Reporter.gs            (post-send archive Doc)
    │   └── Logger.gs              (Sheet logging)
    ├── appsscript.json            (manifest + OAuth scopes)
    ├── .clasp.json.example
    ├── README.md                  (this file)
    └── SETUP_NOTES.md             (manual deploy steps)
```

```
[ orchestrator workflow ]
  ├─ reads my-skills/<skill>/SKILL.md from local repo
  ├─ calls Claude API to draft email
  └─ POSTs ready content to emailer URL
                │
                ▼
[ Apps Script: doPost ]
  ├─ ThreadResolver  (if reply)
  ├─ GmailSender     (send via GmailApp)
  ├─ Reporter        (archive Doc to Drive)
  └─ Logger          (row to Sheet)
```

## Call format

`POST <web app URL>`, content type `application/json`.

### Schema

```json
{
  "task": "string (required, label for archive/log)",
  "recipient": "string (email, required if no thread_id)",
  "subject": "string (required for new email; ignored on reply)",
  "body_html": "string (optional, preferred — raw HTML)",
  "body_text": "string (optional, plain-text version / fallback)",
  "attachment_link": "string (optional, Drive URL — appended to body if not inline)",
  "thread_id": "string (optional, Gmail thread ID — triggers reply mode)",
  "in_reply_to_message_id": "string (optional, informational)",
  "context": "string (optional, recorded in archive Doc)"
}
```

At least one of `body_html` / `body_text` is required. If only `body_html` is
sent, a plain-text version is derived automatically.

### Response

```json
{
  "success": true,
  "mode": "new | reply",
  "message_id": "Gmail message ID",
  "thread_id": "Gmail thread ID",
  "archive_doc_link": "https://docs.google.com/document/d/.../edit?usp=sharing",
  "log_id": "row number in log sheet, or null",
  "error": null
}
```

### Scenario A — new email with pre-made attachment link

```json
{
  "task": "Send Q2 distributor deck to Vietnam buyer",
  "recipient": "buyer@vn-distrib.example",
  "subject": "Das Experten — Q2 distributor deck",
  "body_html": "<p>Dear partner,</p><p>Please find our Q2 deck attached.</p>",
  "body_text": "Dear partner,\n\nPlease find our Q2 deck attached.",
  "attachment_link": "https://drive.google.com/file/d/EXISTING_ID/view",
  "context": "Vietnam pharmacy chain, follow-up to last week call."
}
```

### Scenario B — new email, content drafted upstream by a skill

The orchestrator workflow loads `my-skills/personizer/SKILL.md`, calls Claude
API with it as system prompt, then POSTs the rendered body here:

```json
{
  "task": "Reactivate Polish wholesaler",
  "recipient": "lead@pl-wholesale.example",
  "subject": "Возвращаем диалог по SCHWARZ",
  "body_html": "<p>...drafted-by-personizer text...</p>",
  "context": "Cold reactivate after 3 months of silence; price tier mid."
}
```

### Scenario C — reply inside an existing Gmail thread

```json
{
  "task": "Reply to Vietnam buyer about MOQ",
  "thread_id": "186b7a8c1234abcd",
  "body_html": "<p>Confirming MOQ 1 pallet, lead time 4 weeks, FOB Riga.</p>",
  "body_text": "Confirming MOQ 1 pallet, lead time 4 weeks, FOB Riga.",
  "context": "Buyer pushed back on MOQ in last reply."
}
```

`ThreadResolver` validates thread access, `GmailSender.replyToThread` posts
inside the same Gmail thread (Gmail handles `In-Reply-To` / `References`
headers automatically — no orphan messages).

## After every successful send

Emailer creates one Google Doc per send in the archive folder
(`PropertiesService.ARCHIVE_FOLDER`, default `Emailer Archive`). The Doc
includes:

- Envelope: mode, recipient, subject, timestamps (MSK + UTC), message ID,
  thread ID, in-reply-to ID
- Thread context (only on replies): original subject, last sender, message
  count, participants, last message snippet
- Caller-supplied context
- Body (rendered plain text)
- Body (raw HTML source, monospace)
- Attachment link

The Doc is shared "anyone with link can view" so the URL in the response can
be opened directly.

## Setup

See [`SETUP_NOTES.md`](./SETUP_NOTES.md) for the full procedure. High level:

1. `cd arams-db/emailer && clasp create --type webapp --title "Emailer"`
2. `clasp push`
3. Create a Google Sheet for logging, copy its ID.
4. Deploy as web app (execute as me, anyone with link).
5. Set `PropertiesService` keys: `LOG_SHEET_ID`, `ARCHIVE_FOLDER`.
6. Smoke-test with the three sample payloads.

## Limits and caveats

- Gmail daily quota: 1,500 messages/day for Workspace, 100/day for consumer
  accounts. Watch for `Service invoked too many times` errors.
- `GmailApp.sendEmail` does not return IDs directly; `sendNew` re-queries the
  Sent mailbox to look up the freshly-sent message.
- All credentials (Sheet ID, archive folder name) live in `PropertiesService`
  — no secrets in code, no secrets in this repo.
- Emailer does not call Claude / Anthropic. Content generation is the caller's
  responsibility.
