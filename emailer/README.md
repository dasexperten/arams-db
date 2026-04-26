# Emailer — Action-Based Gmail Operator

Action-based Gmail operator for Das Experten. One endpoint, multiple actions. Mandatory archiving of all outgoing mail.

This is a subfolder of [`dasexperten/arams-db`](https://github.com/dasexperten/arams-db), not a standalone repository.

---

## Architecture

```
arams-db/
└── emailer/                          ← Google Apps Script web app
    ├── src/
    │   ├── Main.gs                   action dispatcher (doPost → dispatchAction_)
    │   ├── GmailSender.gs            send / reply / reply_all / createDraft
    │   ├── ThreadResolver.gs         getThreadContext, validateThreadAccess
    │   ├── DriveManager.gs           legacy folder helper (kept for compat)
    │   ├── Reporter.gs               archive Doc → REPORTER_FOLDER_ID/<recipient>/
    │   ├── Logger.gs                 row → LOG_SHEET_ID Google Sheet
    │   ├── actions/
    │   │   ├── ActionSend.gs         action: "send"
    │   │   ├── ActionReply.gs        action: "reply"
    │   │   ├── ActionReplyAll.gs     action: "reply_all"
    │   │   ├── ActionFind.gs         action: "find"
    │   │   ├── ActionGetThread.gs    action: "get_thread"
    │   │   └── ActionDownloadAttachment.gs  action: "download_attachment"
    │   └── lib/
    │       └── InboxAttachmentManager.gs    per-sender subfolder in Drive
    ├── appsscript.json               manifest, scopes, Gmail Advanced Service
    ├── .clasp.json.example
    ├── README.md                     (this file)
    └── SETUP_NOTES.md                manual deploy steps

External resources (created once, IDs in Script Properties):
  Drive: Reporter folder     ← REPORTER_FOLDER_ID
         └── buyer@example.com/
             └── Q2 deck — 2026-04-26 14:30.gdoc
  Drive: Inbox Attachments   ← INBOX_ATTACHMENTS_FOLDER_ID
         └── supplier@example.com/
             └── contract_v3.pdf
  Sheets: Emailer Log        ← LOG_SHEET_ID
```

```
[ caller: GitHub Actions / n8n / curl ]
        │  POST { action: "...", ...fields }
        ▼
[ Apps Script: doPost → dispatchAction_ ]
        │
        ├─ "send"                → ActionSend.handle
        │     ├─ GmailSender.sendNew (or createDraft)
        │     ├─ Reporter.buildArchive   ← mandatory, non-fatal
        │     └─ Logger.logEmailerOperation
        │
        ├─ "reply"              → ActionReply.handle
        ├─ "reply_all"         → ActionReplyAll.handle
        │     (same pipeline as send, Reporter to thread participants)
        │
        ├─ "find"              → ActionFind.handle       (read-only, no Reporter)
        ├─ "get_thread"        → ActionGetThread.handle  (read-only, no Reporter)
        └─ "download_attachment" → ActionDownloadAttachment.handle
              ├─ GmailApp.getMessageById
              ├─ InboxAttachmentManager.getSenderSubfolder
              └─ InboxAttachmentManager.saveAttachmentToDrive
```

---

## Action reference

| action | required fields | optional fields | Reporter runs? |
|---|---|---|---|
| `send` | `recipient`, `subject`, `body_html` or `body_plain` | `attachment_link`, `context`, `draft_only` | Yes (not for drafts) |
| `reply` | `thread_id`, `body_html` or `body_plain` | `attachment_link`, `context`, `draft_only`, `in_reply_to_message_id` | Yes (not for drafts) |
| `reply_all` | `thread_id`, `body_html` or `body_plain` | `attachment_link`, `context`, `draft_only`, `in_reply_to_message_id` | Yes (not for drafts) |
| `find` | `query` | `max_results` (default 10, cap 50) | No |
| `get_thread` | `thread_id` | — | No |
| `download_attachment` | `message_id`, `attachment_name` or `attachment_index` | `target_subfolder_override` | No |

---

## Universal flags

### `draft_only: true`

Applies to `send`, `reply`, `reply_all`. Instead of sending the email, creates a Gmail draft and returns immediately — no email is sent, no Reporter archive is created.

Response when draft created:
```json
{
  "success": true,
  "action": "send",
  "mode": "draft",
  "draft_id": "r-xxxxxxxxxx",
  "draft_link": "https://mail.google.com/mail/u/0/#drafts/r-xxxxxxxxxx",
  "message_id": null,
  "thread_id": null
}
```

---

## Archive structure

```
Reporter/  (REPORTER_FOLDER_ID — Drive folder)
├── buyer@vn-distrib.example/
│   └── Q2 deck — 2026-04-26 14:30.gdoc
├── lead@pl-wholesale.example/
│   └── Возвращаем диалог по SCHWARZ — 2026-04-27 09:15.gdoc
└── ...

Inbox Attachments/  (INBOX_ATTACHMENTS_FOLDER_ID — Drive folder)
├── supplier@de.example/
│   └── contract_v3.pdf
├── buyer@vn-distrib.example/
│   └── MOQ_confirmation.xlsx
└── ...
```

Each archive Doc contains:
- **H1**: email subject
- **H2 Envelope**: From / To / Date / Mode / Thread ID (if reply)
- **H2 Context**: caller-supplied context string (skipped if empty)
- **H2 Body**: plain-text body, line breaks preserved
- **H2 Attachment**: clickable link (skipped if empty)
- Footer with ISO generation timestamp

---

## Failure modes

- **Reporter fails** → email still returns `success: true`, `archive_error` field populated, `archive_doc_link: null`
- **Draft mode** → Reporter skipped entirely (nothing was sent yet)
- **Unknown action** → `{ success: false, error: "Unknown action: <name>" }`
- **Missing required field** → `{ success: false, error: "Missing required field: <name>." }`
- **Thread inaccessible** → `{ success: false, error: "Invalid or inaccessible thread_id: ..." }`
- **Attachment not found** → `{ success: false, error: "Attachment '<name>' not found in message <id>" }`
- **LOG_SHEET_ID unset** → logging is a no-op, all actions still work normally

---

## Payload examples

### 1. send — new email

```json
{
  "action": "send",
  "recipient": "buyer@vn-distrib.example",
  "subject": "Das Experten — Q2 distributor deck",
  "body_html": "<p>Dear partner,</p><p>Please find our Q2 deck attached.</p>",
  "body_plain": "Dear partner,\n\nPlease find our Q2 deck attached.",
  "attachment_link": "https://drive.google.com/file/d/EXISTING_ID/view",
  "context": "Vietnam pharmacy chain, follow-up to last week call."
}
```

### 2. reply — draft mode

```json
{
  "action": "reply",
  "thread_id": "186b7a8c1234abcd",
  "body_html": "<p>Confirming MOQ 1 pallet, lead time 4 weeks, FOB Riga.</p>",
  "draft_only": true,
  "context": "Buyer pushed back on MOQ in last reply."
}
```

### 3. reply_all — live send

```json
{
  "action": "reply_all",
  "thread_id": "186b7a8c1234abcd",
  "body_html": "<p>Team, please see the updated proposal attached.</p>",
  "attachment_link": "https://drive.google.com/file/d/PROPOSAL_ID/view",
  "context": "CC loop includes logistics manager and finance."
}
```

### 4. find — Gmail search

```json
{
  "action": "find",
  "query": "from:buyer@vn-distrib.example is:unread has:attachment",
  "max_results": 5
}
```

### 5. get_thread — full thread context

```json
{
  "action": "get_thread",
  "thread_id": "186b7a8c1234abcd"
}
```

### 6. download_attachment

```json
{
  "action": "download_attachment",
  "message_id": "186b7a8c5678efgh",
  "attachment_name": "contract_v3.pdf"
}
```

---

## Response examples

### 1. send — email sent successfully

```json
{
  "success": true,
  "action": "send",
  "mode": "new",
  "message_id": "186b7a8c5678efgh",
  "thread_id": "186b7a8c1234abcd",
  "archive_doc_link": "https://docs.google.com/document/d/DOC_ID/edit?usp=sharing",
  "archive_doc_id": "DOC_ID",
  "archive_error": null,
  "error": null
}
```

### 2. reply — archive failed (non-fatal)

```json
{
  "success": true,
  "action": "reply",
  "mode": "reply",
  "message_id": "186b7a8cabcdef01",
  "thread_id": "186b7a8c1234abcd",
  "archive_doc_link": null,
  "archive_doc_id": null,
  "archive_error": "Script property REPORTER_FOLDER_ID is not set.",
  "error": null
}
```

### 3. find — 3 threads returned

```json
{
  "success": true,
  "action": "find",
  "query": "from:buyer@vn-distrib.example is:unread has:attachment",
  "total_found": 3,
  "threads": [
    {
      "thread_id": "186b7a8c1234abcd",
      "subject": "Das Experten — Q2 distributor deck",
      "last_message_from": "buyer@vn-distrib.example",
      "last_message_snippet": "Thank you for the deck. We have some questions about the MOQ...",
      "message_count": 2,
      "has_attachments": true,
      "last_message_date": "2026-04-26T11:30:00.000Z",
      "participants": ["aram@dasexperten.com", "buyer@vn-distrib.example"]
    },
    {
      "thread_id": "186b7a8c5678abcd",
      "subject": "Re: Pricing for SCHWARZ line",
      "last_message_from": "buyer@vn-distrib.example",
      "last_message_snippet": "Can you confirm whether the SCHWARZ 75ml is in stock?",
      "message_count": 4,
      "has_attachments": true,
      "last_message_date": "2026-04-25T08:15:00.000Z",
      "participants": ["aram@dasexperten.com", "buyer@vn-distrib.example", "logistics@dasexperten.com"]
    },
    {
      "thread_id": "186b7a8cabcd1234",
      "subject": "Certificate request",
      "last_message_from": "buyer@vn-distrib.example",
      "last_message_snippet": "Please share ISO certificate for the whitening gel SKU.",
      "message_count": 1,
      "has_attachments": false,
      "last_message_date": "2026-04-24T14:00:00.000Z",
      "participants": ["aram@dasexperten.com", "buyer@vn-distrib.example"]
    }
  ],
  "error": null
}
```

### 4. send with draft_only:true — draft created

```json
{
  "success": true,
  "action": "send",
  "mode": "draft",
  "draft_id": "r-ABcDeFgHiJkLmNoP",
  "draft_link": "https://mail.google.com/mail/u/0/#drafts/r-ABcDeFgHiJkLmNoP",
  "message_id": null,
  "thread_id": null,
  "error": null
}
```

### 5. get_thread — full thread data

```json
{
  "success": true,
  "action": "get_thread",
  "thread_id": "186b7a8c1234abcd",
  "subject": "Das Experten — Q2 distributor deck",
  "participants": ["aram@dasexperten.com", "buyer@vn-distrib.example"],
  "message_count": 2,
  "messages": [
    {
      "message_id": "186b7a8c5678efgh",
      "from": "Aram Badalyan <aram@dasexperten.com>",
      "to": ["buyer@vn-distrib.example"],
      "cc": [],
      "date": "2026-04-26T09:00:00.000Z",
      "body_plain": "Dear partner,\n\nPlease find our Q2 deck attached.",
      "has_attachments": false,
      "attachment_names": []
    },
    {
      "message_id": "186b7a8cabcdef01",
      "from": "buyer@vn-distrib.example",
      "to": ["aram@dasexperten.com"],
      "cc": [],
      "date": "2026-04-26T11:30:00.000Z",
      "body_plain": "Thank you for the deck. We have some questions about the MOQ for the whitening gel line.",
      "has_attachments": true,
      "attachment_names": ["questions_Q2.pdf"]
    }
  ],
  "error": null
}
```

### 6. download_attachment — file saved

```json
{
  "success": true,
  "action": "download_attachment",
  "file_id": "1AbCdEfGhIjKlMnOpQrStUvWx",
  "file_name": "contract_v3.pdf",
  "file_link": "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWx/view?usp=sharing",
  "saved_to_folder": "Inbox Attachments / supplier@de.example",
  "sender": "Supplier GmbH <supplier@de.example>",
  "size_bytes": 204800,
  "mime_type": "application/pdf",
  "error": null
}
```

---

## Setup

See [`SETUP_NOTES.md`](./SETUP_NOTES.md) for the full procedure.
