# DEPLOY_CHECKLIST.md

Everything the operator must do to go from "files exist in GitHub"
to "orchestrator is running in production".

Follow `backend/SETUP_NOTES.md` for detailed instructions on each step.

---

## Infrastructure setup

- [ ] **1. Telegram bot created** via @BotFather
  - Bot token saved: `TELEGRAM_BOT_TOKEN`
  - Chat ID obtained via `getUpdates`: `ARAM_TELEGRAM_CHAT_ID`

- [ ] **2. Drive folders created** under `daxexperten@gmail.com`
  - `Orchestrator_State/` folder — **Restricted** ACL, no public sharing
  - `Orchestrator_State/active/` subfolder
  - `Orchestrator_State/archived/` subfolder
  - Folder ID saved: `ORCHESTRATOR_STATE_FOLDER_ID`

- [ ] **3. Google Sheet created**
  - Name: `Orchestrator_Workflows`
  - Tab renamed to `Workflows`
  - Sheet ID saved: `ORCHESTRATOR_INDEX_SHEET_ID`

---

## Apps Script setup

- [ ] **4. Apps Script project created**
  - Project name: `Orchestrator`
  - Account: `daxexperten@gmail.com`

- [ ] **5. Gmail Advanced Service enabled** (Services → Gmail API → Add)

- [ ] **6. Bundle pasted** — full contents of `agents/orchestrator/backend/orchestrator-bundle.gs`

- [ ] **7. All 6 Script Properties set**
  - `TELEGRAM_BOT_TOKEN`
  - `ARAM_TELEGRAM_CHAT_ID`
  - `ANTHROPIC_API_KEY`
  - `EMAILER_EXEC_URL`
  - `ORCHESTRATOR_STATE_FOLDER_ID`
  - `ORCHESTRATOR_INDEX_SHEET_ID`

- [ ] **8. `authorize()` run** — permissions granted for Drive, Sheets, Gmail, UrlFetch

- [ ] **9. Deployed as Web App**
  - Execute as: Me (`daxexperten@gmail.com`)
  - Access: Anyone
  - Web App URL saved: `ORCHESTRATOR_EXEC_URL`

---

## Telegram + trigger wiring

- [ ] **10. Webhook registered**
  ```
  https://api.telegram.org/bot<TOKEN>/setWebhook?url=<ORCHESTRATOR_EXEC_URL>
  ```
  Response: `{"ok":true,...,"description":"Webhook was set"}`

- [ ] **11. `setupTimeTriggers()` run** — 6 triggers created:
  - 5× `runDailyInboxTriage` (Mon–Fri 09:00 Moscow)
  - 1× `heartbeatCheck_` (every 30 min)

---

## Smoke test

- [ ] **12. Smoke test passed**
  - Sent `"утренняя почта"` to bot
  - Received `🤖 ORCHESTRATOR — Inbox/Triage` response within 10 seconds
  - Workflow reached Step 7 (summary with approve buttons)
  - Clicked `[Утвердить все URGENT/HIGH]` — drafts sent
  - Drive `active/` → file created during run → moved to `archived/` on completion
  - Sheet `Workflows` → row written with status `COMPLETED`

---

## Optional but recommended

- [ ] **13. Test heartbeat** — manually set one instance JSON `updated_at` to 25h ago,
  run `heartbeatCheck_()` from editor, verify Telegram reminder arrives

- [ ] **14. Test cancellation** — trigger a workflow, click `[Отменить workflow]`,
  verify `CANCELLED` status in Sheet and archived JSON

- [ ] **15. Update `agents/README.md`** — change orchestrator status from `planned` to `active`

---

## External dependencies summary

| Dependency | Where configured | Operator action |
|---|---|---|
| Telegram Bot Token | Script Property `TELEGRAM_BOT_TOKEN` | Create bot via @BotFather |
| Aram Chat ID | Script Property `ARAM_TELEGRAM_CHAT_ID` | Get from `getUpdates` after messaging bot |
| Anthropic API Key | Script Property `ANTHROPIC_API_KEY` | Generate at console.anthropic.com |
| Emailer URL | Script Property `EMAILER_EXEC_URL` | Already known from emailer deploy |
| Drive State Folder | Script Property `ORCHESTRATOR_STATE_FOLDER_ID` | Create folder in Drive |
| Sheet Index | Script Property `ORCHESTRATOR_INDEX_SHEET_ID` | Create sheet in Sheets |
| Web App URL | Not stored — used only in webhook setup | Obtained after Deploy step |
| Time triggers | Registered by `setupTimeTriggers()` | Run once from editor |

---

## Post-deploy notes

**Adding new workflow templates:**
1. Create `agents/orchestrator/workflows/<name>.md` with correct frontmatter
2. Add entry to `loadTemplateIndex_()` in the bundle
3. Add `executeInboxTriageStep_`-style executor function for the new template
4. Re-deploy Web App (new version)

**Promoting an auto-detected template:**
- Orchestrator will message you via Telegram when criteria are met
- Click `[Сохранить шаблон]` — orchestrator commits the draft from `reference/pending-templates/` to `workflows/`

**Updating credentials:**
- Change the Script Property value
- No redeployment needed — properties are read at runtime

**If emailer URL changes:**
- Update `EMAILER_EXEC_URL` Script Property
- No bundle changes needed
