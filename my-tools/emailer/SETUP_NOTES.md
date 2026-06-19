# Emailer V3 — Manual Setup Steps

Action-based Gmail operator. One endpoint, six actions, mandatory archiving.

---

## TL;DR for Aram (do this in order)

1. `cd arams-db/my-tools/emailer/`
2. `clasp create --type webapp --title "Emailer" --rootDir ./src`
3. `clasp push`
4. Apps Script editor → Resources → Advanced Google Services → **Gmail API v1** → Enable.
   (Required for draft creation. Without it, `createDraft` will throw.)
5. Create a Google Sheet (e.g. `Emailer Log`), copy its ID.
6. Create (or locate) the **Reporter** Drive folder, copy its ID from the URL.
7. Deploy as web app (Deploy → New deployment → Web app → Execute as: Me →
   Anyone with the link). Copy the deployment URL.
8. Apps Script editor → Project Settings → Script properties → set all four:

   | Key | Value |
   |---|---|
   | `LOG_SHEET_ID` | Sheet ID from step 5 |
   | `REPORTER_FOLDER_ID` | Drive folder ID from step 6 |
   | `INBOX_ATTACHMENTS_FOLDER_ID` | `1SYEckKOUSm9JPAIDq4fnn3tP81BOewva` |
   | `DEFAULT_DRIVE_FOLDER` | `Emailer Archive` (legacy compat — can keep as-is) |

9. Smoke-test the six curl examples at the bottom of this file.

Total time: ~25 minutes first time, ~5 minutes on subsequent `clasp push` updates.

---

## 1. Working directory

```bash
cd arams-db/my-tools/emailer/
```

All subsequent commands assume this is your CWD.

---

## 2. Install / authorise clasp

```bash
npm install -g @google/clasp
clasp login
```

`clasp login` opens a browser — sign in with the Google account that owns Aram's Gmail and Drive.

---

## 3. Create the Apps Script project

```bash
clasp create --type webapp --title "Emailer" --rootDir ./src
```

This writes `.clasp.json` at the emailer root. Compare with `.clasp.json.example` if anything looks odd.
Do **not** commit `.clasp.json` — it contains the `scriptId`.

---

## 4. Push the code

```bash
clasp push
```

This uploads everything under `src/`, including subfolders `actions/` and `lib/`.

---

## 5. Enable Gmail Advanced Service (REQUIRED for drafts)

In the Apps Script editor (`clasp open`):

- **Resources → Advanced Google Services**
- Find **Gmail API** → toggle **On** → OK
- Click **Save** if prompted.

This enables `Gmail.Users.Drafts.create` used by `createDraft` in GmailSender.gs.
Without it, any action with `draft_only: true` will fail.

---

## 6. Create the logging Google Sheet

1. Create a new Google Sheet named `Emailer Log` (or any name).
2. Copy the ID from the URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.
3. Headers auto-populate on the first operation. No manual setup required.

---

## 7. Set up the Reporter Drive folder

1. Open Google Drive.
2. Create a folder named `Reporter` (or any name you prefer).
3. Open the folder and copy the ID from the URL:
   `https://drive.google.com/drive/folders/<FOLDER_ID>`
4. Set `REPORTER_FOLDER_ID` = `<FOLDER_ID>` in Script Properties (step 8).

Per-recipient subfolders (e.g. `buyer@vn-distrib.example/`) are created automatically inside this folder on the first send to each recipient.

---

## 8. Configure Script Properties

Apps Script editor → Project Settings → Script properties → Add all four:

| Key | Value | Notes |
|---|---|---|
| `LOG_SHEET_ID` | `<your-sheet-id>` | REQUIRED — from step 6 |
| `REPORTER_FOLDER_ID` | `<your-reporter-folder-id>` | REQUIRED — from step 7 |
| `INBOX_ATTACHMENTS_FOLDER_ID` | `1SYEckKOUSm9JPAIDq4fnn3tP81BOewva` | REQUIRED — set exactly this value |
| `DEFAULT_DRIVE_FOLDER` | `Emailer Archive` | Legacy compat — kept as-is |

**`INBOX_ATTACHMENTS_FOLDER_ID` is `1SYEckKOUSm9JPAIDq4fnn3tP81BOewva`** — set it exactly as shown.
Per-sender subfolders (e.g. `supplier@de.example/`) are created automatically on the first download.

---

## 9. Deploy as web app

In the Apps Script editor:

- **Deploy → New deployment**
- Type: **Web app**
- Description: `Emailer V3`
- Execute as: **Me**
- Who has access: **Anyone with the link**
- Click **Deploy**. Authorise all scopes when prompted (Gmail, Drive, Docs, Sheets, Gmail Advanced).
- Copy the **deployment URL** — this is what external callers POST to.

Add `EMAILER_URL` to GitHub Secrets with the deployment URL for use in workflows.

---

## 10. Smoke-test (six curl examples)

Replace `<DEPLOYMENT_URL>` with your deployment URL from step 9.

### Action: send

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "send",
    "recipient": "your-test-inbox@gmail.com",
    "subject": "Emailer V3 smoke test",
    "body_html": "<p>Hello from Emailer V3.</p>",
    "context": "Smoke test — delete this message."
  }'
```

Expected: `success: true`, `message_id`, `thread_id`, `archive_doc_link` populated.

### Action: reply

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "reply",
    "thread_id": "PASTE_THREAD_ID_FROM_SEND_RESPONSE",
    "body_html": "<p>This is a reply inside the same thread.</p>"
  }'
```

### Action: reply_all (draft)

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "reply_all",
    "thread_id": "PASTE_THREAD_ID_FROM_SEND_RESPONSE",
    "body_html": "<p>Draft reply-all for review.</p>",
    "draft_only": true
  }'
```

Expected: `mode: "draft"`, `draft_id`, `draft_link`. Open the link in Gmail to verify.

### Action: find

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "find",
    "query": "subject:\"Emailer V3 smoke test\"",
    "max_results": 5
  }'
```

Expected: `total_found >= 1`, threads array with one entry.

### Action: get_thread

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "get_thread",
    "thread_id": "PASTE_THREAD_ID_FROM_SEND_RESPONSE"
  }'
```

Expected: `message_count >= 1`, `messages` array with full `body_plain`.

### Action: download_attachment

First send yourself an email with an attachment, then:

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "download_attachment",
    "message_id": "PASTE_MESSAGE_ID",
    "attachment_name": "filename.pdf"
  }'
```

Expected: `file_id`, `file_link`, `saved_to_folder` = `"Inbox Attachments / sender@example.com"`.

---

## 11. How an orchestrator workflow calls the emailer

Pattern identical to existing `auto-reply.yml` / `auto-reply-wb.yml` in this repo:

```python
import os, json, urllib.request

EMAILER_URL = os.environ['EMAILER_URL']

def call_emailer(action_payload):
    req = urllib.request.Request(
        EMAILER_URL,
        data=json.dumps(action_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

# Example: send
result = call_emailer({
    'action': 'send',
    'recipient': 'buyer@vn-distrib.example',
    'subject': 'Das Experten — Q2 deck',
    'body_html': '<p>Dear partner...</p>',
    'context': 'Vietnam pharmacy chain.'
})
```

---

## 12. Versioning

After every code change:

```bash
clasp push
clasp deploy --description "V3.x: <what changed>"
```

`clasp deploy` creates a new immutable version. The web app URL stays stable if you redeploy under the same deployment ID.
