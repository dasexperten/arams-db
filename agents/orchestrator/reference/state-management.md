# state-management.md

Full specification for workflow instance state — Drive JSON schema, Sheet index,
atomic writes, heartbeat, and race condition handling.

---

## Drive JSON — instance state file

**Location:** `Orchestrator_State/active/<wf_id>.json`
Folder ID stored in Script Property `ORCHESTRATOR_STATE_FOLDER_ID`.
Sub-folder `active/` must exist manually (created during setup).

**Naming convention:**
```
<TEMPLATE_SLUG>_<YYYY>_<MM>_<DD>_<SEQ>
```
Examples:
- `INBOX_TRIAGE_2026_04_27_01.json`
- `B2B_ONBOARD_TORI_2026_04_28_01.json`
- `ADHOC_2026_04_29_03.json`

SEQ is a 2-digit counter reset per day per template slug. If 01 exists, next is 02.
If more than 99 runs per day per template — SEQ becomes 3-digit. No hard cap.

---

## State JSON schema

```json
{
  "wf_id":          "INBOX_TRIAGE_2026_04_27_01",
  "template":       "inbox-triage",
  "mode":           "templated",
  "status":         "AWAITING_INPUT",
  "current_step":   7,
  "total_steps":    10,
  "created_at":     "2026-04-27T06:00:00.000Z",
  "updated_at":     "2026-04-27T06:14:33.000Z",
  "last_heartbeat": "2026-04-27T06:14:33.000Z",
  "params": {
    "inboxes": ["eurasia", "emea", "export", "marketing"],
    "original_trigger": "утренняя почта"
  },
  "steps": [
    {
      "index":      1,
      "name":       "find_emails",
      "status":     "completed",
      "started_at": "2026-04-27T06:00:02.000Z",
      "ended_at":   "2026-04-27T06:00:18.000Z",
      "result_summary": "Found 12 threads across 4 inboxes",
      "output_keys": ["email_threads"]
    },
    {
      "index":   7,
      "name":    "await_aram_approval",
      "status":  "awaiting",
      "started_at": "2026-04-27T06:14:33.000Z",
      "ended_at": null,
      "telegram_message_id": 10042,
      "awaiting_input_type": "approval"
    }
  ],
  "data": {
    "email_threads": [ ... ],
    "classified_threads": { "URGENT": [...], "HIGH": [...], "MEDIUM": [...], "LOW": [...] },
    "drafts": { "thread_id_1": "draft text...", "thread_id_2": "draft text..." }
  },
  "gate_overrides": [],
  "error_log": [],
  "last_telegram_message_id": 10042,
  "aram_chat_id": "<from Script Properties — never hardcoded in state>"
}
```

### Field definitions

| Field | Type | Description |
|---|---|---|
| `wf_id` | string | Unique instance identifier |
| `template` | string | Template slug, or `"adhoc"` |
| `mode` | enum | `"templated"` / `"ad-hoc"` / `"auto-detection"` |
| `status` | enum | See lifecycle statuses below |
| `current_step` | int | 1-indexed step currently executing or awaiting |
| `total_steps` | int | Known from template, or estimated for ad-hoc |
| `created_at` | ISO datetime | Instance creation time (UTC) |
| `updated_at` | ISO datetime | Last state write time (UTC) |
| `last_heartbeat` | ISO datetime | Last time heartbeat checker confirmed liveness |
| `params` | object | Runtime parameters extracted from trigger |
| `steps` | array | Per-step execution records |
| `data` | object | Accumulated workflow data (threads, drafts, results) |
| `gate_overrides` | array | Records of any gate bypass decisions |
| `error_log` | array | Non-fatal errors encountered during run |
| `last_telegram_message_id` | int | Last message sent to Aram — for `editMessageText` |
| `aram_chat_id` | string | Always from Script Property, never from state |

### Status values

| Status | Meaning |
|---|---|
| `RUNNING` | Actively executing a step |
| `AWAITING_INPUT` | Paused, waiting for Aram's Telegram response |
| `COMPLETED` | All steps done, being archived |
| `FAILED` | Error halted the workflow, Aram notified |
| `CANCELLED` | Aram explicitly cancelled via button |
| `STALE` | In `AWAITING_INPUT` for 72+ hours — auto-archived with note |

---

## Sheet index schema

**Sheet ID:** Script Property `ORCHESTRATOR_INDEX_SHEET_ID`
**Tab name:** `Workflows`

Columns (one row per run):

