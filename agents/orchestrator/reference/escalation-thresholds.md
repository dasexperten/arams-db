# escalation-thresholds.md

When orchestrator halts vs continues. Concrete triggers for each HALT type.
The guiding principle: halt when a wrong decision causes irreversible harm (sent email,
signed contract, published post). Continue when the worst case is a slight inefficiency.

---

## HALT vs CONTINUE decision framework

**HALT (stop execution, require Aram input) when:**
- Output will be sent to a third party (email, document, marketplace post) AND cannot be recalled
- Legal, financial, or regulatory claims are unverified
- Brand integrity is at risk (Germany mention, unverified product claim)
- Ambiguity exists about the recipient, persona, or mode
- An error is unrecoverable without human judgment

**CONTINUE (proceed, log warning) when:**
- The worst case is a repeated or inefficient internal operation
- Classification is uncertain but has no external side effects
- A read operation (find emails, fetch data) fails — retry with reduced scope
- Logging or archiving fails — email still sends, log warning in state

---

## Trigger matrix

### Hard HALT (requires Aram action before any execution continues)

| Trigger | Condition | Gate |
|---|---|---|
| Product claim in outbound draft | product-skill returns uncertain or not found | Product Knowledge Gate |
| Legal content, risk RED | legalizer returns RED risk level | Legalizer Gate |
| Germany phrase detected | Any forbidden Germany mention found in any language | Germany-Mention Check |
| B2B contact data missing | IBAN / email / tax ID not in contacts and needed for sending | Contacts Gate |
| Signature routing ambiguous | Cannot determine Mode A vs B vs C | Signature Routing Gate |
| Non-B2C draft fails Conversion Gate twice | Second rewrite also fails | Conversion Gate |
| 3 consecutive step errors | Same step fails 3 times → retry limit | Error Recovery |
| Apps Script execution near timeout | Remaining time < 30 seconds in non-idempotent step | Timeout Safety |
| GitHub token expired/revoked | GitHub API returns 401 on any operation | GitHub Auth |
| GitHub token insufficient scope | GitHub API returns 403 (permissions) | GitHub Auth |
| GitHub rate limit not resolvable | 403 + RateLimit-Remaining=0 and reset >120s away | GitHub Rate Limit |
| Template file already exists on main | GET contents returns 200 before commit | GitHub Conflict |
| Commit conflict mid-pipeline | GitHub returns 409 on commit | GitHub Conflict |
| GitHub PR creation fails after 3 retries | All backoff retries exhausted | GitHub API Error |

---

### Review HALT (sends to Aram with approve/edit/reject options; orchestrator waits)

| Trigger | Condition |
|---|---|
| Legal content, risk YELLOW | legalizer returns YELLOW — requires attention but not blocking |
| Draft > 1500 chars for Telegram preview | Truncated — Drive link provided — Aram may want to review full |
| New B2B partner, first outreach | Always draft_only on first cold email regardless of mode |
| Template match confidence 0.60–0.84 | Weak template match — confirm before executing |
| Multiple template matches at ≥ 0.85 | Disambiguation required |
| Ad-hoc plan proposed | Phase 1 — always requires Aram approval before execution |
| Auto-detection template draft | Always requires Aram approval before promoting to workflows/ |
| Unsupported language detected | Customer language not covered by any virtual staff member |

---

### Warning (continues with note in state, no HALT)

| Trigger | Condition | Logged where |
|---|---|---|
| Archive step fails | Reporter Doc creation fails | `state.error_log`, non-fatal |
| Sheet index write fails | Log Sheet unavailable | `console.warn`, execution continues |
| Skill returns marginally uncertain | product-skill confidence 0.7–0.9 (above threshold) | `state.data` metadata |
| Read operation returns empty | emailer.find returns 0 threads | Telegram progress update, moves on |
| Retry succeeds on 2nd attempt | 429 rate limit from emailer or any API | `state.error_log`, no user notification |

---

## Detailed HALT scenarios

### Scenario 1: product-skill returns uncertain during inbox-triage

Context: personizer drafted a reply to a customer asking about SYMBIOS ingredients.
Draft contains: "SYMBIOS содержит кальций и цинк для реминерализации эмали."

product-skill query: SYMBIOS ingredients
product-skill result: "SYMBIOS — verified ingredients: hydroxyapatite, zinc PCA, xylitol.
  Calcium not explicitly listed. Remineralization claim: verified via hydroxyapatite."

Assessment: "кальций" (calcium) not verified → product-skill returned uncertain for that claim.

HALT action:
1. Draft flagged at "SYMBIOS содержит кальций" phrase.
2. Hard HALT message sent to Aram (Type 5 Urgent).
3. Aram clicks "Удалить фразу" → orchestrator removes "кальций и" from draft.
4. Re-runs Product Gate → now passes.
5. Continues to next gate.

