# Emailer V3 — Manual Setup Steps

After Claude Code finishes the V3 refactor, run through this list once.

## TL;DR for Aram (top-of-file checklist)

1. `cd arams-db/emailer/`
2. `clasp create --type webapp --title "Emailer"`
3. `clasp push` (uploads `src/Main.gs`, `src/actions/*.gs`, `src/lib/*.gs`, etc.)
4. **Enable Gmail Advanced Service** — in Apps Script editor, Services panel
   (left sidebar) → Add a service → Gmail API v1 → Add. **Required** for
   `createDraft` (used by `draft_only:true`).
5. Create Google Sheet for logging (e.g. `Emailer Log`), copy ID from URL.
6. Locate two existing Drive folders, copy their IDs from the URL bar:
   - **Reporter folder** (per-recipient archives)
   - **Inbox Attachments folder** (per-sender inbound files)
   - Aram's known ID: **`1SYEckKOUSm9JPAIDq4fnn3tP81BOewva`** is the
     Inbox Attachments folder. Set it as-is.
7. Apps Script editor → Project Settings → Script properties → add **all four**:

   | Key                            | Value                                                |
   |--------------------------------|------------------------------------------------------|
   | `LOG_SHEET_ID`                 | Sheet ID from step 5 — **REQUIRED**                  |
   | `REPORTER_FOLDER_ID`           | Reporter folder ID from step 6 — **REQUIRED**        |
   | `INBOX_ATTACHMENTS_FOLDER_ID`  | `1SYEckKOUSm9JPAIDq4fnn3tP81BOewva` — **REQUIRED**   |
   | `DEFAULT_DRIVE_FOLDER`         | Legacy V1 fallback folder name — optional/back-compat |

8. Deploy as web app (Apps Script editor → Deploy → New deployment → Web app
   → Execute as: me, Who has access: Anyone with the link). Copy the URL.
9. Smoke-test using the six `curl` commands at the bottom of this file.

Total time: 25–30 min for a first-time clasp setup, 5 min for redeploys.

---

## 1. Working directory

```bash
cd arams-db/emailer/
```

## 2. Install / authorise clasp

```bash
npm install -g @google/clasp
clasp login
```

Sign in with the Google account that owns Aram's Gmail / Drive integrations.

## 3. Create the Apps Script project

```bash
clasp create --type webapp --title "Emailer" --rootDir ./src
```

## 4. Push the code

```bash
clasp push
```

clasp uploads everything under `./src/` including the `actions/` and `lib/`
subfolders (Apps Script keeps the relative paths in display).

## 5. Enable Gmail Advanced Service (mandatory for drafts)

Without this step, `draft_only:true` will fail at runtime with
`ReferenceError: Gmail is not defined`.

1. Open the project in the Apps Script editor (`clasp open`).
2. Left sidebar → **Services** → **+ Add a service**.
3. Pick **Gmail API**, version `v1`, identifier stays `Gmail`.
4. Click Add.

Confirmation: `appsscript.json` already declares the service in
`dependencies.enabledAdvancedServices`, but the editor still requires the
explicit enablement above.

## 6. Create the logging Google Sheet

Create a new Sheet (e.g. `Emailer Log`). Copy the ID from the URL:
`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`. The V3 header row
auto-populates on first send. Existing V2 sheets are tolerated (the logger
appends only the columns that exist).

## 7. Locate the two Drive folders and copy their IDs

### Reporter folder (per-recipient archives)

Open the folder Aram uses for outgoing-mail archives in Drive UI, then look
at the URL: `https://drive.google.com/drive/folders/<REPORTER_FOLDER_ID>`.
Copy the ID.

### Inbox Attachments folder (per-sender inbound files)

The known ID is `1SYEckKOUSm9JPAIDq4fnn3tP81BOewva`. Use it as-is — do not
substitute. Per-sender subfolders (e.g. `supplier@de.example/`) are
auto-created on the first download from that sender.

## 8. Configure script properties

Apps Script editor → Project Settings → Script properties → Add property
(repeat for each row):

