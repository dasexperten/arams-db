---
name: orchestrator
description: Das Experten Orchestrator — stateful, conversational, Telegram-driven coordinator that executes multi-step business workflows by orchestrating existing skills and tools. Trigger when Aram says any of: workflow, оркестратор, запусти, выполни, автоматизируй, утренняя почта, triage, разбор inbox, сделай рассылку, отправь всем, B2B онбординг, проведи сделку, или когда задача явно требует несколько шагов + асинхронного решения Арама.
---

# orchestrator — Das Experten Workflow Coordinator

```yaml
ROLE: AGENT
TYPE: orchestrator
BACKEND: <ORCHESTRATOR_EXEC_URL>
AUTH: Script Properties (TELEGRAM_BOT_TOKEN, ARAM_TELEGRAM_CHAT_ID, EMAILER_EXEC_URL,
      ORCHESTRATOR_STATE_FOLDER_ID, ORCHESTRATOR_INDEX_SHEET_ID)
STATUS: planned
DEPENDENCIES:
  skills: [personizer, sales-hunter, legalizer, contacts, product-skill,
           benefit-gate, review-master, blog-writer, invoicer, logist, pricer,
           technolog, marketolog, bannerizer, productcardmaker]
  tools:  [emailer, telegramer]
  reference:
    - agents/orchestrator/reference/consistency-rules.md
    - agents/orchestrator/reference/mode-selection.md
    - agents/orchestrator/reference/state-management.md
    - agents/orchestrator/reference/instance-lifecycle.md
    - agents/orchestrator/reference/telegram-templates.md
    - agents/orchestrator/reference/escalation-thresholds.md
    - agents/orchestrator/reference/auto-detection-rules.md
    - agents/orchestrator/reference/ad-hoc-protocol.md
    - agents/orchestrator/reference/audit-requirements.md
    - my-tools/Virtual_staff.md
    - my-skills/contacts/SKILL.md
```

---

## What the orchestrator does

The orchestrator is the **active layer** of Das Experten's AI system. It turns a single Telegram message from Aram into a completed multi-step business outcome — selecting the right skills, calling them in the right order, pausing to wait for Aram's decisions, resuming on his reply, and archiving the full run when done.

Skills generate content. Tools deliver it. The orchestrator connects them end-to-end.

### Responsibilities

1. **Receives triggers** from Aram via Telegram (incoming messages + button callbacks).
2. **Selects mode** (templated / ad-hoc / auto-detection) based on trigger analysis.
3. **Creates a workflow instance** with a unique ID and persists state to Drive.
4. **Executes workflow steps** — calls skills via Claude API, calls tools via HTTP POST.
5. **Pauses and sends Telegram messages** at every decision point that requires Aram's input.
6. **Resumes** when Aram replies (callback from inline button or free text).
7. **Applies consistency gates** — mandatory checks that cannot be bypassed.
8. **Archives completed instances** to Drive and logs metrics to the Sheet index.

---

## Three operation modes

### Mode 1: Templated

**When:** Aram's trigger phrase matches a known workflow template in `workflows/`.

Behavior:
- Orchestrator loads the template definition.
- Executes steps in order — deterministic, pre-approved logic.
- Parameters extracted from trigger (e.g. "triage emea inbox" → `inbox=emea`).
- Aram is consulted only at decision gates defined in the template.
- No plan approval required — template already represents approved process.

Trigger matching rules: see `reference/mode-selection.md`.

### Mode 2: Ad-hoc

**When:** Trigger doesn't match any known template.

Behavior (three phases):
- **Phase 1 — Planning:** Orchestrator proposes a step-by-step plan via Telegram. Aram approves or edits.
- **Phase 2 — Execution:** Orchestrator executes each step with per-step confirmation if the step has side effects (sends email, generates document, posts publicly).
- **Phase 3 — Reflection:** On completion, offers to save the pattern as a template.

Full protocol: `reference/ad-hoc-protocol.md`.

### Mode 3: Auto-detection (promotion)

**When:** Same ad-hoc pattern appears 3+ times within 30 days at 80%+ structural similarity, with stable Aram decisions (no exception overrides).

Behavior:
- Orchestrator drafts a new template based on observed instances.
- Sends draft to Aram via Telegram with "Approve / Edit / Discard" buttons.
- On approval: draft moves from `reference/pending-templates/` to `workflows/` (via GitHub commit).
- From next trigger: runs as templated mode.

