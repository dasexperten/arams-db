# SETUP_NOTES.md — Orchestrator Deploy Guide

Step-by-step instructions to go from "files exist in GitHub" to
"orchestrator is live and receiving Aram's Telegram messages".

Estimated time: 30–45 minutes on first run.

---

## Prerequisites

- Google account: `daxexperten@gmail.com`
- Emailer already deployed (EMAILER_EXEC_URL known)
- Anthropic API key available
- Telegram account for @BotFather

---

## Step 1: Create Telegram bot

1. Open Telegram, search for **@BotFather**
2. Send `/newbot`
3. Name: `Das Experten Orchestrator`
4. Username: `dasexperten_orchestrator_bot` (or any available variant)
5. BotFather replies with the **bot token** — save it.
   Format: `1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi`

6. Get your Telegram **chat ID**:
   - Send any message to the new bot
   - Open in browser:
     `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Find `"chat":{"id":<NUMBER>}` — that number is `ARAM_TELEGRAM_CHAT_ID`

---

## Step 2: Create Google Drive folders

1. Go to [drive.google.com](https://drive.google.com) as `daxexperten@gmail.com`
2. Create folder: `Orchestrator_State`
3. Inside it, create two subfolders: `active` and `archived`
4. Set permissions: **Restricted** — only you. No shared links.
5. Copy the folder ID of `Orchestrator_State` from the URL:
   `https://drive.google.com/drive/folders/<FOLDER_ID>`
   → Save as `ORCHESTRATOR_STATE_FOLDER_ID`

---

## Step 3: Create Google Sheet for index

1. Go to [sheets.google.com](https://sheets.google.com)
2. Create a new spreadsheet: `Orchestrator_Workflows`
3. Rename the default sheet tab to `Workflows`
4. Copy the spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`
   → Save as `ORCHESTRATOR_INDEX_SHEET_ID`

The orchestrator will auto-create column headers on first run.

---

## Step 4: Create Apps Script project

1. Go to [script.google.com](https://script.google.com)
2. Click **New project**
3. Rename project to `Orchestrator`
4. In the editor, delete the default `function myFunction() {}` placeholder

---

## Step 5: Enable Gmail Advanced Service

1. In Apps Script editor, click **Services** (+ icon in left sidebar)
2. Find **Gmail API** → click Add
3. Also add: **Drive API** (if not already present)

---

## Step 6: Paste the bundle

1. Open `agents/orchestrator/backend/orchestrator-bundle.gs` in GitHub
2. Copy the entire file contents
3. Paste into the Apps Script editor (replace the empty editor)
4. Click **Save** (Ctrl+S or Cmd+S)

---

## Step 7: Set Script Properties

1. In Apps Script editor: **Project Settings** (gear icon) → **Script Properties**
2. Add the following properties one by one:

| Property name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from Step 1 (e.g. `1234567890:ABC...`) |
| `ARAM_TELEGRAM_CHAT_ID` | Your chat ID from Step 1 (e.g. `987654321`) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-...`) |
| `EMAILER_EXEC_URL` | Deployed emailer Web App URL (`https://script.google.com/macros/s/.../exec`) |
| `ORCHESTRATOR_STATE_FOLDER_ID` | Drive folder ID from Step 2 |
| `ORCHESTRATOR_INDEX_SHEET_ID` | Sheet ID from Step 3 |

---

## Step 8: Run authorize()

1. In the Apps Script editor, select function `authorize` from the dropdown
2. Click **Run** ▶
3. A permissions dialog will appear — click **Review permissions**
4. Choose `daxexperten@gmail.com`
5. Click **Allow** (you may see "Google hasn't verified this app" — click Advanced → Go to Orchestrator)

This grants the script access to Drive, Sheets, Gmail, UrlFetch, and LockService.

---

## Step 9: Deploy as Web App

