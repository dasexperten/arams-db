# instance-lifecycle.md

State machine for every workflow instance — from creation through completion or failure.
Each phase has explicit state transitions, triggers, and actions.

---

## State transition diagram

```
               [Trigger arrives]
                      │
                      ▼
               ┌─────────────┐
               │   CREATING  │  (transient — no state written yet)
               └──────┬──────┘
                      │  wf_id assigned, JSON created in Drive
                      ▼
               ┌─────────────┐
          ┌───►│   RUNNING   │◄───────────────────────────────┐
          │    └──────┬──────┘                                 │
          │           │  step N requires Aram decision         │
          │           ▼                                        │
          │    ┌────────────────┐                              │
          │    │ AWAITING_INPUT │                              │
          │    └──────┬─────────┘                              │
          │           │  Aram responds via Telegram            │
          │           ▼                                        │
          │    (parse callback) ────────────────► (resume) ───┘
          │           │ Aram cancels
          │           ▼
          │    ┌────────────────┐
          │    │   CANCELLED    │ ──► archive, log
          │    └────────────────┘
          │
          │  (error during RUNNING or AWAITING)
          │           │
          │           ▼
          │    ┌────────────────┐
          │    │    FAILED      │ ──► Telegram to Aram, archive, log
          │    └────────────────┘
          │
          │  (all steps done)
          │           │
          │           ▼
               ┌─────────────┐
               │  COMPLETED  │ ──► archive, log metrics, Sheet update
               └─────────────┘

(If AWAITING_INPUT for 72+ hours → heartbeat transitions to STALE → archive)
```

---

## Phase 1: CREATING

**Trigger:** trigger text received by `doPost` and mode selected.

**Actions:**
1. Generate `wf_id` (see naming convention in `state-management.md`).
2. Load template (or create ad-hoc plan skeleton).
3. Extract parameters from trigger text.
4. Create Drive JSON file in `active/` folder.
5. Write row to Sheet index with `status: RUNNING`.
6. Send initial Telegram confirmation to Aram (Step 1 of N).

**On failure during CREATING:**
- No instance exists yet → no state to update.
- Send error to Aram: "Не удалось создать workflow — <reason>. Попробуйте снова."
- No wf_id in error message (instance was never created).

**State after CREATING succeeds:** `RUNNING`, `current_step: 1`.

---

## Phase 2: RUNNING

**What happens:** orchestrator executes one step at a time.

For each step:
1. Update state: `steps[N].status = "running"`, `steps[N].started_at = now`
2. Execute step action (call skill, call tool, compute classification, etc.)
3. Store result in `state.data` under the key defined by `output_keys`
4. Update state: `steps[N].status = "completed"`, `steps[N].ended_at = now`
5. Advance `current_step` to N+1

**Step types:**

| Type | Description | Idempotent |
|---|---|---|
| `skill_call` | Call a skill via Claude API | Yes (re-call produces same result) |
| `tool_call` | Call emailer or telegramer via HTTP POST | No — may send duplicate |
| `classification` | Classify data (urgency, routing) | Yes |
| `gate_check` | Apply consistency gate | Yes |
| `user_decision` | Pause for Aram's input | N/A — pauses, doesn't act |
| `archive` | Write to Drive, update Sheet | Yes (overwrites, not appends) |

Non-idempotent steps: orchestrator checks `steps[N].status` before executing.
If already "completed" (recovered from timeout) → skip execution, use stored output.

**Telegram updates during RUNNING:**
- Send progress update at key milestones (every 3 steps or on significant result).
- Not at every step — avoid message spam.
- Progress message format: status update, not decision request. No buttons except "Остановить".

---

## Phase 3: AWAITING_INPUT

**Entered when:** a step of type `user_decision` is reached.

**Actions on entering:**
1. Update state: `status: AWAITING_INPUT`, `steps[N].status: "awaiting"`, `steps[N].telegram_message_id: <msg_id>`
2. Send Telegram message with inline keyboard (type per `telegram-templates.md`).
3. Exit `doPost` execution — wait for callback.

**On Aram's response (new `doPost` with callback_data):**
1. Parse `callback_data`: `wf_id|step_index|choice`
2. Verify `wf_id` matches active instance.
3. Verify `step_index` matches `current_step` in state (prevent stale button replay).
4. Store `choice` in `steps[N].result`.
5. Update state: `steps[N].status: "completed"`, `steps[N].ended_at: now`, `status: RUNNING`
6. Continue execution at step N+1.

