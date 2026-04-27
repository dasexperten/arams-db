# auto-detection-rules.md

Exact criteria for promoting ad-hoc workflows to named templates.
The goal: reduce Aram's friction for recurring tasks without building premature templates.

---

## Promotion criteria — all four must be met

### Criterion 1: Minimum 3 instances

At least 3 completed ad-hoc workflow instances must exist in the Sheet index.
Partial or FAILED instances do not count toward the minimum.
CANCELLED instances do not count.

Query:
```
Sheet index WHERE mode = "ad-hoc" AND status = "COMPLETED"
  AND created_at >= (now - 30 days)
```

---

### Criterion 2: Structural similarity ≥ 80%

For each pair of the N qualifying instances, compute step-sequence similarity:
1. Extract step names from each instance's state JSON.
2. Compute Levenshtein edit distance between step-name sequences (as string arrays).
3. Normalize: `similarity = 1 - (edit_distance / max(len_A, len_B))`

For a group of 3+ instances to qualify:
- Every pair in the group must have similarity ≥ 0.80.

Trigger-text similarity is an additional signal but NOT a strict requirement.
(Two instances triggered differently but following the same steps still qualify.)

---

### Criterion 3: Stable Aram decisions

No "unstable" decisions in any of the qualifying instances.

A decision is **unstable** if:
- Aram clicked "Редактировать" (edit) on a plan step proposal
- Aram clicked a non-default option more than once across the group
- A gate override was applied (`gate_overrides` array is non-empty)
- An ADHOC_PARAMS flag was set (`params.manual_override: true`)

Stable means: Aram used the default "primary action" button at every decision point
in every qualifying instance.

---

### Criterion 4: No external blockers in any instance

No instance in the qualifying group ended with:
- A legalizer RED flag that was manually overridden
- A step that required Aram to type free text (Type 4 message) more than once
- A step that reached retry limit before succeeding

Rationale: if Aram always needed to intervene manually, the pattern isn't automatable yet.

---

## Detection trigger

Detection runs:
1. At the end of every ad-hoc workflow that completes successfully.
2. Daily at 02:00 Moscow time via Apps Script time trigger.

If detection trigger fires but criteria not met → log result in Sheet, no action.
If criteria met → proceed to Promotion Phase.

---

## Promotion phase

### Step 1: Draft template

Orchestrator constructs a template draft:
- `name`: generated from most common words in qualifying trigger texts (max 3 words, kebab-case)
- `trigger_phrases`: array of the exact trigger texts from qualifying instances + normalized variants
- `steps`: extracted from the most-complete instance (most steps + all completed)
- `params`: union of all params used across qualifying instances
- `escalation_overrides`: any step that had a consistent pre-send pause in all instances

Draft file location: `agents/orchestrator/reference/pending-templates/<name>-draft.md`

### Step 2: Notify Aram (Level 3 format)

```
🤖 ORCHESTRATOR — Template/Proposal
Step 1/1

Я заметил повторяющийся паттерн:
"<proposed_name>" — 3 раза за последние <days> дней

Совпадение шагов: <similarity>%
Instances: <wf_id_1>, <wf_id_2>, <wf_id_3>
Решения Арама: стабильные (0 переопределений)

Драфт нового шаблона готов:

[📄 Показать драфт]
[✅ Approve & auto-merge to GitHub]
[✏️ Сначала отредактирую в Drive]
[❌ Это не паттерн, decline]

wf_id: AUTO_DETECT_<name>_<date>
```

### Step 3: On Aram's response

**Promotion lifecycle (Level 3):**

```
Pattern detected
  → draft saved to Drive pending-templates/<name>-draft.md
  → Telegram notification with 4 buttons
  → Aram taps [✅ Approve & auto-merge]
  → orchestrator validates draft (path guard, size, YAML, no secrets)
  → creates GitHub feature branch: auto-templates/<wf_id>-<slug>
  → commits file to branch
  → opens PR with structured audit message
  → polls mergeable state, runs validation gates
  → auto-merges if valid (squash merge)
  → deletes Drive draft after successful merge
  → confirms to Aram with merge SHA + PR link
```

If validation fails → PR stays open, Aram notified with PR link. Not a HALT.
If GitHub API fails after 3 retries → HALT to Aram.

Full GitHub API details: `reference/github-integration.md`.

**Approval response routing:**

| Aram action | Orchestrator response |
|---|---|
| `[✅ Approve & auto-merge]` | Run full Level 3 pipeline (validate → branch → commit → PR → merge) |
| `[✏️ Сначала отредактирую в Drive]` | Send Drive link, set state to AWAITING_INPUT free_text; on next Aram message re-validate draft then run pipeline |
| `[❌ Это не паттерн, decline]` | Delete Drive draft; log `declined` in Sheet; suppress pattern for 30 days |
| No response within 7 days | Send reminder ping |
| No response within 14 days total | Archive Drive draft with `status: expired`; log in Sheet |

**"Показать драфт":**
1. Fetch draft content from Drive.
2. Send truncated preview (first 1000 chars) + Drive link in Telegram.
3. Follow-up buttons: `[✅ Approve & auto-merge]` `[✏️ Редактировать]` `[❌ Decline]`.

**"Decline":**
1. Delete Drive draft from `pending-templates/`.
2. Log in Sheet: `auto_detection_declined: true`, `reason: "declined by Aram"`.
3. Add pattern hash to suppression list with `suppressed_until = now + 30 days`.

---

## Similarity calculation — implementation reference

```javascript
function levenshtein_(a, b) {
  var m = a.length, n = b.length;
  var dp = [];
  for (var i = 0; i <= m; i++) {
    dp[i] = [i];
    for (var j = 1; j <= n; j++) dp[i][j] = (i === 0) ? j : 0;
  }
  for (var j = 1; j <= n; j++) {
    for (var i = 1; i <= m; i++) {
      if (a[i-1] === b[j-1]) dp[i][j] = dp[i-1][j-1];
      else dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function stepSimilarity_(stepsA, stepsB) {
  var dist = levenshtein_(stepsA, stepsB);
  return 1 - dist / Math.max(stepsA.length, stepsB.length, 1);
}
```

Input: arrays of step names, e.g. `["find_emails", "classify", "draft_replies", "approve", "send"]`.

---

## Template draft format

Drafts in `pending-templates/` use the same format as production templates in `workflows/`.
See `workflows/inbox-triage.md` for reference format.

Draft filenames: `<name>-draft.md`
Promoted filenames: `<name>.md` (in `workflows/`)

Pending drafts older than 90 days without Aram approval are automatically deleted.
A Telegram reminder is sent at 30 days and 89 days.

---

## Suppression list

Patterns suppressed from auto-detection (Aram has explicitly declined or they are not automatable):

Maintained in Sheet index as a separate tab `AutoDetect_Suppressed`:
- `pattern_hash` (hash of step sequence)
- `suppressed_until` (date)
- `reason`

Before running detection, check candidate groups against this list.
