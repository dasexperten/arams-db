# ad-hoc-protocol.md

Three-phase protocol for workflows that don't match any existing template.
Every ad-hoc run follows Phase 1 → Phase 2 → Phase 3, with no exceptions.

---

## Phase 1: Planning

**Goal:** Aram approves a concrete step-by-step plan before any external action is taken.

No emails are sent, no documents are generated, no external APIs are called during Phase 1
(except read-only lookups like contacts check or email search for context).

### 1.1 Intent extraction

Orchestrator analyzes the trigger text:
- Identify the objective (what outcome does Aram want?)
- Identify required data (who is the counterparty? which inbox? what product?)
- Identify likely skills and tools needed
- Identify known blockers (missing contact data, unclear language, legal content)

### 1.2 Plan construction

Orchestrator generates a numbered step list:
- Each step has: action verb + object + tool/skill used
- Steps are ordered to respect dependencies (context before draft, draft before send)
- Mandatory gate checks are implicit — they are not listed as steps (Aram knows they apply)
- Decision points where Aram will be asked are marked with `[Ваше решение]`

### 1.3 Plan proposal message

Sent as Telegram Type 3 (Approval) message:

```
🤖 ORCHESTRATOR — <ShortLabel>/Plan
Step 1/1 (planning)

Задача: <objective from trigger>

Предлагаю план:
1. <action> — <skill/tool>
2. <action> — <skill/tool>
3. [Ваше решение] — <what Aram will decide here>
4. <action> — <skill/tool>
5. <action> — <skill/tool>

Зависимости/риски: <1-2 lines if any, else omit>

[Запустить]  [Изменить план]  [Отменить]

wf_id: ADHOC_<trigger_slug>_<date>_<seq>
```

**Plan constraints:**
- Max 10 steps in a plan. If task requires more → break into sub-phases, get approval per phase.
- Every plan must have at least one `[Ваше решение]` point (if Aram approves literally everything blindly, the plan is too vague).
- First step is always a read/lookup (never send without gathering context first).

### 1.4 Plan acceptance

**Aram clicks "Запустить":**
- `params.plan_approved: true` recorded in state.
- `params.plan_steps` stored as the canonical step list.
- Instance status → RUNNING.
- Proceed to Phase 2.

**Aram clicks "Изменить план":**
- Orchestrator sends free-text prompt: "Опишите что изменить в плане:"
- Aram types modification.
- Orchestrator revises plan and sends updated proposal.
- Repeat until approved or cancelled.

**Aram clicks "Отменить":**
- Instance status → CANCELLED.
- No data was written externally.
- Instance archived with `params.cancel_reason: "Cancelled at planning"`.

---

## Phase 2: Execution

**Goal:** Execute the approved plan step by step, confirming at decision points.

### 2.1 Step execution loop

For each step in the approved plan:
1. Load step definition from `params.plan_steps[N]`.
2. Execute action (call skill, call tool, classify, lookup).
3. Apply all mandatory gates before any external send.
4. If step is a `[Ваше решение]` point → send appropriate Telegram message type and enter AWAITING_INPUT.
5. On Aram's response → store in state, continue to next step.

### 2.2 Side-effect confirmation

For every step that has external side effects (sends email, creates Drive document,
posts to marketplace, generates invoice), orchestrator sends a confirmation before acting:
- Use Type 1 (Binary) for straightforward confirms.
- Use Type 3 (Approval) if the content is substantial.
- **Draft-first rule:** first external send in any ad-hoc workflow is ALWAYS `draft_only: true` by default, unless Aram explicitly specified "отправь сразу" in the original trigger.

### 2.3 Error handling during execution

Per-step error → FAILED state → Telegram error message with retry option (max 3 retries).
Gate HALT → Hard HALT message → Aram resolves → continue.
Timeout → save state, send continuation prompt (see `escalation-thresholds.md` Scenario 5).

### 2.4 Progress updates

During long executions (3+ steps without user input):
- Send progress update every 3 completed steps.
- Format: Type 1 minimal — "Step N completed. Processing Step N+1... [Остановить]"
- Do not send update for every step — avoid noise.

---

## Phase 3: Reflection

**Goal:** Close the workflow cleanly and offer to save the pattern.

Triggered automatically when Phase 2 completes all steps.

### 3.1 Completion summary

Send completion summary (Type 1 or narrative depending on results):

