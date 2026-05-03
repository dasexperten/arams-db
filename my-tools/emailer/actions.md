# emailer — action reference

Decision tree, required/optional fields, response shapes, and error codes for
all 7 actions exposed by the Apps Script web app.

---

## Action surface

| action                | required fields                                         | optional fields                                                                          | Reporter / Drive write?           |
|-----------------------|---------------------------------------------------------|------------------------------------------------------------------------------------------|-----------------------------------|
| `send`                | `recipient`, `subject`, `body_html` or `body_plain`     | `from`, `attachment_link`, `context`, `draft_only`                                       | Yes (Doc archive, not for drafts) |
| `reply`               | `thread_id`, `body_html` or `body_plain`                | `from`, `attachment_link`, `context`, `draft_only`, `in_reply_to_message_id`             | Yes (not for drafts)              |
| `reply_all`           | `thread_id`, `body_html` or `body_plain`                | `from`, `attachment_link`, `context`, `draft_only`, `in_reply_to_message_id`             | Yes (not for drafts)              |
| `find`                | `query`                                                 | `max_results` (default 10, cap 50)                                                       | No                                |
| `get_thread`          | `thread_id`                                             | —                                                                                        | No                                |
| `download_attachment` | `message_id`, `attachment_name` or `attachment_index`   | `target_subfolder_override`                                                              | No (saves attachment to Drive)    |
| `archive`             | `title`, `body_plain` or `body_html`                    | `archive_label` (default `system-archive`), `context`, `mime_type`                       | Yes (markdown file, not Doc)      |

Universal flag `draft_only: true` — applies to `send`, `reply`, `reply_all`.
Creates a Gmail draft instead of sending. Reporter is skipped for drafts.

---

## `from` parameter (send / reply / reply_all)

All three outgoing actions accept an optional `"from"` field that controls
which inbox the email appears to be sent from.

### Whitelist

Only these six addresses are accepted:

```
eurasia@dasexperten.de
emea@dasexperten.de
export@dasexperten.de
marketing@dasexperten.de
sales@dasexperten.de
support@dasexperten.de
```

The whitelist is enforced in `ALLOWED_SENDER_INBOXES` inside `emailer-bundle.gs`.
Every address must be configured as a send-as alias in the Workspace account
before Gmail will honour the `from` option.

> Note: `sales@dasexperten.de` and `support@dasexperten.de` are placeholders —
> the send-as alias has not yet been configured in Gmail, so any send from
> these addresses will fail at the Gmail layer until setup is completed.

### Behaviour for `send`

- `"from"` **provided and in whitelist** → email is sent from that address.
- `"from"` **provided but NOT in whitelist** → request rejected immediately
  (see `INVALID_FROM` error below). Email is never sent.
- `"from"` **omitted** → default behaviour: email sent from the script owner's
  primary address (daxexperten@gmail.com).

### Behaviour for `reply` and `reply_all`

These actions use a two-step resolution to determine the outgoing address:

1. **Explicit override** — if `"from"` is present in the payload, it is
   validated against the whitelist. If valid it takes precedence. If invalid,
   `INVALID_FROM` is returned immediately.
2. **Auto-detection** — if `"from"` is omitted, the action inspects every
   message in the thread: it scans the `To` and `CC` headers of each message
   for an address that matches one of the four whitelisted inboxes. The first
   match found is used as the outgoing address.
3. **Fallback** — if neither override nor auto-detection yields an address,
   the reply is sent from the script owner's primary address. A warning is
   written to the Apps Script execution log.

Auto-detection ensures that a reply to a message addressed to
`emea@dasexperten.de` automatically sends back from `emea@dasexperten.de`
without the caller needing to specify it explicitly.

### `INVALID_FROM` error response

```json
{
  "ok": false,
  "success": false,
  "action": "send",
  "error": "INVALID_FROM",
  "allowed": [
    "eurasia@dasexperten.de",
    "emea@dasexperten.de",
    "export@dasexperten.de",
    "marketing@dasexperten.de",
    "sales@dasexperten.de",
    "support@dasexperten.de"
  ]
}
```

`action` reflects the action that was called (`"send"`, `"reply"`, or
`"reply_all"`). No email is sent. No log row is written.

---

## Action details

### `send` — new outgoing email

Sends a brand-new email (no existing thread).

**Required fields:**
- `recipient` — target email address
- `subject` — email subject line
- `body_html` and/or `body_plain` — at least one must be present

**Optional fields:**
- `from` — see `from` parameter section above
- `attachment_link` — Drive URL appended as "Open attachment" link in body
- `context` — caller-supplied context string; written to Reporter Doc header
- `draft_only` — `true` creates a draft instead of sending