| Column | Content |
|---|---|
| A: `wf_id` | Instance ID |
| B: `template` | Template slug or "adhoc" |
| C: `mode` | templated / ad-hoc / auto-detection |
| D: `status` | Final status |
| E: `created_at` | ISO datetime |
| F: `completed_at` | ISO datetime or empty |
| G: `steps_total` | Total steps |
| H: `steps_completed` | Steps completed before end |
| I: `gate_overrides` | Count of gate bypasses |
| J: `errors` | Count of errors in error_log |
| K: `original_trigger` | Aram's trigger message |
| L: `drive_link` | Link to archived JSON in Drive |
| M: `notes` | Free text (auto-cancel reason, etc.) |

Auto-headers created on first run. Row written on instance creation (status = RUNNING),
updated in-place on completion/failure/cancel.

---

## Atomic writes via LockService

Every state write (create, update, status transition) MUST acquire a lock:

```javascript
function writeState_(wfId, stateDelta) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 10-second timeout
    var file = getStateFile_(wfId);
    var current = JSON.parse(file.getBlob().getDataAsString());
    var updated = Object.assign(current, stateDelta, { updated_at: new Date().toISOString() });
    file.setContent(JSON.stringify(updated, null, 2));
    updateSheetIndex_(updated);
  } finally {
    lock.releaseLock();
  }
}
```

If lock cannot be acquired within 10 seconds → log warning, retry once after 2 seconds,
then throw. The outer error handler sends HALT to Aram.

**Critical:** Never write state outside `writeState_()`. No direct `file.setContent()` calls.

---

## Heartbeat mechanism

Apps Script time-based trigger runs `heartbeatCheck_()` every 30 minutes.

`heartbeatCheck_()`:
1. Reads all `.json` files in `Orchestrator_State/active/`
2. For each file with `status: AWAITING_INPUT`:
   a. Compute `hours_since_updated = (now - updated_at) / 3600000`
   b. If `hours_since_updated >= 24 and < 72`:
      - Send reminder ping to Aram (one ping per 24h window, tracked in state)
      - Update `last_heartbeat`
   c. If `hours_since_updated >= 72`:
      - Set `status: STALE`
      - Move file to `Orchestrator_State/archived/`
      - Append row to Sheet index with status STALE
      - Send Telegram: "Workflow <wf_id> archived as STALE — no response for 72h"

Reminder ping format:

```
🤖 ORCHESTRATOR — Reminder/<ShortLabel>
Workflow ожидает вашего ответа уже <hours>ч.
<last step summary>

[Продолжить] [Отменить workflow]

wf_id: <wf_id>
```

---

## Race condition handling

Scenario: Aram clicks two buttons in rapid succession (double-tap on mobile).
Both arrive as separate `doPost` calls.

Protection:
1. Each `doPost` call acquires `LockService.getScriptLock()` before reading state.
2. First call proceeds; second waits for lock.
3. After first call updates `current_step`, second call reads new state.
4. If second call's `callback_data` references a step already completed → ignore (idempotent).

Scenario: Apps Script execution timeout (6 minutes) mid-workflow.
- State was last written before timeout-triggering operation.
- On resume: orchestrator reads `status: RUNNING` with `current_step = N`.
- Checks if step N has `started_at` but no `ended_at` → step is "interrupted".
- Determines if step N is idempotent (find, read) or non-idempotent (send email, post).
- Idempotent → re-run step N.
- Non-idempotent → HALT to Aram: "Step N may have partially completed. Verify and choose."

---

## Stale state recovery

If Aram wants to resume a STALE workflow:

1. Aram sends: "продолжи workflow INBOX_TRIAGE_2026_04_27_01" to orchestrator bot.
2. Orchestrator finds file in `archived/` by wf_id.
3. Copies back to `active/`.
4. Sets status to `AWAITING_INPUT` at the last known step.
5. Re-sends the original Telegram message that was awaiting.

Recovery is available for 90 days (active retention) + 1 year (archived retention).
After archived deletion (1 year) — recovery not possible; state gone.

---

## Recurring workflow triggers (scheduled)

Apps Script time-based triggers call `runScheduledWorkflow_(<template_slug>)` directly.

Configured triggers (set during setup — see `backend/SETUP_NOTES.md`):

| Template | Schedule | Default |
|---|---|---|
| `inbox-triage` | Mon–Fri, 09:00 Moscow time | Enabled |

Moscow time offset: UTC+3. Apps Script trigger timezone is set to `Europe/Moscow`.

Scheduled runs create instances identically to trigger-text runs, with:
`params.original_trigger = "scheduled: " + template_slug`

---

## Data size limits

| Item | Limit | Behavior if exceeded |
|---|---|---|
| State JSON file | 50 MB (Drive file limit) | Truncate `data.email_threads` to last 100 entries; log warning |
| `data.drafts` single draft | 50 KB | Truncate draft to 50 KB; mark `data.draft_truncated: true` |
| Sheet index rows | 10,000 rows (performance) | Archive sheet to Drive, start new sheet |
| Steps array entries | 200 | If workflow exceeds 200 steps, split into child workflows (ad-hoc only) |
