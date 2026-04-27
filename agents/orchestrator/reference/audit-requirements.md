# audit-requirements.md

What gets logged where, retention policy, and data sensitivity rules.

---

## Audit sources

Four recording layers — each serves a different purpose:

| Layer | What | Where | Retention |
|---|---|---|---|
| Sheet index | High-level run metrics, one row per instance | `ORCHESTRATOR_INDEX_SHEET_ID` | Permanent (until manual cleanup) |
| Instance JSON | Full step-level state, all data accumulated | Drive `Orchestrator_State/` | 90 days active, 1 year archived |
| Reporter Docs | Outbound communications (emails sent) | `REPORTER_FOLDER_ID/<recipient>/` | 1 year |
| Apps Script logs | Technical trace for debugging | Apps Script execution log | 30 days (Google default) |

---

## Sheet index — what to record

One row written on instance CREATE, updated in-place on status change.

Required columns (see `state-management.md` for full schema):

| Column | Populated when |
|---|---|
| `wf_id` | Creation |
| `template` | Creation |
| `mode` | Creation |
| `status` | Every status transition |
| `created_at` | Creation |
| `completed_at` | Completion / failure / cancel |
| `steps_total` | Creation (template) or after plan approval (ad-hoc) |
| `steps_completed` | Completion |
| `gate_overrides` | Completion (count from `gate_overrides` array) |
| `errors` | Completion (count from `error_log` array) |
| `original_trigger` | Creation |
| `drive_link` | After move to archived/ |
| `notes` | Auto-stale reason, legal transfer note, etc. |

**Additional columns for Level 3 GitHub auto-promotion** (populated for auto-detection rows only):

| Column | Populated when |
|---|---|
| `template_promotion` | When auto-detection criteria are met — values: `candidate` → `approved` → `merged` / `declined` / `failed_validation` / `expired` |
| `github_pr_url` | After PR created by `githubCreatePR_()` |
| `github_merge_sha` | After successful squash merge |
| `validation_status` | After `githubValidateBeforeMerge_()` — values: `passed` / `failed:<error_list>` |
| `aram_approval_timestamp` | When Aram taps `[✅ Approve & auto-merge]` in Telegram |

These columns are blank for non-promotion rows and never cause Sheet formula errors (empty = not applicable).

