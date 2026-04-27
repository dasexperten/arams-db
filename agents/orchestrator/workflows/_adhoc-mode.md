---
name: _adhoc-mode
description: Meta-template describing how ad-hoc workflows operate. Not a real workflow template — this file documents the fallback behavior when no specific template matches Aram's trigger. Files starting with _ are not matched against triggers.
draft: false
trigger_phrases: []
---

# _adhoc-mode — Ad-hoc Workflow Meta-template

This file defines the structure that every unmatched workflow follows.
It is not executed directly — it is the spec that `orchestrator-bundle.gs` implements
for the `mode: "ad-hoc"` path.

---

## Structure

Every ad-hoc workflow has exactly three phases:

```
Phase 1: Planning     → Propose plan to Aram → Get approval
Phase 2: Execution    → Run approved plan → Decision gates at each side-effect step
Phase 3: Reflection   → Summarize → Offer template if pattern is recurring
```

No ad-hoc workflow may skip any phase. There is no "silent execution" mode.
Even if Aram's trigger is a single sentence and the task is obvious,
Phase 1 (plan proposal) must be sent and approved before execution begins.

---

## Phase 1: Planning

**Steps:**
1. Extract intent from trigger text (objective, counterparty, content type, channel)
2. Identify required skills and tools
3. Identify known data gaps (missing contacts, unclear language, ambiguous persona)
4. Generate numbered step list (max 10 steps; mark `[Ваше решение]` at each gate)
5. Send plan proposal as Telegram Type 3 (Approval) message
6. Await Aram's response

**Constraints:**
- First step of every plan is always a read/lookup operation
- Plans must include at least one `[Ваше решение]` point
- Sensitive operations (send email, generate legal doc, publish post) always follow a `[Ваше решение]` step

**Instance state when entering Phase 1:**
```json
{
  "status": "AWAITING_INPUT",
  "current_step": 1,
  "steps": [{"index": 1, "name": "plan_approval", "status": "awaiting"}],
  "data": { "extracted_intent": "...", "proposed_plan": [...] }
}
```

**Outcome A (Запустить):** `params.plan_approved = true` → proceed to Phase 2
**Outcome B (Изменить план):** re-draft plan with Aram's modifications → re-send Phase 1
**Outcome C (Отменить):** instance → CANCELLED → archive

---

## Phase 2: Execution

**Steps:** execute `params.plan_steps` in order.

For each step:
```
if step.type == "skill_call":
    result = callSkill_(step.skill, context)
    apply all mandatory gates to result
    if any gate halts → send HALT message → AWAITING_INPUT
    else → store result → continue

if step.type == "tool_call":
    if first_send_in_workflow and !params.explicit_send_now:
        payload.draft_only = true
    send Type 3 Approval before tool call
    await Aram response
    if approved → call tool → store result → continue
    else → skip or revise

if step.type == "user_decision":
    construct appropriate Telegram message type
    send → AWAITING_INPUT
    await Aram response → store choice → continue
```

**Gate enforcement:** see `reference/consistency-rules.md`.
No step may proceed to an external send without all gates passing.

**Instance state when in Phase 2:**
```json
{
  "status": "RUNNING",
  "current_step": 3,
  "steps": [
    {"index": 1, "status": "completed", ...},
    {"index": 2, "status": "completed", ...},
    {"index": 3, "status": "running", "started_at": "..."}
  ]
}
```

---

## Phase 3: Reflection

Triggered automatically on `current_step > total_steps` (all plan steps executed).

**Steps:**
1. Compute summary metrics (duration, steps done, gate overrides, errors)
2. Send completion summary to Aram (Telegram narrative)
3. Check auto-detection criteria (`reference/auto-detection-rules.md`)
4. If criteria met → send template proposal
5. If not met → show progress counter ("1/3 запусков для автоопределения шаблона")
6. Move instance JSON from `active/` to `archived/`
7. Update Sheet index

**Completion message format:**
```
🤖 ORCHESTRATOR — <ShortLabel>/Done
Workflow завершён. ✓

<bullet 1>
<bullet 2>
<bullet 3>

Время: <duration>
Архив: <Drive link>

wf_id: <wf_id>
```

---

## Data flow between phases

```
Phase 1 output → params.plan_steps (canonical step list)
Phase 2 output → state.data (accumulated skill outputs, draft texts, classification results)
Phase 3 input  → state.data + steps metrics
```

Data in `state.data` is keyed by `step.output_keys` defined in each plan step.
Phase 3 never calls external APIs — it reads from already-accumulated data.

---

## Rollback

Ad-hoc workflows do not support automated rollback.
If a step fails after a side-effect was already produced (email sent):
- Orchestrator notes the side-effect in `error_log`
- Sends HALT to Aram with context: "Email to X was sent at step N before the error at step N+1"
- Aram decides manually how to compensate

This is why the draft-first rule exists: reduce the cost of errors by defaulting to drafts.
