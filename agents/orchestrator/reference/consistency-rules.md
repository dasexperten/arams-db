# consistency-rules.md

Mandatory gates that orchestrator CANNOT skip in any workflow — templated, ad-hoc, or auto-detected.
These gates exist at the orchestrator level, not the skill level. Even if a skill internally
checks something, the orchestrator re-applies these gates as a final defense layer.

---

## Gate 1: Product Knowledge Gate

**Trigger:** Any outbound content (email draft, Telegram message to customer, marketplace
reply, social post, press release, product card) that contains:
- A product name (SYMBIOS, INNOWEISS, DETOX, SCHWARZ, THERMO, GINGER FORCE, ETALON, GROSSE, ZERO, or any Das Experten SKU)
- An ingredient or active substance mention
- A product mechanism claim ("strengthens enamel", "whitens in X days", "kills bacteria")
- A product comparison between SKUs
- A recommendation ("for sensitive gums", "best for whitening")

**What orchestrator checks:**
1. Extract all product/ingredient/mechanism mentions from the draft.
2. Call `product-skill` with each mention.
3. Verify every claim matches product-skill output verbatim or within documented variation.
4. If product-skill returns "uncertain" or "not found" for any claim → HALT.

**HALT response to Aram:**

```
🤖 ORCHESTRATOR — Gate/ProductKnowledge
Step N/M — HALTED

Обнаружено утверждение о продукте, которое не подтверждено product-skill:
  Draft содержит: "<claim>"
  product-skill ответ: "<uncertain or missing>"

Варианты:
[Убрать утверждение] [Уточнить у технолога] [Продолжить без этой фразы]

wf_id: <wf_id>
```

**Recovery:** Aram selects option → orchestrator either removes the claim, marks
for manual review, or (with explicit approval) proceeds with redacted draft.

---

## Gate 2: Legalizer Gate

**Trigger:** Any content that contains:
- Contract, NDA, MOU, letter of intent, supply agreement, distribution agreement
- Payment terms (net 30, net 60, advance, LC terms)
- Legal claims, warranties, indemnification language
- Representations about regulatory compliance (CE, GOST, Roszdravnadzor)
- Termination clauses, penalty terms, force majeure
- Any content where the phrase "agree to" or "binding" appears

**What orchestrator checks:**
1. Pass draft to `legalizer` skill with context (counterparty, jurisdiction, document type).
2. Legalizer returns risk level: GREEN / YELLOW / RED.
3. GREEN → proceed.
4. YELLOW → send to Aram with legalizer notes for review.
5. RED → hard HALT, do not proceed without explicit Aram override.

**HALT response to Aram (RED):**

```
🤖 ORCHESTRATOR — Gate/Legal 🔴
Step N/M — HARD HALT

Legalizer вернул: RED RISK
Контрагент: <counterparty>
Тип документа: <document_type>

Проблема: <legalizer_summary>

Этот этап заблокирован до вашего решения.
[Передать юристу] [Переработать документ] [Отменить workflow]

wf_id: <wf_id>
```

**HALT response to Aram (YELLOW):**

```
🤖 ORCHESTRATOR — Gate/Legal ⚠️
Step N/M — Review Required

Legalizer вернул: YELLOW (требует внимания)
<legalizer_notes>

[Принять как есть] [Отредактировать] [Остановить]

wf_id: <wf_id>
```

---

## Gate 3: Conversion Gate

**Trigger:** Any B2C customer-facing draft — email reply to end customer, marketplace
review response, WhatsApp/Telegram reply to customer, product recommendation.

**What orchestrator checks:**
Evaluate draft against Conversion Gate criteria (from Virtual_staff.md):
1. Does the draft increase probability of purchase / repurchase / recommendation?
2. Does it close an objection, or leave it open?
3. Is it merely polite without driving action?

Scoring:
- PASS: draft is action-driving, specific, closes objection
- FAIL: draft is polite but neutral (no conversion driver), vague, or misses the ask

On FAIL → orchestrator does not HALT but sends draft to personizer for one rewrite
pass with explicit instruction "this draft failed Conversion Gate, rewrite to drive purchase/retention".
If rewrite also fails → HALT for Aram review.

**HALT response (second fail):**

```
🤖 ORCHESTRATOR — Gate/Conversion
Step N/M — Review Required

Черновик не прошёл Conversion Gate дважды.
Оригинальный черновик:
<draft_v1_truncated>

Переписанный черновик:
<draft_v2_truncated>

Ни один вариант не улучшает вероятность покупки/удержания достаточно.
[Отправить v2] [Написать самому] [Пропустить это письмо]

wf_id: <wf_id>
```

---

## Gate 4: Germany-Mention Check