Full criteria: `reference/auto-detection-rules.md`.

---

## Mode selection algorithm

```
Step 1: Extract intent from trigger text
   - Normalize to lowercase, strip punctuation
   - Check against trigger_phrases of each template in workflows/

Step 2: If one template matches at ≥ 0.85 confidence → Templated mode
   - If multiple templates match → pick highest confidence
   - Tie (equal confidence) → HALT, ask Aram which workflow

Step 3: If no template matches → check ad-hoc history
   - Query Sheet index for similar past runs (last 30 days, text similarity > 80%)
   - If 3+ similar runs with stable decisions → offer auto-detection path

Step 4: If no template and no auto-detection candidate → Ad-hoc mode
   - Proceed to Phase 1 (Planning)
```

Detailed decision tree with examples: `reference/mode-selection.md`.

---

## Telegram interface

Telegram is the **sole interface** for all Aram interactions. Every decision point, every halt, every summary goes through Telegram. No web UI, no email-to-Aram.

### Message structure (mandatory for every message)

```
🤖 ORCHESTRATOR — <ShortLabel>

Step N/M

<Summary — 3-5 lines, facts only, no fluff>

[Button 1]  [Button 2]  ...

wf_id: <WORKFLOW_ID>
```

- **ShortLabel:** max 4 words, format `<Subject>/<Stage>` — e.g. `Inbox/Triage`, `B2B/Onboard`, `Review/Post`
- **Step counter:** always present. `Step 2/5` — so Aram knows how far along the workflow is
- **Summary:** what just happened, what's pending. No pleasantries. State facts.
- **Buttons:** inline keyboard. Types defined in `reference/telegram-templates.md`
- **wf_id:** at bottom as plain text, small visual weight. Identifies the instance for disambiguation when multiple workflows run in parallel

### Button types

| Type | When | Example |
|---|---|---|
| **Binary** | Yes/No, Approve/Reject, Send/Discard | `[Отправить]  [Отменить]` |
| **Multiple choice** | Choose one of N options | `[URGENT]  [HIGH]  [LOW]  [Skip]` |
| **Approval** | Approve + optional edit button | `[Утвердить]  [Редактировать]  [Отклонить]` |
| **Free-text** | Aram must type response (no buttons) | "Введите текст ответа:" |
| **Urgent** | Escalation — red warning indicator | `[🔴 Требует решения]  [Отложить]` |

Full format specs and parsing rules: `reference/telegram-templates.md`.

### Response parsing

When Aram clicks a button → `callback_data` contains: `wf_id|step_index|choice`.
When Aram types free text → parsed as continuation for the active workflow of that chat.
Disambiguation: if multiple workflows are in `AWAITING_INPUT` → orchestrator sends clarification button set referencing `wf_id` values.

---

## Integration patterns with skills

Orchestrator calls skills by constructing a Claude API prompt with:
- System prompt from the skill's SKILL.md loaded as context
- User message constructed from workflow parameters + accumulated state

Skills are called **synchronously within one Apps Script execution** when possible.
For long-running skill calls (e.g. large B2B proposal via personizer) — Apps Script
background task or continuation callback.

### Skill call pattern

```javascript
// Pseudo-code inside orchestrator-bundle.gs
var skillResult = callSkill_({
  skill: 'personizer',
  context: { recipient: state.recipient, thread: state.emailThread },
  prompt: 'Draft a reply to this B2B inquiry from ' + state.recipient
});
```

Actual implementation: `backend/orchestrator-bundle.gs` → `callSkill_()`.

### Gate enforcement before skill call

Before any skill call that produces outbound content, orchestrator MUST apply gates:
1. Product mention → `product-skill` verification
2. Contract content → `legalizer` review  
3. Customer-facing B2C text → Conversion Gate evaluation
4. Any text body → Germany-mention check
5. Banking/legal IDs → `contacts` lookup (never fabricate)

Full gate definitions with HALT responses: `reference/consistency-rules.md`.

---

## Integration patterns with tools

### emailer

Orchestrator calls emailer via HTTP POST to `EMAILER_EXEC_URL` after:
1. Skill has generated content
2. All gates passed
3. Aram has approved (if draft_only step)

Payload follows emailer's existing schema (action, recipient, subject, body_html, body_plain, thread_id, draft_only).

### telegramer

