# telegram-templates.md

Five message types used by orchestrator for all Aram interactions.
Includes format, button schema, parsing rules, and Russian-language examples.

---

## Universal message envelope

Every orchestrator Telegram message MUST contain these sections in order:

```
🤖 ORCHESTRATOR — <ShortLabel>
Step N/M

<Body — 3-5 lines>

<Buttons — inline keyboard, 1-3 rows>

wf_id: <wf_id>
```

**ShortLabel rules:**
- Max 4 words
- Format: `<Subject>/<Stage>` — e.g. `Inbox/Triage`, `B2B/Onboard`, `Contract/Review`
- Consistent across all messages in the same workflow instance
- Varies by stage: `Inbox/Triage` → `Inbox/Approve` → `Inbox/Done`

**Step counter:**
- `Step N/M` where N = current step, M = total known steps
- For ad-hoc workflows where total is unknown: `Step N/~M` (tilde for estimate)
- Planning phase is always `Step 1/1 (planning)` regardless of plan steps

**Body:**
- Max 5 lines for summary messages
- Max 10 lines for review messages (showing draft content)
- If content exceeds: truncate at 1500 characters with `...<обрезано, полная версия в Drive: <link>>`
- No pleasantries, no "I have completed", no "As you requested"
- State facts: what was found, what was done, what is needed

**wf_id footer:**
- Always on the last line
- Plain text, no formatting
- Format: `wf_id: INBOX_TRIAGE_2026_04_27_01`

---

## Type 1: Binary

**When:** Simple yes/no, approve/reject, send/discard decisions.

**Format:**

```
🤖 ORCHESTRATOR — <ShortLabel>
Step N/M

<Body>

[<positive_action>]  [<negative_action>]

wf_id: <wf_id>
```

**Button schema:**
```json
{
  "inline_keyboard": [
    [
      {"text": "<positive_action>", "callback_data": "<wf_id>|<step>|yes"},
      {"text": "<negative_action>", "callback_data": "<wf_id>|<step>|no"}
    ]
  ]
}
```

**Parsing:** `choice = yes | no`

**Example — send approval:**

```
🤖 ORCHESTRATOR — Inbox/Approve
Step 8/10

Черновик для TORI-GEORGIA готов:
  Тема: Отгрузка контейнера MSCU1234567 — подтверждение
  Получатель: orders@tori-georgia.ge
  Режим: A (Aram Badalyan)
  Gate: product ✓ / legalizer ✓ / Germany ✓

[Отправить]  [Отменить]

wf_id: ADHOC_TORI_2026_04_27_01
```

**Example — discard draft:**

```
🤖 ORCHESTRATOR — Inbox/Draft
Step 5/10

Черновик ответа Марко Росси (EMEA, итальянский):
  "Buongiorno Marco, grazie per il Suo messaggio..."
  <первые 200 символов>

Gate: Conversion ✓ / Germany ✓ / Product (не применимо)

[Отправить]  [Пропустить это письмо]

wf_id: INBOX_TRIAGE_2026_04_27_01
```

---

## Type 2: Multiple Choice

**When:** Choose one of 3–5 options. Mutually exclusive.

**Format:**

```
🤖 ORCHESTRATOR — <ShortLabel>
Step N/M

<Body>

[Option 1]  [Option 2]  [Option 3]
[Option 4]  [Option 5]

wf_id: <wf_id>
```

**Button layout:** max 3 buttons per row. If 4–5 options, split 3+2.

**Button schema:**
```json
{
  "inline_keyboard": [
    [
      {"text": "Option 1", "callback_data": "<wf_id>|<step>|opt1"},
      {"text": "Option 2", "callback_data": "<wf_id>|<step>|opt2"},
      {"text": "Option 3", "callback_data": "<wf_id>|<step>|opt3"}
    ],
    [
      {"text": "Option 4", "callback_data": "<wf_id>|<step>|opt4"}
    ]
  ]
}
```

**Parsing:** `choice = opt1 | opt2 | opt3 | opt4 | opt5`

**Example — urgency override:**

```
🤖 ORCHESTRATOR — Inbox/Classify
Step 3/10

Письмо не классифицировано автоматически:
  От: pierre@example.fr → emea@dasexperten.de
  Тема: Question sur le dentifrice blanc
  Язык: Французский (не покрыт штатом)
  Автоклассификация: невозможно

Выберите действие:

[URGENT — отвечаю сам]  [HIGH — по-английски (Klaus)]  [LOW — пропустить]

wf_id: INBOX_TRIAGE_2026_04_27_01
```

**Example — inbox selection:**

```
🤖 ORCHESTRATOR — Mode/Select
Step 1/1

Несколько шаблонов подходят под запрос "проверь emea":
  1. inbox-triage (score: 0.91)
  2. email-blast  (score: 0.85)

[inbox-triage]  [email-blast]  [Другой — опишите]

wf_id: MODE_SEL_1714199473
```

---

## Type 3: Approval (with optional edit)

**When:** Multi-step approval where Aram may want to review, edit, or reject.
Heavier than binary — used when the decision has downstream consequences (sending documents, signing contracts).

**Format:**