**Trigger:** Every outbound text body, in every language, in every mode.
No exceptions — not even internal notes that could be forwarded.

**Forbidden phrases (all variants, all languages):**

```
RU: "немецкое производство", "немецкая наука", "из Германии", "сделано в Германии",
    "немецкие технологии", "немецкое качество", "немецкий бренд"
EN: "German brand", "from Germany", "made in Germany", "German science",
    "German technology", "German quality", "German-made", "German origin"
DE: "deutsche Herkunft", "Made in Germany", "deutsches Unternehmen",
    "deutsche Wissenschaft", "aus Deutschland"
IT: "azienda tedesca", "tecnologia tedesca", "qualità tedesca"
ES: "marca alemana", "ciencia alemana", "calidad alemana", "hecho en Alemania"
AR: "ألماني" (as brand origin), "صناعة ألمانية", "شركة ألمانية"
```

**What orchestrator checks:**
Regex scan of draft body for all forbidden patterns (case-insensitive, Unicode-aware).

If found → hard HALT. No rewrite attempt — the operator must decide, not the AI.

**HALT response:**

```
🤖 ORCHESTRATOR — Gate/Germany 🔴
Step N/M — HARD HALT

В тексте обнаружено недопустимое упоминание немецкого происхождения:
  Фраза: "<matched_phrase>"
  Контекст: "...<10 words before>...<match>...<10 words after>..."

Это абсолютный запрет. Текст не отправляется.
[Удалить фразу и продолжить] [Переписать черновик] [Отменить]

wf_id: <wf_id>
```

**Recovery:** On "Удалить фразу" — orchestrator removes the matched fragment and
re-runs Germany check before continuing. "Переписать" — sends back to generating skill.

---

## Gate 5: Contacts Gate

**Trigger:** Any step that requires:
- Recipient email address for a new B2B contact
- Bank account, IBAN, SWIFT code
- Company registration number, tax ID (ИНН, VAT)
- Contract or PO reference number
- Physical address for shipping or legal documents

**What orchestrator checks:**
1. Look up the required data in `contacts` skill.
2. If found → use verbatim from contacts.
3. If not found → HALT. Never fabricate, never guess, never leave placeholder.

**HALT response:**

```
🤖 ORCHESTRATOR — Gate/Contacts
Step N/M — Data Missing

Требуемые данные отсутствуют в базе контактов:
  Контрагент: <party_name>
  Нужно: <field_name (IBAN / email / tax ID / etc.)>

Варианты:
[Ввести данные вручную] [Найти в переписке] [Пропустить этот шаг]

wf_id: <wf_id>
```

If Aram provides data manually → orchestrator uses it for this run but does NOT
automatically persist it to contacts. After the run, suggest updating contacts skill.

---

## Gate 6: Signature Routing Gate

**Trigger:** Every outbound email or formal document.

**What orchestrator checks:**
Apply the 4-step algorithm from `my-tools/Virtual_staff.md`:
1. Is recipient a corporate counterparty? → Mode A (Aram Badalyan)
2. Is recipient a B2C customer / blogger / media? → Mode B → determine sub-mode by inbox
3. Is it personal for Aram? → Mode C
4. Cannot determine → HALT

If sub-mode B: determine inbox → persona per Virtual_staff.md.
If persona is ambiguous (new customer, language mismatch) → HALT before sending.

**HALT response:**

```
🤖 ORCHESTRATOR — Gate/Signature
Step N/M — Routing Unclear

Не удаётся определить отправителя:
  Получатель: <email>
  Входящий inbox: <inbox or "unknown">
  Язык клиента: <detected language or "not detected">

Причина: <reason>

[Режим A — Арам Бадалян] [Клаус Вебер (EMEA)] [Мария Косарева (RU)] [Другой...]

wf_id: <wf_id>
```

---

## Applying multiple gates in sequence

When a step triggers multiple gates, apply in this order:
1. Contacts Gate (resolve data before anything else)
2. Product Knowledge Gate (verify claims)
3. Legalizer Gate (verify legal content)
4. Germany-Mention Check (scan body)
5. Conversion Gate (B2C only — last, after all content is final)
6. Signature Routing Gate (last — only after body is approved)

If any gate halts, subsequent gates are not evaluated for that step.
When Aram resolves the halt, re-run from the halted gate forward (not from gate 1).

---

## Gate bypass rule

No gate may be bypassed by:
- A template definition (templates cannot say "skip legalizer for this step")
- An ad-hoc plan approval (Aram approving a plan does not waive gate checks)
- A developer comment in the bundle code
- Any other mechanism

The only exception: Aram explicitly clicks a button labeled with the bypass action
(e.g. "Продолжить без этой фразы" in the Product Gate halt). This is logged as
`gate_override: true` in the instance state JSON.