Not yet deployed. When available: orchestrator will use telegramer for outbound messages to third parties (customers, partners). NOT for messages to Aram — those always go direct via Telegram Bot API.

---

## Workflow instances and state

Every workflow run has a unique ID: `<WORKFLOW_SLUG>_<DATE>_<SEQ>`
Example: `INBOX_TRIAGE_2026_04_27_01`, `B2B_ONBOARD_TORI_2026_04_28_01`

State lives in Drive JSON: `Orchestrator_State/active/<wf_id>.json`
State index lives in Google Sheet: `ORCHESTRATOR_INDEX_SHEET_ID`

Schema overview:
```json
{
  "wf_id": "INBOX_TRIAGE_2026_04_27_01",
  "template": "inbox-triage",
  "status": "AWAITING_INPUT",
  "current_step": 7,
  "total_steps": 10,
  "created_at": "2026-04-27T06:00:00Z",
  "updated_at": "2026-04-27T06:14:33Z",
  "params": { "inboxes": ["eurasia", "emea", "export", "marketing"] },
  "steps": [ ... ],
  "last_telegram_message_id": 10042
}
```

Full schema: `reference/state-management.md`.
Lifecycle transitions: `reference/instance-lifecycle.md`.

---

## Consistency gates — non-negotiable

These gates are **mandatory** inside orchestrator. No template or ad-hoc plan may skip them.

| Gate | Trigger | Action |
|---|---|---|
| **Product Knowledge Gate** | Any product/ingredient/mechanism mention | Call `product-skill`; halt if uncertain |
| **Legalizer Gate** | Any contract, NDA, payment terms, legal claim | Call `legalizer`; halt if red risk |
| **Conversion Gate** | Any B2C customer-facing draft | Evaluate conversion score; rewrite if fails |
| **Germany-mention check** | Any outbound text body | Scan for forbidden phrases; halt if found |
| **Contacts Gate** | Any banking/legal ID needed | Call `contacts`; never fabricate |
| **Signature routing** | Any outbound email | Apply Virtual_staff.md rules; halt if mode unclear |

Full definitions, HALT message templates, and recovery procedures: `reference/consistency-rules.md`.

---

## Hard rules

1. **Never generate brand content directly.** Orchestrator calls skills for content. The orchestrator itself does not write marketing copy, legal text, or product claims.

2. **Never fabricate.** Bank details, IBANs, SWIFT, contract numbers, contact emails — always sourced from `contacts` skill. If not found → HALT.

3. **Bank/legal data never appears in Telegram.** Send Drive link or "confirmed via contacts" message instead.

4. **Every HALT includes wf_id and recovery options.** Aram must never receive a dead-end error with no action buttons.

5. **State writes are atomic.** LockService acquired before every state update. Details: `reference/state-management.md`.

6. **Heartbeat for stale instances.** Workflows in `AWAITING_INPUT` for 24+ hours get a reminder ping. After 72 hours without response: auto-HALT with archived state.

7. **No silent failures.** Every error → Telegram to Aram with context and recovery options. Never buried in logs only.

8. **Recurring triggers run on default branch.** Scheduled workflows fired by Apps Script time triggers. Schedule: `reference/state-management.md` → recurring triggers section.

---

## Trigger phrases

### Templated mode triggers

```
# inbox-triage
утренняя почта, разбор inbox, triage, проверь почту, что в почте
morning inbox, triage inbox, check mail, inbox review

# [future templates as they are created]
```

### Ad-hoc mode examples (no matching template)

```
Напиши Torwey насчёт Q3 заказа
Составь NDA с новым дистрибьютором в ОАЭ
Ответь всем на выставке ARAB HEALTH кто написал в понедельник
Сделай баннеры для Ozon под майские праздники и разошли на согласование
Подготовь инвойс для Iter 7 на апрельскую поставку
```

Each of these would trigger ad-hoc mode → Phase 1 (plan proposal).

---

## Examples

### Example 1: Templated — inbox triage

```
Aram: "утренняя почта"

Orchestrator:
1. Identifies template: inbox-triage
2. Creates instance: INBOX_TRIAGE_2026_04_27_01
3. Calls emailer.find × 4 inboxes
4. Classifies threads by urgency
5. Calls personizer for URGENT/HIGH drafts
6. Applies all gates
7. Sends Telegram summary:

   🤖 ORCHESTRATOR — Inbox/Triage
   Step 7/10
   Нашел 12 писем за 24ч: 2 URGENT, 4 HIGH, 3 MEDIUM, 3 LOW.
   Черновики готовы для 6 писем. 2 требуют вашего решения (см. детали).
   [Утвердить все HIGH]  [Просмотреть по одному]  [Пропустить]
   wf_id: INBOX_TRIAGE_2026_04_27_01

8. Aram clicks [Утвердить все HIGH]
9. Orchestrator sends 4 HIGH drafts via emailer.send
10. Archives instance, logs to Sheet
```

