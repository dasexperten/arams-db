# emailer — payload examples

JSON payloads to POST to the emailer Apps Script endpoint (`EMAILER_URL`). Every request is `Content-Type: application/json`. The endpoint redirects with `302` to `script.googleusercontent.com` — agents must follow it (see `payload-examples.md` in any caller's source for the two-step pattern).

## Action surface

| action                | required fields                                              | optional fields                                                            | Reporter / Drive write?           |
|-----------------------|--------------------------------------------------------------|----------------------------------------------------------------------------|-----------------------------------|
| `send`                | `recipient`, `subject`, `body_html` or `body_plain`          | `attachment_link`, `context`, `draft_only`                                 | Yes (Doc archive, not for drafts) |
| `reply`               | `thread_id`, `body_html` or `body_plain`                     | `attachment_link`, `context`, `draft_only`, `in_reply_to_message_id`       | Yes (not for drafts)              |
| `reply_all`           | `thread_id`, `body_html` or `body_plain`                     | `attachment_link`, `context`, `draft_only`, `in_reply_to_message_id`       | Yes (not for drafts)              |
| `find`                | `query`                                                      | `max_results` (default 10, cap 50)                                         | No                                |
| `get_thread`          | `thread_id`                                                  | —                                                                          | No                                |
| `download_attachment` | `message_id`, `attachment_name` or `attachment_index`        | `target_subfolder_override`                                                | No (saves attachment to Drive)    |
| `archive`             | `title`, `body_plain` or `body_html`                         | `archive_label` (default `system-archive`), `context`, `mime_type`         | Yes (markdown file, not Doc)      |

## Universal flag — `draft_only: true`

Applies to `send`, `reply`, `reply_all`. Creates a Gmail draft instead of sending. Reporter is skipped (nothing was sent yet).

---

## Examples

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

Query is plain Gmail search syntax — operators (`from:`, `to:`, `subject:`, `is:unread`, `has:attachment`, date ranges, labels) and free text both work.

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

Attachment can also be targeted by `attachment_index` (zero-based) when names collide.

### 7. archive — write a Drive file without sending mail

```json
{
  "action": "archive",
  "title": "Gmail search · Московская ярмарка моды",
  "body_plain": "# Search results\n\n## Thread 1: ...",
  "archive_label": "gmail-search",
  "context": "gmail-search workflow · 10 thread(s)"
}
```

Saves a `.md` file in `REPORTER_FOLDER_ID/<archive_label>/`. Use this from non-send agents (search transcripts, analysis exports, etc.) so every operation leaves a Drive trail. `mime_type` defaults to `text/markdown`; pass `text/plain` for plain text.

---

## Calling pattern (Python, two-step redirect)

```python
import json
import urllib.error
import urllib.request


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def call_emailer(payload, *, emailer_url):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8"}
    post_req = urllib.request.Request(emailer_url, data=body, headers=headers, method="POST")
    location = None
    try:
        with _OPENER.open(post_req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code in (301, 302, 303, 307, 308):
            location = exc.headers.get("Location")
        else:
            raise
    with urllib.request.urlopen(location, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))
```

Use this verbatim in new agents — it's the same pattern `scripts/gmail_search.py` and `scripts/gmail_quick_reply.py` already use.