```
🤖 ORCHESTRATOR — <ShortLabel>/Done
Workflow завершён. ✓

Что сделано:
  <bullet 1: fact>
  <bullet 2: fact>
  <bullet 3: fact>

Время: <duration>
Архив: <Drive link>

wf_id: <wf_id>
```

### 3.2 Template offer (if auto-detection not yet triggered)

If this is the first or second run of this pattern (not yet meeting 3-instance threshold):

```
Если эта задача повторяется — в следующий раз оркестратор запустит её
быстрее с шаблоном. Пока выполнено 1/3 необходимых запусков для автоопределения.
```

(No button needed — this is informational.)

If auto-detection threshold has been reached (3+ runs) AND promotion hasn't been offered yet:
- Trigger auto-detection check now (per `auto-detection-rules.md`).
- Include template proposal in completion message.

### 3.3 Archive and close

Whether template is offered or not:
1. Move JSON from `active/` to `archived/`.
2. Update Sheet index.
3. Instance status → COMPLETED.

---

## Ad-hoc workflow state conventions

Ad-hoc instances use `template: "adhoc"` in state JSON.

Additional params preserved:
```json
{
  "template": "adhoc",
  "params": {
    "original_trigger": "Напиши Torwey насчёт Q3 заказа",
    "objective": "Draft and send B2B follow-up to Torwey about Q3 order",
    "plan_approved": true,
    "plan_version": 1,
    "plan_steps": [
      { "index": 1, "action": "lookup_torwey_contact", "skill": "contacts", "idempotent": true },
      { "index": 2, "action": "get_recent_threads_torwey", "skill": "emailer.find", "idempotent": true },
      { "index": 3, "action": "draft_followup", "skill": "personizer", "idempotent": true },
      { "index": 4, "action": "approve_draft", "type": "user_decision" },
      { "index": 5, "action": "send_email", "tool": "emailer", "idempotent": false }
    ],
    "draft_only_first_send": true
  }
}
```

---

## Multi-phase ad-hoc (for large tasks)

If the task requires 10+ steps, break into phases. Each phase is a separate instance.

Parent-child tracking:
- Parent instance: `mode: "ad-hoc"`, `params.is_parent: true`, `params.children: ["wf_id_2", "wf_id_3"]`
- Child instances: `params.parent_wf_id: "wf_id_1"`, `params.phase: 2`

Phase 1 plan shows phases as top-level steps:
```
1. Фаза 1 — Исследование (contacts, emailer.find)
2. Фаза 2 — Создание документа (personizer, legalizer)     [Ваше решение после фазы 1]
3. Фаза 3 — Отправка (emailer, invoicer)                   [Ваше решение после фазы 2]
```

Aram approves Фаза 1 → executes → presents result + Фаза 2 plan → approves → etc.

---

## Examples

### Simple ad-hoc (2 phases of Aram interaction)

Trigger: `"Напиши Torwey насчёт Q3 заказа"`

```
Phase 1:
  Plan proposal → Aram clicks [Запустить]

Phase 2:
  Step 1: contacts lookup → Torwey email found ✓
  Step 2: emailer.find → last 3 threads retrieved ✓
  Step 3: personizer → draft created ✓
  Gate checks → all pass ✓
  [Ваше решение]: Type 3 Approval → Aram clicks [Утвердить]
  Step 5: emailer.send (draft_only: false) ✓

Phase 3:
  Completion summary
  "Это 1-й запрос такого типа (нужно 3 для шаблона)"
  Archive + log ✓
```

### Complex ad-hoc (HALT during execution)

Trigger: `"Подготовь NDA для нового дистрибьютора MediCare Gulf LLC ОАЭ"`

```
Phase 1:
  Plan: contacts lookup → draft NDA (legalizer) → [Ваше решение: approve NDA] → send
  Aram clicks [Запустить]

Phase 2:
  Step 1: contacts → MediCare Gulf not found → Contacts Gate HALT
  Aram provides email manually → Contacts Gate resolved ✓
  Step 2: legalizer drafts NDA → returns RED (penalty clause)
  Legalizer Gate HARD HALT → Aram clicks [Передать юристу]
  Workflow continues to archive-only steps → COMPLETED (with legal note)

Phase 3:
  Completion summary: "NDA передан юристу. Email с пакетом документов отправлен."
  No template offer (gate override was used → Criterion 4 not met for auto-detection)
```