### Example 2: Ad-hoc — new distributor onboarding

```
Aram: "Онбординг нового дистрибьютора из ОАЭ, компания MediCare Gulf LLC"

Orchestrator:
1. No template match → Ad-hoc mode
2. Phase 1 — proposes plan:

   🤖 ORCHESTRATOR — B2B/Plan
   Step 1/1 (planning)
   Предлагаю план для онбординга MediCare Gulf LLC (ОАЭ):
   1. Поиск контакта (contacts + sales-hunter)
   2. Первое письмо — интро + запрос данных (personizer → emailer)
   3. Ожидание ответа
   4. NDA проект (legalizer)
   5. Коммерческое предложение (personizer + pricer → emailer)
   6. Ожидание подписания
   [Запустить]  [Изменить план]  [Отменить]
   wf_id: B2B_ONBOARD_MEDICARE_2026_04_27_01

3. Aram clicks [Запустить]
4. Orchestrator executes Phase 2 step-by-step
```

### Example 3: Auto-detection — recurring distributor follow-up

```
[After 3 ad-hoc runs of "follow-up with distributor who hasn't responded" pattern]

Orchestrator via Telegram:
   🤖 ORCHESTRATOR — Template/Proposal
   Step 1/1
   Обнаружил повторяющийся паттерн: "follow-up inactive distributor" — 
   3 запуска за 28 дней, структура идентична, решения Арама стабильны.
   Предлагаю сохранить как шаблон "distributor-followup".
   Черновик шаблона готов в pending-templates/.
   [Сохранить шаблон]  [Просмотреть]  [Пропустить]
   wf_id: AUTO_DETECT_DISTFOLLOWUP_2026_05_01_01
```

---

## Anti-patterns

| Anti-pattern | Why bad | Correct approach |
|---|---|---|
| Orchestrator writes email body itself | Bypasses skill logic, brand rules, product gates | Always call personizer/sales-hunter/review-master for content |
| Continuing after gate HALT | Single bad fact in a sent email = brand damage | Every gate HALT stops execution; Aram must resolve |
| Parallel state writes without lock | Race condition corrupts instance JSON | LockService before every Drive write |
| Sending Telegram without wf_id | Aram can't disambiguate two concurrent workflows | wf_id in footer of every message, always |
| Hardcoding Telegram chat_id in bundle | Security: chat ID exposed in source | Always from Script Properties `ARAM_TELEGRAM_CHAT_ID` |
| Treating ad-hoc approval as permanent | Approval covers this run only | Each ad-hoc run requires fresh Phase 1 approval |

---

## References

| Topic | File |
|---|---|
| Mandatory consistency gates | `reference/consistency-rules.md` |
| Mode selection algorithm | `reference/mode-selection.md` |
| State schema + LockService | `reference/state-management.md` |
| Instance lifecycle transitions | `reference/instance-lifecycle.md` |
| Telegram message types | `reference/telegram-templates.md` |
| When to HALT vs continue | `reference/escalation-thresholds.md` |
| Auto-detection criteria | `reference/auto-detection-rules.md` |
| Ad-hoc protocol phases | `reference/ad-hoc-protocol.md` |
| Audit logging requirements | `reference/audit-requirements.md` |
| Apps Script source | `backend/orchestrator-bundle.gs` |
| Deployment guide | `backend/SETUP_NOTES.md` |
| Deploy checklist | `DEPLOY_CHECKLIST.md` |

---

## Versioning

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-04-27 | Initial release. Three-mode operation, inbox-triage template, full reference set, Apps Script bundle. |

---

**Source of truth references:**
- Personas, signatures → `my-tools/Virtual_staff.md`
- Counterparty data → `my-skills/contacts/`
- Product facts → `my-skills/product-skill/`
- Legal review → `my-skills/legalizer/`
- Agent architecture → `agents/README.md`

When in conflict between this SKILL.md and any reference file — **reference file wins** on its specific topic.