---

### Scenario 2: legalizer returns RED during NDA drafting

Context: legalizer reviews NDA draft for UAE distributor.
legalizer flags: "Penalty clause specifies 500% of contract value as liquidated damages.
  This is likely void under UAE law as penalty — unenforceable and may invalidate entire clause."

HALT action:
1. Hard HALT (Type 5 Urgent) sent to Aram with legalizer summary.
2. Options: "Передать юристу" / "Переработать документ" / "Отменить workflow".
3. Aram clicks "Передать юристу" → orchestrator notes in state, continues to archive step only.
4. Sends email to Aram with NDA + legalizer notes as attachments (via emailer, Mode A).
5. Marks instance COMPLETED with note "Transferred to legal review — NDA not sent to counterparty."

---

### Scenario 3: unsupported language (French customer on emea@)

Context: inbox-triage finds email from pierre@example.fr in French.

HALT action:
1. Language detected: French.
2. EMEA staff coverage check: no French speaker.
3. Review HALT (Type 2 Multiple Choice) sent to Aram.
4. Options: "URGENT — сам отвечу" / "Klaus — по-английски" / "LOW — пропустить"
5. On Aram's choice → orchestrator continues triage with that thread classified accordingly.

---

### Scenario 4: ambiguous free-text when 2 workflows AWAITING

Context: Aram has two active workflows both waiting for free-text input.
He types: "через 3-4 дня с момента отгрузки"

Aram has no way to know which workflow gets this text.

HALT action:
1. Orchestrator detects two AWAITING_INPUT instances with `awaiting_input_type: "free_text"`.
2. Disambiguation message (Type 2 Multiple Choice):
   "INBOX_TRIAGE_01 — ожидает тему письма для Klaus"
   "B2B_ONBOARD_02 — ожидает срок доставки для NDA"
3. Aram picks "B2B_ONBOARD_02" → text attributed to that instance.

---

### Scenario 5: Apps Script timeout safety

Context: inbox-triage processing large thread (50+ emails, personizer call takes 90s).
Remaining execution time: 28 seconds. Next step: emailer.send (non-idempotent).

HALT action:
1. Orchestrator detects remaining time < 30 seconds.
2. Does NOT call emailer.send (would partial-execute and corrupt state).
3. Saves state, sends Telegram:

```
🤖 ORCHESTRATOR — Inbox/Timeout ⚠️
Step 8/10

Workflow приостановлен из-за лимита времени Apps Script (6 мин).
Все данные сохранены. Нужно продолжить с шага 8.

[Продолжить сейчас]  [Позже]

wf_id: INBOX_TRIAGE_2026_04_27_01
```

4. On "Продолжить сейчас" → new doPost → fresh 6-minute budget → continues from step 8.

---

### Scenario 6: GitHub auto-merge pipeline failures

**Case A — Token expired (401):**

```
🤖 ORCHESTRATOR — GitHub/Auth 🔴
Step 1/1 — ТРЕБУЕТ ВНИМАНИЯ

GITHUB_PAT истёк или был отозван.
GitHub-операция: создание ветки auto-templates/<wf_id>-<slug>

Действие: обновить GITHUB_PAT в Script Properties Apps Script.
После обновления — обновить GITHUB_PAT_ISSUED_DATE.

[🔴 Понял, обновлю]

wf_id: AUTO_DETECT_<name>_<date>
```

No retry after 401 — re-promotion must be triggered manually after token rotation.

**Case B — Template file already exists (conflict):**

```
🤖 ORCHESTRATOR — GitHub/Conflict 🔴
Step 1/1 — ТРЕБУЕТ ВНИМАНИЯ

Шаблон "<name>" уже существует в репозитории.
Путь: agents/orchestrator/workflows/<name>.md

Варианты:

[Переименовать и попробовать снова]  [Отменить]

wf_id: AUTO_DETECT_<name>_<date>
```

On "Переименовать": next Aram free-text message provides new name → orchestrator retries with new slug.

**Case C — Validation failed (PR open, not merged):**

PR stays open. Telegram notification uses Type 7 format (see `telegram-templates.md`).
Not a HALT — workflow instance moves to COMPLETED with `validation_status: failed:<errors>` in Sheet.

---

## Per-workflow escalation customization

Templates may not disable mandatory gates (see `consistency-rules.md`).
Templates MAY specify additional escalation thresholds specific to that workflow:

```markdown
# In workflow template frontmatter
escalation_overrides:
  - step: "send_cold_email"
    always_draft_only: true    # always pause before sending cold email
  - step: "classify_urgency"
    halt_on_low_confidence: true  # halt if classification confidence < 0.75
```

These are additive — they add HALT triggers, never remove mandatory ones.
