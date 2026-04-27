# mode-selection.md

Algorithm for choosing Templated / Ad-hoc / Auto-detection mode.
Runs at the start of every workflow, before any step is executed.

---

## Input

The raw text of Aram's Telegram message (trigger text).

Pre-processing:
1. Lowercase
2. Trim leading/trailing whitespace
3. Normalize Unicode (NFC)
4. Strip punctuation except hyphens and slashes (preserved for compound words and abbreviations)

---

## Step 1: Extract intent tokens

Split pre-processed text into tokens. Flag:
- **Action tokens:** verbs — отправь, разбери, проверь, запусти, составь, напиши, найди, посчитай, сделай, ответь, подготовь, онбординг, triage, check, send, find, draft, review
- **Object tokens:** nouns — почта, inbox, письмо, письма, клиент, дистрибьютор, контракт, отзыв, баннер, инвойс, поставка, NDA, follow-up, рассылка
- **Scope tokens:** qualifiers — всех, все, утренняя, срочно, только, emea, eurasia, export, marketing, wb, ozon

---

## Step 2: Template matching

Load every template from `agents/orchestrator/workflows/` (any `.md` file not starting with `_`).
For each template, read its `trigger_phrases` frontmatter list.

Compute match score for each template:

```
score = (matching_tokens / template_trigger_tokens) × coverage_bonus
```

Where:
- `matching_tokens` = number of trigger_phrase tokens that appear in the extracted intent
- `template_trigger_tokens` = total tokens in the best-matching trigger phrase for that template
- `coverage_bonus` = 1.2 if all primary tokens (first 3) are matched; 1.0 otherwise

**Decision thresholds:**

| Score | Decision |
|---|---|
| ≥ 0.85 | Template match → Templated mode |
| 0.60 – 0.84 | Weak match → ask Aram to confirm |
| < 0.60 | No template match → proceed to Step 3 |

**Tie-breaking:** multiple templates score ≥ 0.85 → send disambiguation to Aram:

```
🤖 ORCHESTRATOR — Mode/Select
Несколько шаблонов подходят:
  1. inbox-triage (score: 0.91)
  2. email-blast  (score: 0.88)
Какой запустить?
[inbox-triage] [email-blast] [Другой (опишите)]
wf_id: MODE_SEL_<timestamp>
```

---

## Step 3: Ad-hoc history check

Query `ORCHESTRATOR_INDEX_SHEET_ID` for runs in last 30 days with `mode = ad-hoc`.

For each past ad-hoc run, compute text similarity between current trigger and
`params.original_trigger` of that run using token-overlap Jaccard coefficient:

```
jaccard = |A ∩ B| / |A ∪ B|
```

Where A = tokens of current trigger, B = tokens of past trigger.

Group past runs by similarity bucket ≥ 0.80. If a bucket has ≥ 3 runs:
- Check if Aram's decisions at each step were stable (no override clicks, no plan edits)
- If stable → auto-detection candidate found

**Decision:**

| Condition | Decision |
|---|---|
| Auto-detection candidate found | Show auto-detection offer (Mode 3) to Aram; default action falls back to ad-hoc |
| No candidate | Proceed to Step 4 (Ad-hoc) |

Note: the auto-detection offer is non-blocking. Aram can click "Пропустить" and run ad-hoc as usual.

---

## Step 4: Ad-hoc mode

No template matched at ≥ 0.85. No or skipped auto-detection candidate.

→ Ad-hoc mode. Proceed to Phase 1 (Planning).
→ Create instance with `mode: "ad-hoc"`.
→ Full protocol: `reference/ad-hoc-protocol.md`.

---

## Decision tree (compact)

```
[trigger text]
     │
     ▼
Pre-process + extract intent tokens
     │
     ▼
Match against workflow templates
     │
     ├── score ≥ 0.85 (one match) ──────────────► TEMPLATED MODE
     │
     ├── score ≥ 0.85 (multiple) ───────────────► Ask Aram to disambiguate
     │
     ├── score 0.60–0.84 ──────────────────────► Ask Aram to confirm template
     │                                             ("Did you mean inbox-triage?")
     │
     └── score < 0.60
              │
              ▼
         Query ad-hoc history (30 days)
              │
              ├── ≥ 3 similar runs, stable decisions ──► Offer AUTO-DETECTION
              │                                           (Aram can skip → AD-HOC)
              │
              └── else ──────────────────────────────► AD-HOC MODE
```

---

## Concrete examples

### Templated match

Trigger: `"утренняя почта"`
Tokens: `[утренняя, почта]`
Template inbox-triage triggers: `["утренняя почта", "разбор inbox", "triage", "проверь почту"]`
Best phrase: "утренняя почта" → 2/2 tokens matched, coverage_bonus = 1.2
Score: 1.0 × 1.2 = 1.2 → capped at 1.0 → **TEMPLATED**

---

Trigger: `"посмотри что пришло на почту"`
Tokens: `[посмотри, что, пришло, на, почту]`
Template inbox-triage best phrase: "проверь почту" → "почту" matches (1/2), no coverage_bonus
Score: 0.5 × 1.0 = 0.50 → below 0.60 → goes to Step 3

Step 3: past runs found: "что пришло на emea" (jaccard 0.60), "посмотри inbox" (0.55)
No bucket reaches ≥ 3 runs with ≥ 0.80 similarity
→ **AD-HOC**

Follow-on: orchestrator checks if weak match (0.60 from template) should be surfaced:
Yes — score was 0.50 which is below the "ask to confirm" range (0.60–0.84), so no template offer.
Proceed with ad-hoc.

---

### Ad-hoc, no history

Trigger: `"составь NDA для нового дистрибьютора из ОАЭ"`
Tokens: `[составь, nda, для, нового, дистрибьютора, из, оаэ]`
No template triggers contain these tokens → score < 0.60 for all
No past runs in ad-hoc history match at ≥ 0.80
→ **AD-HOC**

---

### Auto-detection candidate

Trigger: `"follow-up Torwey они не ответили"`
Past runs (last 30 days):
- "follow-up Natusana не отвечают" — jaccard 0.60
- "Natusana опять не ответила сделай follow-up" — jaccard 0.55  
- "follow-up ArvitPharm нет ответа" — jaccard 0.58

Bucket at ≥ 0.50 has 3 runs (but threshold is 0.80). Not met → **AD-HOC**.

(Example where threshold IS met — hypothetical):
Past runs:
- "follow-up Torwey not responded" — jaccard 0.89
- "send follow-up to Torwey again" — jaccard 0.82
- "Torwey follow-up 3rd attempt" — jaccard 0.81
All stable (Aram used default "Send" button, no plan edits).
→ Offer **AUTO-DETECTION** to Aram.

---

## Parameter extraction after template match

Once a template is selected, extract parameters from trigger text:

| Template | Extractable params | Example |
|---|---|---|
| inbox-triage | `inbox` (eurasia/emea/export/marketing/all) | "triage emea inbox" → `inbox: emea` |
| [future templates] | defined per template frontmatter | — |

Unrecognized parameters → use template defaults.
Required parameters missing → ask Aram before executing.
