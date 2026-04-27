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

### Step 2: Notify Aram

```
🤖 ORCHESTRATOR — Template/Proposal
Step 1/1

Обнаружен повторяющийся паттерн:
  Название: "<proposed_name>"
  Запусков: 3 за последние 28 дней
  Схожесть шагов: 94%
  Решения Арама: стабильные (0 переопределений)

Примеры триггеров:
  "follow-up Torwey не ответили"
  "follow-up ArvitPharm — повторный"
  "Natusana follow-up 2-я попытка"

Шаблон сохранит 3–4 минуты на каждый будущий запуск.
Черновик: <Drive link to pending-templates/draft>

[Сохранить шаблон]  [Просмотреть сначала]  [Пропустить]

wf_id: AUTO_DETECT_<name>_<date>
```

### Step 3: On Aram's response

**"Сохранить шаблон":**
1. Move draft from `pending-templates/` to `workflows/<name>.md`.
2. Commit to `claude/build-orchestrator-agent-0CRkZ` branch (or current working branch).
3. Update Sheet index: add row for auto-detection event with `status: template_promoted`.
4. Confirm to Aram:

```
🤖 ORCHESTRATOR — Template/Saved
Шаблон "<name>" добавлен в workflows/.
Следующий запрос "<trigger_example>" запустится как templated workflow.
wf_id: AUTO_DETECT_<name>_<date>
```

**"Просмотреть сначала":**
1. Send draft content as Telegram message (truncated) + Drive link.
2. Follow-up buttons: `[Утвердить]` `[Редактировать]` `[Пропустить]`.
3. On "Редактировать": orchestrator asks what to change via free-text.

**"Пропустить":**
1. Log `auto_detection_declined: true` for those instances in Sheet.
2. Those instances will NOT be used in future auto-detection checks.
3. Pattern suppressed for 60 days before detection re-runs.

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