| Key                            | Value                                                |
|--------------------------------|------------------------------------------------------|
| `LOG_SHEET_ID`                 | Sheet ID from step 6                                 |
| `REPORTER_FOLDER_ID`           | Reporter folder ID from step 7                       |
| `INBOX_ATTACHMENTS_FOLDER_ID`  | `1SYEckKOUSm9JPAIDq4fnn3tP81BOewva`                  |
| `DEFAULT_DRIVE_FOLDER`         | (legacy V1, optional)                                |

## 9. Deploy as web app

In the Apps Script editor:

- Deploy → New deployment.
- Type: **Web app**.
- Description: `Emailer v3`.
- Execute as: **Me**.
- Who has access: **Anyone with the link**.
- Click Deploy. Authorise all scopes when prompted (Gmail send / read /
  modify / compose, Drive, Documents, Spreadsheets).
- Copy the deployment URL.

## 10. Smoke-test all six actions

Replace `<DEPLOYMENT_URL>` with your URL. Replace test inboxes / IDs as
appropriate.

### a) `send` — new email

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "send",
    "recipient": "your-test-inbox@gmail.com",
    "subject": "Emailer V3 smoke test",
    "body_html": "<p>Hello from Emailer V3.</p>",
    "body_plain": "Hello from Emailer V3.",
    "context": "Smoke test send."
  }'
```

Expect `success: true`, `archive_status: "ok"`, `archive_doc_link` populated.

### b) `send` with `draft_only:true`

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "send",
    "draft_only": true,
    "recipient": "your-test-inbox@gmail.com",
    "subject": "Emailer V3 — draft test",
    "body_html": "<p>This should land in Drafts, not Inbox.</p>"
  }'
```

Expect `mode: "draft"`, `draft_id` populated, `archive_status: "skipped"`.
Open Gmail → Drafts to confirm.

### c) `reply` — first run scenario (a) above, copy the `thread_id`, then:

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "reply",
    "thread_id": "PASTE_THREAD_ID_FROM_SCENARIO_A",
    "body_html": "<p>This reply should land inside the same thread.</p>"
  }'
```

Confirm in Gmail that the reply appears in the same thread (not as a new
conversation).

### d) `reply_all` — works only when the original thread has CC recipients

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "reply_all",
    "thread_id": "PASTE_THREAD_ID_WITH_CCs",
    "body_html": "<p>Looping everyone in.</p>"
  }'
```

### e) `find`

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "find",
    "query": "from:your-test-inbox@gmail.com",
    "max_results": 5
  }'
```

Expect a JSON list of threads with `thread_id`, `subject`, `last_message_snippet`, etc.

### f) `get_thread`

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "get_thread",
    "thread_id": "PASTE_THREAD_ID_FROM_FIND_RESPONSE"
  }'
```

### g) `download_attachment`

First, send yourself an email with an attachment (any file). Run `find` /
`get_thread` to grab the `message_id` and `attachment_names[0]`, then:

```bash
curl -sS -X POST "<DEPLOYMENT_URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "download_attachment",
    "message_id": "PASTE_MESSAGE_ID",
    "attachment_name": "PASTE_FILENAME"
  }'
```

Expect `success: true`, `file_link` populated, and the file appearing in
`Inbox Attachments / <sender@email>/` in Drive.

## 11. Failure-mode probes

- **Unknown action**:
  ```bash
  curl -sS -X POST "<DEPLOYMENT_URL>" -H 'Content-Type: application/json' \
    -d '{"action":"nope"}'
  ```
  → `{ "success": false, "error": "Unknown action: nope" }`

- **Missing required field**:
  ```bash
  curl -sS -X POST "<DEPLOYMENT_URL>" -H 'Content-Type: application/json' \
    -d '{"action":"send","subject":"x","body_html":"<p>x</p>"}'
  ```
  → `{ "success": false, "error": "Missing required field: recipient" }`

- **Reporter fail-safe**: temporarily set `REPORTER_FOLDER_ID` to a bogus
  string and run a `send`. Email goes through, response shows
  `archive_status: "failed"` with `archive_error` populated. Restore the
  correct ID afterwards.

## 12. Versioning

After every code change:

```bash
clasp push
clasp deploy --description "vN: <what changed>"
```

The Web app URL stays stable if you redeploy under the same deployment ID.
