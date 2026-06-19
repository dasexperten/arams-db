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
| `find`                | `query`                                                 | `max_results` (default 10, cap 50)                                                       | R2 upload (per attachment, auto)  |
| `get_thread`          | `thread_id`                                             | —                                                                                        | R2 upload (per attachment, auto)  |
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

**Attachment auto-download:** every attachment in every matching thread is
automatically uploaded to Cloudflare R2 bucket `emailer-attachments`.
Each thread summary contains a flat `attachments_resolved` array (all
attachments across all messages in the thread). Files larger than 25 MB are
skipped (`skipped_reason: "too_large"`). If R2 upload fails for one attachment,
the rest of the response is unaffected — the failed entry carries
`skipped_reason: "upload_failed: ..."`. The existing manual
`download_attachment` action is unchanged.

**R2 key format** (human-readable):

```
inbox/<YYYY-MM-DD>/<sender_clean>_<filename_clean>_<MMDD>_<xxx>.<ext>
```

- `sender_clean` — sanitized display name (lowercased, illegal chars + whitespace
  collapsed to `-`, trimmed, capped at 40 chars). Falls back to the local-part
  of the address when no display name is present.
- `filename_clean` — same sanitization applied to the filename basename
  (extension preserved separately and lowercased).
- `MMDD` — month + day from the message date (matches the date folder).
- `xxx` — first 3 hex characters of the full SHA-256 (4096 distinct values;
  collisions become statistically likely after ~64 distinct files).
- `.ext` — original extension preserved.

Example: `inbox/2022-11-08/honghui-ellen_co_1108_937.pdf`.

**Dedup** is hash-indexed via small `dedup/<full_sha256>` text objects in the
same bucket. The uploader GETs `dedup/<sha256>` first; on hit it reads the
stored key and returns its public URL without re-uploading (so the existing
key — whatever its format — is reused). Only objects uploaded under this
revision and later have dedup entries; older PR #52 keys are not migrated and
will be re-uploaded under the new format on next fetch.

**Success response:**
```json
{
  "success": true,
  "action": "find",
  "query": "...",
  "total_found": 2,
  "threads": [
    {
      "thread_id": "...",
      "subject": "Contract draft v3",
      "last_message_from": "partner@example.com",
      "last_message_snippet": "Please see the attached contract...",
      "message_count": 3,
      "has_attachments": true,
      "last_message_date": "2026-04-30T09:12:00.000Z",
      "participants": ["..."],
      "attachments_resolved": [
        {
          "filename": "contract_v3.pdf",
          "size_bytes": 204800,
          "mime_type": "application/pdf",
          "r2_url": "https://pub-0e2fb2d28ea9408bbaa1bdd64b3bf256.r2.dev/inbox/2026-04-30/partner-example_contract-v3_0430_a1b.pdf",
          "sha256": "a1b2c3...",
          "skipped_reason": null
        },
        {
          "filename": "huge_video.mp4",
          "size_bytes": 41943040,
          "mime_type": "video/mp4",
          "r2_url": null,
          "sha256": null,
          "skipped_reason": "too_large"
        }
      ]
    }
  ]
}
```

---

### `get_thread` — full chronological thread history

**Required fields:** `thread_id`

Returns all messages oldest-first with full plain-text bodies, participant
list, and attachment filenames.

**Attachment auto-download:** same R2 logic, key format, and hash-indexed
dedup as `find`. Each message object gains an `attachments_resolved` array
alongside the existing `attachment_names` array. If the same SHA-256 has
been uploaded before, the existing R2 URL (under whatever historical key
format) is returned without re-uploading.

**Message shape with attachments:**
```json
{
  "message_id": "...",
  "from": "partner@example.com",
  "to": ["emea@dasexperten.de"],
  "cc": [],
  "date": "2026-04-30T09:12:00.000Z",
  "body_plain": "Please see the attached contract...",
  "has_attachments": true,
  "attachment_names": ["contract_v3.pdf"],
  "attachments_resolved": [
    {
      "filename": "contract_v3.pdf",
      "size_bytes": 204800,
      "mime_type": "application/pdf",
      "r2_url": "https://pub-0e2fb2d28ea9408bbaa1bdd64b3bf256.r2.dev/inbox/2026-04-30/partner-example_contract-v3_0430_a1b.pdf",
      "sha256": "a1b2c3...",
      "skipped_reason": null
    }
  ]
}
```

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
| R2 `skipped_reason: "too_large"` | Attachment exceeds 25 MB | Entry in `attachments_resolved` with `r2_url: null`; rest of response unaffected |
| R2 `skipped_reason: "upload_failed: ..."` | Network error or R2 API error | Entry in `attachments_resolved` with error details; rest of response unaffected |
| R2 `skipped_reason: "upload_failed: missing Script Properties: ..."` | One or more of `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_PUBLIC_BASE`, `R2_API_TOKEN` not set | All attachments in that call will carry this reason; fix Script Properties and retry |
