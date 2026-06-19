# emailer — response schema

Every action returns a JSON object with `success: true|false` plus action-specific fields. This file documents the shape per action so callers know what to parse without guessing.

Common to every response:
- `success` — boolean
- `action` — echoed back from the request (some failure modes set this to `null`)
- `error` — `null` on success, error string on failure

`result_summary` is a short human-readable line included by most actions for the operations log.

---

## 1. send — email sent

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
  "result_summary": "Email sent to buyer@vn-distrib.example",
  "error": null
}
```

`archive_doc_link` / `archive_doc_id` come from Reporter (post-send Doc archive). On `archive_error` the email still went through — Reporter is non-fatal.

## 2. send — draft mode

```json
{
  "success": true,
  "action": "send",
  "mode": "draft",
  "draft_id": "r-ABcDeFgHiJkLmNoP",
  "draft_link": "https://mail.google.com/mail/u/0/#drafts/r-ABcDeFgHiJkLmNoP",
  "message_id": null,
  "thread_id": null,
  "result_summary": "Draft created",
  "error": null
}
```

Reporter is skipped in draft mode — nothing was sent yet, the archive runs when a human reviews and sends the draft via the same emailer.

## 3. reply / reply_all — sent

```json
{
  "success": true,
  "action": "reply",
  "mode": "reply",
  "message_id": "186b7a8cabcdef01",
  "thread_id": "186b7a8c1234abcd",
  "archive_doc_link": "https://docs.google.com/document/d/DOC_ID/edit?usp=sharing",
  "archive_doc_id": "DOC_ID",
  "archive_error": null,
  "result_summary": "Reply sent in thread 186b7a8c1234abcd",
  "error": null
}
```

`mode` is `reply` or `reply_all` — same shape, distinguishes how recipients were derived.

## 4. reply with archive_error — non-fatal

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
  "result_summary": "Reply sent in thread 186b7a8c1234abcd",
  "error": null
}
```

The reply landed in Gmail. Only the Drive archive failed. Surface `archive_error` to the operator but do not retry the send.

## 5. find — list of threads

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
    }
  ],
  "result_summary": "Found 3 thread(s)",
  "error": null
}
```

Threads are ordered by Gmail's relevance/recency. `total_found` ≤ `max_results`. `last_message_snippet` is capped at ~150 chars.

## 6. get_thread — full thread

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
  "result_summary": "Retrieved 2 message(s) from thread",
  "error": null
}
```

Messages are ordered chronologically (oldest first). `body_plain` is the full plain-text body, not truncated by the emailer (caller may want to truncate before passing into an LLM).

## 7. download_attachment — file saved

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
  "result_summary": "Attachment saved: contract_v3.pdf",
  "error": null
}
```

File is stored under `INBOX_ATTACHMENTS_FOLDER_ID/<sanitized-sender>/<original-filename>` with sharing set to "anyone with link can view".

## 8. archive — Drive file written

```json
{
  "success": true,
  "action": "archive",
  "archive_doc_link": "https://drive.google.com/file/d/FILE_ID/view?usp=sharing",
  "archive_doc_id": "FILE_ID",
  "archive_label": "gmail-search",
  "archive_filename": "Gmail search · Московская ярмарка моды — 2026-04-27 01:35.md",
  "result_summary": "Archive file created: ...",
  "error": null
}
```

Note: `archive_doc_link` here points at a markdown file in Drive, not a Google Doc. The action uses `DriveApp.createFile` directly to bypass DocumentApp's size limits.

## 9. error envelope — any action

```json
{
  "success": false,
  "action": "send",
  "error": "Missing required field: recipient."
}
```

`action` echoes the requested action; `error` is a single human-readable string. Some failure modes (invalid JSON, unknown action) set `action` to `null`.
