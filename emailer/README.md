# Emailer V3 — Action-based Gmail operator

Action-based Gmail operator for Das Experten. One endpoint, multiple actions.
Mandatory archiving of all outgoing mail. Drafts, search, full-thread reads,
and inbound-attachment offloading are all first-class operations exposed
through the same `doPost` JSON API.

This is **not a standalone repository** — it is a subfolder of
[`dasexperten/arams-db`](https://github.com/dasexperten/codex-tutorial)
(redirects to the renamed `dasexperten/arams-db`).

## Architecture inside `arams-db`

```
arams-db/
├── my-skills/                          (read by orchestrator workflows, not by emailer)
├── cli.py                              (existing orchestrator entry point)
├── .github/workflows/                  (existing auto-reply.yml etc., plus future
│                                        sales-hunter / outreach workflows)
└── emailer/                            (THIS subfolder — Apps Script web app)
    ├── src/
    │   ├── Main.gs                     (doPost dispatcher — pure routing)
    │   ├── GmailSender.gs              (sendNew, replyToThread, replyAllToThread, createDraft)
    │   ├── ThreadResolver.gs           (thread context + access validation)
    │   ├── DriveManager.gs             (legacy folder-by-name helper, kept for back-compat)
    │   ├── Reporter.gs                 (mandatory archive Doc per outgoing send)
    │   ├── Logger.gs                   (V3 schema, legacy-tolerant)
    │   ├── actions/
    │   │   ├── ActionSend.gs
    │   │   ├── ActionReply.gs
    │   │   ├── ActionReplyAll.gs
    │   │   ├── ActionFind.gs
    │   │   ├── ActionGetThread.gs
    │   │   └── ActionDownloadAttachment.gs
    │   └── lib/
    │       └── InboxAttachmentManager.gs (per-sender subfolder + blob save)
    ├── appsscript.json                 (manifest + OAuth scopes + Gmail Advanced Service)
    ├── .clasp.json.example
    ├── README.md                       (this file)
    └── SETUP_NOTES.md                  (manual deploy steps)
```

```
                       ┌─────────────────────────────────────┐
[ caller / workflow ] ─┤  POST { "action": "...", ...body }  │
                       └──────────────┬──────────────────────┘
                                      ▼
                              ┌──────────────┐
                              │   Main.gs    │  (dispatcher)
                              └──────┬───────┘
                                     ▼
              ┌──────────────────────┴──────────────────────┐
              │                                             │
   actions/Action*.gs                              src/lib/...
   (one handler per action)                        (shared helpers)
              │
              ├─→ GmailSender (send / reply / draft)
              ├─→ Reporter    (archive Doc — Drive)        ┌────────────────┐
              ├─→ Logger      (row to log Sheet)           │  Drive folders │
              └─→ ThreadResolver / InboxAttachmentManager  │  (by ID only)  │
                                                            ├────────────────┤
                                                            │ Reporter/      │
                                                            │  └ recipient/  │
                                                            │ Inbox Attach./ │
                                                            │  └ sender/     │
                                                            └────────────────┘
```

## Action reference

| Action                | Required fields                         | Optional fields                                                     | Reporter runs? |
|-----------------------|-----------------------------------------|---------------------------------------------------------------------|----------------|
| `send`                | `recipient`, `subject`, `body_html`/`body_plain` | `attachment_link`, `context`, `draft_only`                  | yes (skipped if `draft_only:true`) |
| `reply`               | `thread_id`, `body_html`/`body_plain`   | `attachment_link`, `context`, `draft_only`, `in_reply_to_message_id` | yes (skipped if `draft_only:true`) |
| `reply_all`           | `thread_id`, `body_html`/`body_plain`   | `attachment_link`, `context`, `draft_only`, `in_reply_to_message_id` | yes (skipped if `draft_only:true`) |
| `find`                | `query`                                 | `max_results` (default 10, hard cap 50)                             | no             |
| `get_thread`          | `thread_id`                             | —                                                                   | no             |
| `download_attachment` | `message_id`, `attachment_name` (or `attachment_index`) | `target_subfolder_override`                              | no             |

## Universal flags

### `draft_only: true`

Available on `send` / `reply` / `reply_all`. Instead of dispatching, the
emailer creates a Gmail Draft via the Gmail Advanced Service and returns:

```json
{
  "success": true,
  "mode": "draft",
  "draft_id": "r-1234567890",
  "draft_link": "https://mail.google.com/mail/u/0/#drafts/r-1234567890",
  "thread_id": "186b7a8c1234abcd",
  "message_id": null,
  "archive_status": "skipped",
  "archive_doc_link": null
}
```

Reporter does **not** run for drafts (nothing was sent yet). The Sheet row
records `mode=draft`, `draft_only=true`, `archive_status=skipped`.

## Archive structure on Drive

```
Reporter/                                    (REPORTER_FOLDER_ID — set in Script Properties)
├── buyer@vn-distrib.example/
│   ├── Q2 distributor deck — 2026-04-26 14:30.gdoc
│   └── Re: MOQ confirmation — 2026-04-27 09:12.gdoc
├── lead@pl-wholesale.example/
│   └── ...
└── ...

Inbox Attachments/                           (INBOX_ATTACHMENTS_FOLDER_ID — set in Script Properties)
├── supplier@de.example/
│   ├── contract_v3.pdf
│   └── packing_list.xlsx
└── ...
```

Per-recipient subfolders (Reporter) and per-sender subfolders (Inbox
Attachments) are created on demand. Email addresses are sanitized:
lowercased, folder-illegal characters (`/ \ : * ? " < > |`) replaced with `_`.

Drive folder access is **always by ID**, never by name lookup. Folder IDs
are stored in `PropertiesService` (see `SETUP_NOTES.md`).

## Failure modes

- **Reporter fails** (e.g. wrong folder ID, Drive quota) → email send is
  unaffected. Response keeps `success: true` for the email itself, with
  `archive_status: "failed"` and `archive_error: <message>` populated.
- **Draft mode** (`draft_only: true`) → Reporter is intentionally skipped
  (`archive_status: "skipped"`).
- **Unknown action** → `{ success: false, action: "<name>", error: "Unknown action: <name>" }`.
- **Missing required field** → `{ success: false, error: "Missing required field: <name>" }`.
- **Inaccessible thread / message** → `{ success: false, error: "Inaccessible thread_id: <id> (<gmail-error>)" }`.
- **Gmail Advanced Service not enabled** → `createDraft` throws on the very
  first draft attempt; enable it in Apps Script editor (see SETUP_NOTES.md §7).

## Payload examples

### `send` — new email with pre-made attachment

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

### `send` — same as above but only stage as draft

```json
{
  "action": "send",
  "draft_only": true,
  "recipient": "buyer@vn-distrib.example",
  "subject": "Das Experten — Q2 distributor deck",
  "body_html": "<p>Dear partner...</p>"
}
```

### `reply` — reply inside an existing thread

```json
{
  "action": "reply",
  "thread_id": "186b7a8c1234abcd",
  "body_html": "<p>Confirming MOQ 1 pallet, lead time 4 weeks, FOB Riga.</p>",
  "context": "Buyer pushed back on MOQ in last reply."
}
```

### `reply_all` — reply preserving the full CC list

```json
{
  "action": "reply_all",
  "thread_id": "186b7a8c1234abcd",
  "body_html": "<p>Looping everyone in: confirming the slot for Tuesday.</p>"
}
```

### `find` — Gmail search

```json
{
  "action": "find",
  "query": "from:buyer@vn-distrib.example is:unread has:attachment",
  "max_results": 5
}
```

### `get_thread` — full context

```json
{
  "action": "get_thread",
  "thread_id": "186b7a8c1234abcd"
}
```

### `download_attachment` — save attachment to Drive

```json
{
  "action": "download_attachment",
  "message_id": "186b7a8c1234efff",
  "attachment_name": "contract_v3.pdf"
}
```

## Response examples

### `send` (sent)

```json
{
  "success": true,
  "action": "send",
  "mode": "new",
  "draft_only": false,
  "message_id": "186b7a8c1234abcd",
  "thread_id": "186b7a8c0000abcd",
  "draft_id": null,
  "draft_link": null,
  "archive_status": "ok",
  "archive_doc_link": "https://docs.google.com/document/d/.../edit?usp=sharing",
  "archive_error": null,
  "result_summary": "Sent",
  "log_id": "42",
  "error": null
}
```

### `send` (draft mode)

```json
{
  "success": true,
  "action": "send",
  "mode": "draft",
  "draft_only": true,
  "message_id": null,
  "thread_id": null,
  "draft_id": "r-9876543210",
  "draft_link": "https://mail.google.com/mail/u/0/#drafts/r-9876543210",
  "archive_status": "skipped",
  "archive_doc_link": null,
  "archive_error": null,
  "result_summary": "Draft created",
  "log_id": "43",
  "error": null
}
```

### `reply` (sent + Reporter failed)

```json
{
  "success": true,
  "action": "reply",
  "mode": "reply",
  "draft_only": false,
  "message_id": "186b7a8c5555ffff",
  "thread_id": "186b7a8c0000abcd",
  "archive_status": "failed",
  "archive_doc_link": null,
  "archive_error": "REPORTER_FOLDER_ID points to an inaccessible folder: ABCDEF (...)",
  "result_summary": "Sent",
  "log_id": "44",
  "error": null
}
```

### `find`

```json
{
  "success": true,
  "action": "find",
  "query": "from:buyer@vn-distrib.example is:unread",
  "total_found": 3,
  "threads": [
    {
      "thread_id": "186b7a8c0000abcd",
      "subject": "Re: MOQ confirmation",
      "last_message_from": "Buyer Name <buyer@vn-distrib.example>",
      "last_message_snippet": "Thanks, confirmed for next week...",
      "message_count": 5,
      "has_attachments": true,
      "last_message_date": "2026-04-25T10:13:00.000Z",
      "participants": ["aram@dasexperten.example", "buyer@vn-distrib.example"]
    },
    { "thread_id": "...", "subject": "...", "...": "..." },
    { "thread_id": "...", "subject": "...", "...": "..." }
  ],
  "result_summary": "Found 3 threads",
  "log_id": "45",
  "error": null
}
```

### `get_thread`

```json
{
  "success": true,
  "action": "get_thread",
  "thread_id": "186b7a8c0000abcd",
  "subject": "Q2 distributor deck",
  "participants": ["aram@dasexperten.example", "buyer@vn-distrib.example"],
  "message_count": 2,
  "messages": [
    {
      "message_id": "186b7a8c1111aaaa",
      "from": "Aram <aram@dasexperten.example>",
      "to": ["buyer@vn-distrib.example"],
      "cc": [],
      "date": "2026-04-26T14:30:00.000Z",
      "body_plain": "Dear partner, please find our Q2 deck attached...",
      "has_attachments": false,
      "attachment_names": []
    },
    {
      "message_id": "186b7a8c1111bbbb",
      "from": "Buyer <buyer@vn-distrib.example>",
      "to": ["aram@dasexperten.example"],
      "cc": [],
      "date": "2026-04-27T09:12:00.000Z",
      "body_plain": "Thanks, confirmed for next week. One question about MOQ...",
      "has_attachments": false,
      "attachment_names": []
    }
  ],
  "result_summary": "Returned 2 messages",
  "log_id": "46",
  "error": null
}
```

### `download_attachment`

```json
{
  "success": true,
  "action": "download_attachment",
  "file_id": "1AbCdEf...",
  "file_name": "contract_v3.pdf",
  "file_link": "https://drive.google.com/file/d/1AbCdEf.../view?usp=drivesdk",
  "saved_to_folder": "Inbox Attachments / supplier@de.example",
  "sender": "supplier@de.example",
  "size_bytes": 184213,
  "mime_type": "application/pdf",
  "result_summary": "Attachment saved (184213 bytes)",
  "log_id": "47",
  "error": null
}
```

## Setup

See [`SETUP_NOTES.md`](./SETUP_NOTES.md) for the full procedure (clasp install,
Apps Script project creation, Gmail Advanced Service enablement, three folder
IDs to set as Script Properties, sample curls for all six actions).

## Limits and caveats

- Gmail daily quota: 1,500 messages/day for Workspace, 100/day for consumer.
- `GmailApp.sendEmail` does not return IDs directly; `sendNew` re-queries the
  Sent mailbox to capture them.
- Apps Script execution timeout is 6 minutes — large `get_thread` responses
  (very long conversations) may approach it; truncate upstream if needed.
- Drive folder ACL on archive Docs and saved attachments is "anyone with link
  can view" — share links freely with the orchestrator workflow but be aware
  the URL itself is the only access control.