```
🤖 ORCHESTRATOR — <ShortLabel>
Step N/M

<Summary of what is being approved>

<Preview of content — truncated to 800 chars if needed>

[Утвердить]  [Редактировать]  [Отклонить]

wf_id: <wf_id>
```

**Button schema:**
```json
{
  "inline_keyboard": [
    [
      {"text": "Утвердить",     "callback_data": "<wf_id>|<step>|approve"},
      {"text": "Редактировать", "callback_data": "<wf_id>|<step>|edit"},
      {"text": "Отклонить",     "callback_data": "<wf_id>|<step>|reject"}
    ]
  ]
}
```

**Parsing:**
- `approve` → continue workflow
- `edit` → orchestrator sends free-text prompt: "Введите исправленный текст или укажите что изменить:"
- `reject` → HALT, ask how to proceed

**Example — B2B letter approval:**

```
🤖 ORCHESTRATOR — B2B/Approve
Step 3/6

Черновик письма для MediCare Gulf LLC готов:
  Отправитель: Aram Badalyan (Mode A)
  Тема: Das Experten — Partnership introduction
  
  "Dear MediCare Gulf team,
   We are reaching out to introduce Das Experten, a premium oral care
   brand with established distribution across EU and CIS markets..."

Gate: legalizer ✓ / Germany ✓ / contacts ✓

[Утвердить]  [Редактировать]  [Отклонить]

wf_id: B2B_ONBOARD_MEDICARE_2026_04_27_01
```

**Example — NDA approval (legalizer gate YELLOW):**

```
🤖 ORCHESTRATOR — Contract/Review ⚠️
Step 4/6

Черновик NDA прошёл legalizer с пометкой YELLOW:
  Контрагент: MediCare Gulf LLC (UAE)
  Юрисдикция: UAE / DIFC
  
  Замечание legalizer: "Арбитражная оговорка ссылается на ICC Rules 2021,
  но без указания места арбитража. Рекомендуется добавить: 'Place of
  arbitration: Dubai, UAE.'"
  
  Полный документ: <Drive link>

[Утвердить как есть]  [Добавить оговорку]  [Передать юристу]

wf_id: B2B_ONBOARD_MEDICARE_2026_04_27_01
```

---

## Type 4: Free-Text Request

**When:** Aram must type a response (no predefined options). Used rarely — only when
the required input is open-ended and cannot be reduced to buttons.

**Format:**

```
🤖 ORCHESTRATOR — <ShortLabel>
Step N/M

<What is needed>
<Why buttons aren't enough>

Введите ответ текстом:
[Пропустить этот шаг]  [Отменить workflow]

wf_id: <wf_id>
```