1. In Apps Script editor: **Deploy** → **New deployment**
2. Click the gear icon next to "Type" → select **Web app**
3. Settings:
   - **Description:** `Orchestrator v1.0`
   - **Execute as:** `Me (daxexperten@gmail.com)`
   - **Who has access:** `Anyone` ← required for Telegram webhook
4. Click **Deploy**
5. Copy the **Web App URL** — format:
   `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`
   → Save as `ORCHESTRATOR_EXEC_URL`

---

## Step 10: Register Telegram webhook

Open this URL in your browser (replace placeholders):

```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<ORCHESTRATOR_EXEC_URL>
```

Expected response:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

To verify the webhook is active:
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo
```

---

## Step 11: Set up time triggers

1. In Apps Script editor, select function `setupTimeTriggers` from the dropdown
2. Click **Run** ▶
3. Check the console output — should see:
   `orchestrator: time triggers registered (5× daily triage + heartbeat/30min)`
4. Verify in **Triggers** (clock icon in left sidebar) — should see 6 triggers:
   - 5× `runDailyInboxTriage` (Mon–Fri)
   - 1× `heartbeatCheck_` (every 30 min)

---

## Step 12: Smoke test

1. In Telegram, send the following message to `@dasexperten_orchestrator_bot`:
   ```
   утренняя почта
   ```
2. Expected response within 5 seconds:
   ```
   🤖 ORCHESTRATOR — Inbox/Triage
   Step 1/10
   Сканирую 4 inbox…
   wf_id: INBOX_TRIAGE_2026_...
   ```
3. The workflow will proceed through the 10 steps, pausing at Step 7 for your approval.

If no response after 10 seconds:
- Check Apps Script **Executions** log for errors
- Verify webhook is set correctly (Step 10)
- Verify TELEGRAM_BOT_TOKEN and ARAM_TELEGRAM_CHAT_ID in Script Properties

---

## Updating the bundle after code changes

When `orchestrator-bundle.gs` is updated in GitHub:

1. Copy the new file contents from GitHub
2. In Apps Script editor: select all (Ctrl+A) → paste
3. Save
4. **Deploy → Manage deployments → Edit** (pencil icon on current deployment)
5. Change version to **New version**
6. Click **Deploy**

The webhook URL stays the same — no need to re-register it.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| No Telegram response | Apps Script Executions log for errors; webhook URL correct? |
| `Missing Script Property: X` | Script Properties tab — all 6 properties set? |
| `DriveApp: Folder not found` | `ORCHESTRATOR_STATE_FOLDER_ID` points to correct folder? |
| `callEmailer_: tool error` | Emailer Web App deployed and responding? Test EMAILER_EXEC_URL directly |
| `callSkill_: bad Claude response` | ANTHROPIC_API_KEY valid? Check Anthropic dashboard |
| Germany gate fires unexpectedly | Review draft in state JSON — check the matched phrase |
| Workflow stuck in AWAITING_INPUT | heartbeatCheck_ running? Check Triggers; or send message to bot to resume |
| Apps Script quota exceeded (6 min) | Inbox with very large threads; reduce `max_results` or `lookback_hours` param |
| GitHub 401 on auto-merge | GITHUB_PAT expired — update Script Property + GITHUB_PAT_ISSUED_DATE |
| GitHub 403 on auto-merge | Token scope too narrow — recreate PAT with Contents+PR+Metadata write |
| `GITHUB_REPO missing` | Add Script Property `GITHUB_REPO` = `dasexperten/arams-db` |
| Auto-merge PR stays open | Repo setting "Allow auto-merge" must be enabled in GitHub → Settings → General |
| `testGitHubConnection` returns 404 | GITHUB_REPO value is wrong — check owner/repo spelling |

---

## Level 3 GitHub setup (auto-merge pipeline)

Follow these steps **after** completing the base Level 1 setup (Steps 1–12 above).

---

### Step 13: Create GitHub fine-grained Personal Access Token

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Settings:
   - **Token name:** `Das Experten Orchestrator`
   - **Expiration:** 90 days (set a calendar reminder at 80 days to rotate)
   - **Repository access:** Only selected repositories → `dasexperten/arams-db`
   - **Repository permissions:**
     - **Contents:** Read and write
     - **Pull requests:** Read and write
     - **Metadata:** Read (auto-selected)
4. Click **Generate token** — copy the token value immediately (shown only once).
   Format: `github_pat_...`

---

### Step 14: Add GitHub Script Properties

In Apps Script editor → **Project Settings → Script Properties**, add:

| Property name | Value |
|---|---|
| `GITHUB_PAT` | Token from Step 13 (e.g. `github_pat_11ABC...`) |
| `GITHUB_REPO` | `dasexperten/arams-db` |
| `GITHUB_PAT_ISSUED_DATE` | Today's date in ISO format (e.g. `2026-04-27`) |

---

### Step 15: Enable auto-merge on the repository

1. Go to **github.com/dasexperten/arams-db → Settings → General**
2. Scroll to **Pull Requests** section
3. Check **Allow auto-merge**
4. Save

This is required for the orchestrator to merge PRs programmatically via API.

---

### Step 16: Test GitHub connection

1. In Apps Script editor, select function `testGitHubConnection` from the dropdown
2. Click **Run** ▶
3. Expected console output:
   ```
   GitHub connection OK. Repo: dasexperten/arams-db | Default branch: main
   ```
4. If you see 401 — token is wrong. If 403 — scope issue. If 404 — GITHUB_REPO is wrong.

---

### Step 17: Register Level 3 time triggers

1. In Apps Script editor, select function `setupTimeTriggers` from the dropdown
2. Click **Run** ▶ (this **replaces** existing triggers — safe to re-run)
3. Expected console output:
   ```
   orchestrator: time triggers registered (5× daily triage + heartbeat/30min + auto-detect/daily + token-reminder/daily)
   ```
4. Verify in **Triggers** (clock icon) — should now see 8 triggers total:
   - 5× `runDailyInboxTriage` (Mon–Fri)
   - 1× `heartbeatCheck_` (every 30 min)
   - 1× `weeklyAutoDetectionScan` (daily 23:00 UTC = 02:00 Moscow)
   - 1× `tokenRotationReminder` (daily 06:00 UTC = 09:00 Moscow)

---

### Step 18: Re-deploy Web App

After adding the Level 3 code to the bundle:

1. **Deploy → Manage deployments → Edit** (pencil icon on current deployment)
2. Change version to **New version**
3. Click **Deploy**

The webhook URL stays the same — no need to re-register it.

---

### Step 19: Smoke test Level 3

To trigger a test auto-detection notification manually:

1. In Apps Script editor, select `weeklyAutoDetectionScan` and click **Run**
2. If you have at least 3 completed ad-hoc workflows in the Sheet, you should receive a Telegram message with 4 buttons.
3. Tap **[✅ Approve & auto-merge]** — the orchestrator should:
   - Create branch `auto-templates/<wf_id>-<slug>`
   - Commit the template file
   - Open and merge a PR
   - Send you a Telegram with merge SHA + PR link
4. Verify the PR and merge in GitHub.

---

### Step 20: Configure Drive pending-templates folder

The orchestrator saves template drafts to `Orchestrator_State/pending-templates/`.
This subfolder is created automatically on first use — no manual setup needed.

If the folder gets cluttered: any `.md` file older than 90 days without Aram approval
is automatically trashed by the scheduled cleanup (same trigger as heartbeat).

---

## Security reminders

- `ARAM_TELEGRAM_CHAT_ID` is the authorization gate — only updates from this chat ID are processed
- Drive state folder must remain **Restricted** — never enable public link sharing
- Never add credentials to the bundle source code — always Script Properties
- After sharing your bot token in any chat, regenerate it via @BotFather: `/revoke`