**On Aram's free-text response:**
1. Check if any instance is in `AWAITING_INPUT` with `awaiting_input_type: "free_text"`.
2. If exactly one match → treat text as `choice` for that instance.
3. If multiple matches → send disambiguation buttons to Aram.
4. If no match → treat as new trigger (start mode selection).

**On Aram clicking "Отменить workflow":**
→ Transition to CANCELLED (see below).

---

## Phase 4: RESUME

**Trigger:** Aram responds to AWAITING_INPUT message.

Resume is **stateless from Apps Script perspective** — every `doPost` reads fresh state from Drive.
There is no persistent Apps Script process waiting.

Resume sequence:
1. Read instance JSON from Drive.
2. Validate callback against current step.
3. Apply Aram's choice to state.
4. Continue execution loop (same code path as RUNNING).

---

## Phase 5: COMPLETED

**Entered when:** `current_step > total_steps` (all steps executed successfully).

**Actions:**
1. Set `status: COMPLETED`, `steps[-1].ended_at: now`.
2. Compute metrics: total duration, steps completed, gate checks passed, overrides used.
3. Send completion summary to Aram via Telegram:

```
🤖 ORCHESTRATOR — <ShortLabel>/Done
Workflow завершён. ✓

Итого:
  Писем отправлено: 6
  Черновиков создано: 2
  Время: 18 минут
  Gate overrides: 0

Архив: <Drive link>

wf_id: <wf_id>
```

4. Move JSON from `active/` to `archived/` sub-folder.
5. Update Sheet index: `status: COMPLETED`, `completed_at: now`, `drive_link: <archived URL>`.

---

## Phase 6: FAILED

**Entered when:** unhandled error during RUNNING or gate hard-HALT not resolved.

**Actions:**
1. Set `status: FAILED`, add error to `error_log`.
2. Send Telegram error message to Aram:

```
🤖 ORCHESTRATOR — <ShortLabel>/Error 🔴
Workflow остановлен из-за ошибки.

Шаг: <step_name> (Step N/M)
Ошибка: <error_message>

Состояние сохранено. Можно попробовать продолжить или отменить.
[Попробовать снова с шага N] [Отменить workflow]

wf_id: <wf_id>
```

3. Leave JSON in `active/` (not archived yet — Aram may retry).
4. On "Попробовать снова" → re-enter RUNNING from the failed step.
5. On "Отменить" → transition to CANCELLED.

**Retry limit:** 3 retries of the same step before forcing CANCELLED with full error log.

---

## Phase 7: CANCELLED

**Entered when:** Aram explicitly clicks cancel, or retry limit exceeded.

**Actions:**
1. Set `status: CANCELLED`.
2. Send confirmation to Aram:

```
🤖 ORCHESTRATOR — <ShortLabel>/Cancelled
Workflow отменён. Частичные результаты сохранены в архиве.
Архив: <Drive link>
wf_id: <wf_id>
```

3. Move JSON from `active/` to `archived/`.
4. Update Sheet index.

---

## Phase 8: STALE

**Entered by heartbeat check** (see `state-management.md`).

Not a user-facing terminal state — Aram can recover a STALE workflow within 90 days.

Transition:
1. Heartbeat detects 72h+ in AWAITING_INPUT.
2. Set `status: STALE`, add note to `error_log: "Auto-staled after 72h no response"`.
3. Move to `archived/`.
4. Update Sheet index.
5. Send Telegram:

```
🤖 ORCHESTRATOR — <ShortLabel>/Stale
Workflow переведён в архив — нет ответа 72 часа.
Можно восстановить: отправьте "продолжи workflow <wf_id>"
wf_id: <wf_id>
```

---

## Parallel workflows

Multiple instances can coexist in `AWAITING_INPUT` simultaneously (e.g., inbox-triage
and B2B onboarding both waiting).

Orchestrator handles disambiguation:
- Each Telegram message to Aram contains `wf_id` in footer.
- Button `callback_data` always includes `wf_id`.
- Free-text responses: if exactly one AWAITING_INPUT instance exists → attributed automatically.
- If 2+ AWAITING_INPUT instances exist when free text arrives:

```
🤖 ORCHESTRATOR — Disambiguate
Получен текстовый ответ. К какому workflow он относится?
[INBOX_TRIAGE_01] [B2B_ONBOARD_02] [Новый workflow]
```
