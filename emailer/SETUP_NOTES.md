# Emailer — Manual Setup Steps

After Claude Code finishes scaffolding, run through this list once. Variant C:
the emailer is a thin sender, so the setup is short — no skill loading, no
Anthropic API key inside Apps Script.

## TL;DR for Aram (top-of-file checklist)

1. `cd arams-db/emailer/`
2. `clasp create --type webapp --title "Emailer"`
3. `clasp push`
4. Create a Google Sheet (e.g. `Emailer Log`), copy its ID.
5. Deploy as web app (Apps Script editor → Deploy → New deployment →
   Web app → Execute as: me, Who has access: Anyone with the link).
   Copy the deployment URL.
6. Apps Script editor → Project Settings → Script properties → add:
   - `LOG_SHEET_ID`    = sheet ID from step 4
   - `ARCHIVE_FOLDER`  = e.g. `Emailer Archive` (default if unset)
7. Smoke-test with the three sample `curl` commands at the bottom of this file.

That's it. Total time: ~20 minutes for a first-time clasp setup, ~5 minutes
on subsequent updates (`clasp push` only).

---

## 1. Working directory

```bash
cd arams-db/emailer/
```

All subsequent commands assume this is your CWD.

## 2. Install / authorise clasp

```bash
npm install -g @google/clasp
clasp login
```

`clasp login` opens a browser window — sign in with the Google account that
already owns Aram's Gmail / Drive integrations.

## 3. Create the Apps Script project

```bash
clasp create --type webapp --title "Emailer" --rootDir ./src
```

This writes `.clasp.json` at the emailer root. Compare with
`.clasp.json.example` if anything looks odd. Do **not** commit `.clasp.json` —
it contains the `scriptId`.

## 4. Push the code

```bash
clasp push
```

This uploads:

- `src/Main.gs`
- `src/GmailSender.gs`
- `src/ThreadResolver.gs`
- `src/DriveManager.gs`
- `src/Reporter.gs`
- `src/Logger.gs`
- `appsscript.json` (manifest)

## 5. Create the logging Google Sheet

1. Create a new Google Sheet named `Emailer Log` (or anything you prefer).
2. Copy the ID from the URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.
3. Headers will auto-populate on the first send. No manual setup required.

## 6. Deploy as web app

In the Apps Script editor (`clasp open` opens it):

- Deploy → New deployment.
- Type: **Web app**.
- Description: `Emailer v1`.
- Execute as: **Me**.
- Who has access: **Anyone with the link** (required for programmatic callers
  like GitHub Actions, n8n, dasoperator).
- Click Deploy. Authorise the Gmail / Drive / Docs / Sheets scopes when prompted.
- Copy the **deployment URL** — that is the endpoint external callers hit.

## 7. Configure script properties

Apps Script editor → Project Settings → Script properties → Add property:

| Key              | Value                                       |
|------------------|---------------------------------------------|
| `LOG_SHEET_ID`   | the Sheet ID from step 5                    |
| `ARCHIVE_FOLDER` | folder name in Drive (default if unset: `Emailer Archive`) |

## 8. Smoke-test the three scenarios

Replace `<URL>` with the deployment URL from step 6.

### Scenario A — new email with pre-made attachment

```bash
curl -sS -X POST "<URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "Send Q2 distributor deck to Vietnam buyer",
    "recipient": "your-test-inbox@gmail.com",
    "subject": "Das Experten — Q2 distributor deck",
    "body_html": "<p>Dear partner,</p><p>Please find the deck attached.</p>",
    "body_text": "Dear partner,\n\nPlease find the deck attached.",
    "attachment_link": "https://drive.google.com/file/d/EXISTING_ID/view",
    "context": "Vietnam pharmacy chain, follow-up to last week call."
  }'
```

Expected response: `success: true`, plus `message_id`, `thread_id`,
`archive_doc_link`. Open the archive Doc link to confirm contents.

### Scenario B — new email, content drafted upstream

```bash
curl -sS -X POST "<URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "Reactivate Polish wholesaler",
    "recipient": "your-test-inbox@gmail.com",
    "subject": "Возвращаем диалог по SCHWARZ",
    "body_html": "<p>This text would be drafted by the upstream personizer workflow.</p>",
    "context": "Cold reactivate after 3 months of silence."
  }'
```

### Scenario C — reply inside existing Gmail thread

First, run Scenario A and copy the `thread_id` from the response. Then:

```bash
curl -sS -X POST "<URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "Reply to Vietnam buyer about MOQ",
    "thread_id": "PASTE_THREAD_ID_HERE",
    "body_html": "<p>Confirming MOQ 1 pallet, lead time 4 weeks, FOB Riga.</p>",
    "body_text": "Confirming MOQ 1 pallet, lead time 4 weeks, FOB Riga.",
    "context": "Buyer pushed back on MOQ in last reply."
  }'
```

Confirm in Gmail that the reply lands **inside the same thread** (not as a
new conversation). If it ever lands as a separate thread, something is wrong
with `replyToThread` — file an issue and do not ship.

## 9. How an orchestrator workflow calls the emailer

Pattern matches existing `auto-reply.yml` / `auto-reply-wb.yml`. Skeleton in
Python (e.g. for a future `cmd_send_email` in `cli.py`):

```python
import os, json, urllib.request, anthropic

EMAILER_URL = os.environ['EMAILER_URL']

def send_via_emailer(task, recipient, subject, body_html, attachment_link=None,
                    thread_id=None, context=''):
    payload = {
        'task': task,
        'subject': subject,
        'body_html': body_html,
        'context': context,
    }
    if thread_id:
        payload['thread_id'] = thread_id
    else:
        payload['recipient'] = recipient
    if attachment_link:
        payload['attachment_link'] = attachment_link

    req = urllib.request.Request(
        EMAILER_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

def draft_with_skill(skill_name, brief, context):
    skill_text = open(f'my-skills/{skill_name}/SKILL.md', encoding='utf-8').read()
    client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])
    msg = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=2000,
        system=skill_text,
        messages=[{'role': 'user', 'content': f'Brief: {brief}\nContext: {context}'}],
    )
    return msg.content[0].text
```

Add the deployment URL to GitHub Secrets as `EMAILER_URL`, write a workflow
that runs on cron / dispatch, and use both helpers above. The skills load
straight from the repo (no Apps Script involved).

## 10. Versioning

After every code change:

```bash
clasp push
clasp deploy --description "vN: <what changed>"
```

`clasp deploy` creates a new immutable version. The Web app URL stays the
same if you redeploy under the existing deployment ID.