**Parsing:** next free-text message from Aram in this chat → attributed to this instance
(if it's the only AWAITING_INPUT instance with `awaiting_input_type: "free_text"`).

**Example — subject line needed:**

```
🤖 ORCHESTRATOR — Email/Subject
Step 2/5

Персонализер не смог определить тему письма — контекст переписки отсутствует.
Получатель: новый контакт zakaria@pharma-uae.com

Введите тему письма:
[Пропустить этот шаг]  [Отменить workflow]

wf_id: ADHOC_UAE_2026_04_29_01
```

---

## Type 5: Urgent (Escalation)

**When:** Hard gate HALT, critical error, stale reminder, or time-sensitive decision.
Visual indicator: 🔴 in ShortLabel. Maximum 2 buttons.

**Format:**

```
🤖 ORCHESTRATOR — <ShortLabel> 🔴
Step N/M — ТРЕБУЕТ ВНИМАНИЯ

<What went wrong or why urgent>
<Minimal context — no fluff>

[🔴 <primary_action>]  [Отложить]

wf_id: <wf_id>
```

**Button schema:**
```json
{
  "inline_keyboard": [
    [
      {"text": "🔴 <primary_action>", "callback_data": "<wf_id>|<step>|urgent_act"},
      {"text": "Отложить",            "callback_data": "<wf_id>|<step>|defer"}
    ]
  ]
}
```

**Parsing:**
- `urgent_act` → execute the specified recovery action
- `defer` → set state to AWAITING_INPUT at current step, send reminder in 4 hours

**Example — Germany gate hard HALT:**

```
🤖 ORCHESTRATOR — Gate/Germany 🔴
Step 6/10 — ТРЕБУЕТ ВНИМАНИЯ

В тексте письма обнаружена недопустимая фраза:
  "...our German-engineered formula provides..."
  (письмо клиенту Marco Rossi, EMEA, итальянский)

Отправка заблокирована.

[🔴 Удалить фразу и продолжить]  [Переписать черновик заново]

wf_id: INBOX_TRIAGE_2026_04_27_01
```

**Example — Product gate HALT:**

```
🤖 ORCHESTRATOR — Gate/Product 🔴
Step 5/10 — ТРЕБУЕТ ВНИМАНИЯ

product-skill не подтвердил утверждение в черновике:
  "INNOWEISS содержит 1450 ppm фтора"
  product-skill: данные о концентрации фтора в INNOWEISS не найдены

Факт не может быть отправлен без верификации.

[🔴 Удалить фразу из черновика]  [Уточнить у технолога]

wf_id: INBOX_TRIAGE_2026_04_27_01
```

---

## Type 6: Auto-Detection Promotion Proposal

**When:** Auto-detection criteria met — orchestrator proposes promoting a recurring ad-hoc pattern to a named template.

**Format:**

```
🤖 ORCHESTRATOR — Template/Proposal
Step 1/1

Я заметил повторяющийся паттерн:
"<proposed_name>" — <N> раза за последние <D> дней

Совпадение шагов: <similarity>%
Instances: <wf_id_1>, <wf_id_2>, <wf_id_3>
Решения Арама: стабильные (0 переопределений)

Драфт нового шаблона готов.

[📄 Показать драфт]  [✅ Approve & auto-merge]
[✏️ Сначала отредактирую в Drive]  [❌ Это не паттерн]

wf_id: AUTO_DETECT_<name>_<date>
```

**Button schema:**
```json
{
  "inline_keyboard": [
    [
      {"text": "📄 Показать драфт",         "callback_data": "<wf_id>|1|show_draft"},
      {"text": "✅ Approve & auto-merge",    "callback_data": "<wf_id>|1|approve_merge"}
    ],
    [
      {"text": "✏️ Сначала отредактирую в Drive", "callback_data": "<wf_id>|1|edit_drive"},
      {"text": "❌ Это не паттерн",          "callback_data": "<wf_id>|1|decline"}
    ]
  ]
}
```

**Parsing:**
- `show_draft` → fetch draft from Drive, send truncated preview (first 1000 chars) + Drive link; follow-up buttons: `[✅ Approve & auto-merge]` `[✏️ Редактировать]` `[❌ Decline]`
- `approve_merge` → run `githubFullPipeline_()`, confirm with merge SHA + PR link on success
- `edit_drive` → send Drive link, set `awaiting_input_type: "free_text"`, re-validate on next Aram message
- `decline` → delete Drive draft, log `declined` in Sheet, suppress pattern 30 days

---

## Type 7: GitHub PR Validation Failed

**When:** `githubValidateBeforeMerge_()` returns errors after PR creation. PR stays open for manual review.

**Format:**

```
🤖 ORCHESTRATOR — GitHub/Validation ⚠️
Step 1/1

Шаблон "<name>" создан как PR, но не прошёл автоматическую проверку.
PR остаётся открытым для ручного review.

Ошибки валидации:
  • <error_1>
  • <error_2>

PR: <github_pr_url>

[🔗 Открыть PR]  [❌ Закрыть PR]

wf_id: <wf_id>
```

**Parsing:**
- `open_pr` → no action (link already provided — this button is cosmetic)
- `close_pr` → call GitHub API to close PR (DELETE branch), log in Sheet as `validation_failed_closed`

---

## Type 8: Token Rotation Reminder

**When:** `tokenRotationReminder()` detects `GITHUB_PAT_ISSUED_DATE` ≥ 80 days ago.

**Format (80-day warning):**

```
🤖 ORCHESTRATOR — Security/Token ⚠️
Step 0/0

GITHUB_PAT будет действителен ещё ~<N> дней.
Рекомендуется обновить токен заранее.

Ссылка: https://github.com/settings/tokens

[Уже обновил]  [Напомнить через 7 дней]

wf_id: TOKEN_ROTATION_<date>
```

**Format (90-day critical):**

```
🤖 ORCHESTRATOR — Security/Token 🔴
Step 0/0 — ТРЕБУЕТ ВНИМАНИЯ

GITHUB_PAT предположительно истёк (выдан >90 дней назад).
GitHub-операции (auto-merge) будут завершаться с ошибкой 401.

Действие: обновить GITHUB_PAT в Script Properties.
После обновления — обновить GITHUB_PAT_ISSUED_DATE.

[Уже обновил]  [Отложить]

wf_id: TOKEN_ROTATION_<date>
```

**Parsing:**
- `already_updated` → confirm receipt, no further action (operator handles Script Properties manually)
- `remind_7d` / `defer` → suppress for 7 days, set next reminder via Sheet entry

---

## Button callback_data format

All callbacks follow: `<wf_id>|<step_index>|<choice>`

Example: `INBOX_TRIAGE_2026_04_27_01|7|approve`

Separator: `|` (pipe). wf_id never contains `|`.

Orchestrator validation on receive:
1. Split by `|` → 3 parts required
2. Part 0 = wf_id → find active instance
3. Part 1 = step_index → must match `current_step` in state (otherwise stale button)
4. Part 2 = choice → validate against allowed choices for that step type

If validation fails → silently discard (do not error, do not send confused message).

---

## Message editing vs new message

- **Progress updates** during RUNNING: send new message (do not edit previous)
- **Reminder pings** (heartbeat): send new message referencing previous wf_id
- **After Aram responds to AWAITING_INPUT**: edit the original message to remove buttons,
  append "✓ Ответ получен: <choice>" — prevents accidental re-clicks on stale buttons
- **Gate HALTs that resolve**: edit original HALT message to show resolved status

`editMessageText` uses `last_telegram_message_id` from state.