Additional tab `AutoDetect_Suppressed` for suppressed auto-detection patterns.
Additional tab `GateOverrides` for detailed record of every gate bypass (wf_id, gate name, Aram's choice, timestamp).

---

## Instance JSON — what to record

Full fidelity — everything that happened.

Required in `data` object:
- Raw results from skill calls (full text, not summary)
- Classification results (urgency buckets, language detection)
- Gate check results (pass/fail, confidence, matched phrases)
- Draft versions (v1 from skill, v2 if rewritten, v_final if edited by Aram)
- Telegram message IDs sent (to enable editMessageText if needed)

Required in `steps` array (each step):
- `started_at`, `ended_at` (or null if interrupted)
- `status` (running / completed / awaiting / skipped / failed)
- `result_summary` (1-line human-readable, for Sheet audit)
- `output_keys` (which keys in `data` this step populated)

Required in `gate_overrides` array (each bypass):
```json
{
  "gate": "product_knowledge",
  "step_index": 5,
  "original_draft_fragment": "INNOWEISS содержит кальций",
  "aram_choice": "Удалить фразу из черновика",
  "timestamp": "2026-04-27T07:22:11Z"
}
```

Required in `error_log` array (each non-fatal error):
```json
{
  "step_index": 3,
  "error_type": "archive_failed",
  "message": "Reporter Doc creation failed: DriveApp quota exceeded",
  "timestamp": "2026-04-27T07:14:55Z",
  "resolution": "skipped_non_fatal"
}
```

---

## Sensitive data rules

### What NEVER appears in Telegram messages (even in state JSON for convenience)

- Bank account numbers, IBANs, SWIFT codes
- Contract reference numbers of third parties
- Customer personal data (phone numbers, home addresses)
- Tax IDs (ИНН, VAT numbers) of counterparties

These are referenced as `"[see contacts skill]"` or `"[Drive link: <url>]"` in Telegram.
They are stored in `state.data` within Drive JSON (accessible only to the operator's account).

### What NEVER appears in Apps Script logs (console.log / console.warn)

- Email body content (log `"body: [redacted, <N> chars]"` instead)
- Skill output text (log `"skill_output: [redacted]"` instead)
- Draft text (log `"draft: [redacted, v<N>]"` instead)
- Any PII (names combined with emails combined with purchase history)

**Rationale:** Apps Script execution logs can be accessed by anyone with project editor access.
Drive JSON and Sheet are controlled via ACL (operator's account only).

### Drive ACL requirements

`Orchestrator_State/` folder:
- Owner: `daxexperten@gmail.com`
- No sharing to other accounts
- No public link sharing
- Do NOT set `ORCHESTRATOR_STATE_FOLDER_ID` to a folder inside a shared Drive

`REPORTER_FOLDER_ID/` (same ACL as emailer — already configured for emailer):
- Inherits emailer's existing ACL
- Orchestrator writes Reporter Docs only via emailer tool calls — no direct Drive access needed

---

## Reporter Docs for orchestrator-initiated emails

When orchestrator sends an email via `emailer`, the emailer tool creates a Reporter Doc
in `REPORTER_FOLDER_ID/<recipient>/` — this is emailer's own responsibility.

Orchestrator additionally records in instance state:
```json
{
  "step_index": 8,
  "action": "send_email",
  "reporter_doc_link": "<url from emailer response>",
  "recipient": "orders@tori-georgia.ge",
  "subject": "Shipment confirmation — container MSCU1234567"
}
```

This cross-reference allows full audit: Sheet row → instance JSON → reporter Doc → actual email.

---

## Retention policy

### Active instances (Orchestrator_State/active/)

Instances in `RUNNING` or `AWAITING_INPUT` remain in `active/` until:
- COMPLETED or CANCELLED → moved to `archived/` immediately
- FAILED → stays in `active/` for 7 days (retry window), then moved to `archived/`
- STALE (72h no response) → moved to `archived/`

### Archived instances (Orchestrator_State/archived/)

Retained for **1 year** from `completed_at` date.
After 1 year: deleted by a scheduled cleanup script (run monthly).
Before deletion: Sheet index row is retained (no Drive file, but metadata preserved).
Deletion notification sent to Aram once per batch (monthly cleanup summary).

### Level 3 GitHub promotion — additional retention rules

| Outcome | Sheet row | Drive draft | Notes |
|---|---|---|---|
| **Merged successfully** | Permanent | Auto-deleted by pipeline after merge | `github_merge_sha` is the permanent audit trail |
| **Validation failed** | Permanent | Archived after 30 days (not deleted) | PR stays open for manual review |
| **Declined by Aram** | 90 days, then archive | Deleted immediately on decline | Pattern added to suppression list |
| **Expired (14d no response)** | Permanent | Archived with `status: expired` suffix | Reminder sent at 7d and 13d |
| **Pending (Aram editing in Drive)** | Permanent while active | Stays in `pending-templates/` | Re-validation runs on next Aram message |

Pending drafts older than **90 days** without Aram approval are auto-deleted (Drive cleanup).
Telegram reminder sent at 30 days and 89 days.

### Sheet index

Permanent — never auto-deleted.
After 10,000 rows: current sheet archived to Drive as `Orchestrator_Index_Archive_<date>.xlsx`,
new sheet started with headers only.

### Apps Script execution logs

30-day Google-managed retention — no action needed.

---

## Audit queries — useful Sheet formulas

Finding all workflows with gate overrides:
```
=QUERY(Workflows, "SELECT A, B, C, D, I WHERE I > 0", 1)
```

Workflows by template, last 30 days:
```
=QUERY(Workflows, "SELECT B, COUNT(A) WHERE E >= date '" & TEXT(TODAY()-30,"yyyy-MM-dd") & "' GROUP BY B", 1)
```

Average completion time per template:
```
=QUERY(Workflows, "SELECT B, AVG(F-E) WHERE D = 'COMPLETED' GROUP BY B LABEL AVG(F-E) 'avg_duration_days'", 1)
```

---

## Anomaly detection (manual review indicators)

Review the Sheet index weekly for:
1. `gate_overrides > 2` in a single workflow — unusual, may indicate template needs revision
2. `errors > 5` — persistent infrastructure issue
3. Same workflow failing 3+ times in a row — template logic bug
4. `status = STALE` count increasing week-over-week — Aram may be overwhelmed with decisions
5. `mode = ad-hoc` for same trigger 5+ times without auto-detection — check suppression list