**Success response:**
```json
{
  "success": true,
  "action": "send",
  "mode": "new",
  "message_id": "...",
  "thread_id": "...",
  "archive_doc_link": "https://docs.google.com/...",
  "archive_doc_id": "...",
  "archive_error": null,
  "error": null
}
```

**Draft response** (when `draft_only: true`):
```json
{
  "success": true,
  "action": "send",
  "mode": "draft",
  "draft_id": "...",
  "draft_link": "https://mail.google.com/mail/u/0/#drafts/..."
}
```

---

### `reply` — reply to one sender in existing thread

**Required fields:**
- `thread_id`
- `body_html` and/or `body_plain`

**Optional fields:**
- `from` — see `from` parameter section above; auto-detected if omitted
- `attachment_link`, `context`, `draft_only`, `in_reply_to_message_id`

**Success response:**
```json
{
  "success": true,
  "action": "reply",
  "mode": "reply",
  "message_id": "...",
  "thread_id": "...",
  "archive_doc_link": "...",
  "archive_doc_id": "...",
  "archive_error": null,
  "error": null
}
```

---

### `reply_all` — reply to all (To + CC) in existing thread

Same contract as `reply`. The `from` field is auto-detected from the thread
recipients the same way. All To and CC from the last message receive the reply.

**Required fields:** `thread_id`, `body_html` or `body_plain`

**Optional fields:** `from`, `attachment_link`, `context`, `draft_only`,
`in_reply_to_message_id`

---

### `find` — Gmail search

**Required fields:**
- `query` — Gmail search syntax (operators: `from:`, `to:`, `subject:`,
  `is:unread`, `has:attachment`, date ranges, labels, free text)

**Optional fields:**
- `max_results` — integer, default `10`, hard cap `50`

**Success response:**
```json
{
  "success": true,
  "action": "find",
  "query": "...",
  "total_found": 3,
  "threads": [
    {
      "thread_id": "...",
      "subject": "...",
      "last_message_from": "...",
      "last_message_snippet": "...",
      "message_count": 4,
      "has_attachments": false,
      "last_message_date": "2026-04-30T09:12:00.000Z",
      "participants": ["..."]
    }
  ]
}
```

---

### `get_thread` — full chronological thread history

**Required fields:** `thread_id`

Returns all messages oldest-first with full plain-text bodies, participant
list, and attachment filenames.

---

### `download_attachment` — save attachment to Drive

**Required fields:**
- `message_id`
- `attachment_name` (filename string) **or** `attachment_index` (zero-based integer)

**Optional fields:**
- `target_subfolder_override` — folder name in My Drive; defaults to
  `Inbox Attachments/<sanitized_sender>/`

**Success response:**
```json
{
  "success": true,
  "action": "download_attachment",
  "file_id": "...",
  "file_name": "contract_v3.pdf",
  "file_link": "https://drive.google.com/...",
  "saved_to_folder": "Inbox Attachments/buyer@example.com",
  "sender": "Buyer Name <buyer@example.com>",
  "size_bytes": 204800,
  "mime_type": "application/pdf"
}
```

---

### `archive` — write large text to Drive without sending email

Saves a Markdown or plain-text file to `REPORTER_FOLDER_ID/<archive_label>/`.
Use for search transcripts, analysis exports, and any operation that needs a
Drive trail without sending mail. Bypasses Reporter's DocumentApp limit
(Reporter fails on bodies > ~80 KB).

**Required fields:**
- `title` — document title (also used as filename prefix)
- `body_plain` and/or `body_html`

**Optional fields:**
- `archive_label` — subfolder name, default `system-archive`
- `context` — included as a block-quote header line in the file
- `mime_type` — default `text/markdown`; use `text/plain` for plain text

---

## Error codes

| Error | Cause | Response |
|---|---|---|
| `Missing required field: X` | Caller omitted a required param | `success: false`, `error: "Missing required field: X"` |
| `Invalid or inaccessible thread_id` | Thread not found or no permissions | `success: false`, error string |
| `INVALID_FROM` | `from` value not in ALLOWED_SENDER_INBOXES | `ok: false`, `success: false`, `error: "INVALID_FROM"`, `allowed: [...]` |
| `Cannot access REPORTER_FOLDER_ID` | Script property misconfigured | Email still sent; `archive_error` set, `success: true` |
| Apps Script timeout (> 6 min) | Scope too large | Reduce `max_results` or paginate |
| Daily Gmail quota exceeded | Too many sends | HALT; quota resets at midnight Pacific |
| Auth revoked | Owner removed permissions | HALT; ask Aram to re-run `authorize()` |
