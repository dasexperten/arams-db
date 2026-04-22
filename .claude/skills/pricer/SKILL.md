---
name: pricer
description: >
  Das Experten universal pricing engine. ALWAYS trigger this skill when the user mentions ANY of these exact words or close variants: "pricer", "price", "цена", "прайс", "сколько стоит", "what is the price", "pricing", "price list", "прайс-лист", "FOB price", "distributor price", "purchasing price", "закупочная цена", "дистрибьюторская цена", "международная цена", "розничная цена", "РРЦ", "special price", "price gate", "price-gate", "прайс гейт", or when any other skill needs pricing data for a document, presentation, or calculation. Also trigger when user names a specific SKU (DE201, DE206, DE119, etc.) and asks about its cost, value, or price in any context. Fire immediately on ANY price-related query — do not ask for confirmation before loading this skill.
---

# PRICER — Das Experten Pricing Engine

Universal pricing authority for all Das Experten entities. Knows every price list, every currency rule, every buyer-seller pair. Single source of truth for pricing across all skills.

---

## MANDATORY EXECUTION RULES

- ONE price output per request — never show all price lists simultaneously unless explicitly asked
- NEVER invent prices — all prices come from reference files only
- NEVER guess currency — derive it from seller + buyer pair (see Currency Logic)
- If buyer or seller is unclear → ASK before outputting any price
- Exception: if price list type is explicitly stated (e.g., "FOB Guangzhou price") → currency is already implied, skip buyer/seller clarification
- Always output in Price Block format (see Output Format)
- Skill is permanently open for new price list additions — see Adding New Price Lists section

---

## PRICE LIST REGISTRY

Five active price list types. Each has its own reference file.

| Price List ID  | Name (EN)                             | Name (RU)                          | Currency | Reference File             |
|----------------|---------------------------------------|------------------------------------|----------|----------------------------|
| `PL-INT_USD`   | International Prices (FOB Guangzhou)  | Международные цены                 | USD      | `references/PL-INT_USD.md` |
| `PL-DISTR_RF`  | Russia Distributor Prices             | Дистрибьюторские цены РФ           | RUB      | `references/PL-DISTR_RF.md`|
| `PL-RSP_RF`    | Russia RSP / Recommended Retail       | РРЦ / Рекомендуемые розничные цены | RUB      | `references/PL-RSP_RF.md`  |
| `PL-PRCH_CNY`  | Purchasing Prices (CNY)               | Закупочные цены (юань)             | CNY      | `references/PL-PRCH_CNY.md`|
| `PL-PRCH_USD`  | Purchasing Prices (USD)               | Закупочные цены (доллар)           | USD      | `references/PL-PRCH_USD.md`|

**Special / Named Buyer Price Lists** (add as created):

| Price List ID | Name | Applies To | Reference File |
|---|---|---|---|
| *(none yet)* | — | — | *(add when created)* |

> Special price lists are added as individual reference files. See "Adding New Price Lists" section below.

---

## STEP 1 — PARAMETER COLLECTION

On trigger, extract from context:

| Parameter | How to determine |
|---|---|
| **Seller entity** | From conversation, invoicer call, or ask |
| **Buyer / Recipient** | From conversation, buyer name, country, or ask |
| **Price list type** | Infer from seller+buyer pair via Currency Logic — or take if explicitly stated |
| **Products / SKUs** | From conversation; if ambiguous → call Product Knowledge Gate |
| **Currency** | Auto-derived from seller+buyer (see Currency Logic) |

**Clarification rule:**
- If price list type is explicitly named → skip seller/buyer clarification, load that list directly
- If buyer OR seller is missing AND price list type is not named → ask: *"Who is the seller and who is the buyer / recipient?"*
- Never ask more than one question at a time

---

## STEP 2 — CURRENCY LOGIC

Derive currency and price list from seller + buyer pair:

| Seller | Buyer / Destination | Price List | Currency |
|---|---|---|---|
| **DEE** (Das Experten Eurasia, Russia) | Russia buyer | `PL-DISTR_RF` | RUB |
| **DEE** | International buyer | `PL-INT_USD` | USD |
| **DEI** (Das Experten International, UAE) | Any buyer | `PL-INT_USD` | USD |
| **DEASEAN** (Vietnam) | Any buyer | `PL-INT_USD` | USD |
| **DEC** (Seychelles) | Any buyer | `PL-INT_USD` | USD |
| **Guangzhou Honghui / Yangzhou Jinxia** (Chinese factories) → DEE | Purchase from China | `PL-PRCH_CNY` or `PL-PRCH_USD` | CNY or USD |

**Named buyer overrides** (check Special price list registry first):
- If buyer has a dedicated special price list → use that list regardless of entity logic
- Currently: no active special lists

**RSP rule:** `PL-RSP_RF` is never used for invoices or inter-skill calls. It is informational only — for presentations, market analysis, or user queries about retail prices.

---

## STEP 3 — PRODUCT KNOWLEDGE GATE

Call this gate when:
- Product names are vague or non-standard (e.g., "the probiotic paste", "charcoal brush")
- SKU codes are missing and product identification is ambiguous
- Caller skill passes product names without SKU codes

**Gate call format:**
```
[[GATE: product-knowledge]]
Query: Identify SKU and full product name for: [product description]
Context: Pricing request for [buyer] from [seller]
```

Gate returns: SKU + full canonical product name → proceed to price lookup.

Skip this gate if SKUs are already confirmed and unambiguous.

Skip this gate if SKUs are already confirmed and unambiguous.

---

## STEP 4 — PRICE LOOKUP

1. Identify correct price list from Step 2
2. Load the corresponding reference file
3. Find each requested SKU
4. If SKU not found in price list → state "not listed" — do NOT invent a price

---

## OUTPUT FORMAT

### Direct User Query Output

```
💰 PRICE RESULT

SKU: [DE###]
Product: [Full product name]
Price: [amount] [CURRENCY]
Price list: [Price List Name] ([Price List ID])
Seller → Buyer: [Entity] → [Buyer name or type]

[If multiple SKUs: repeat block per SKU]
```

### Price Gate Output (inter-skill call)

When called by another skill (invoicer, das-presenter, sales-hunter, etc.), return this compact block per SKU:

```
⚙️ PRICE GATE RESULT

SKU: [DE###] | Product: [Full name] | Price: [amount] [CURRENCY] | List: [ID] | Seller→Buyer: [Entity→Buyer]

[Repeat per SKU on separate lines]

Currency basis: [e.g., "FOB Guangzhou USD — DEI seller, international buyer"]
↩️ Returning to [calling skill] — data ready for insertion.
```

---

## PRICE GATE PROTOCOL — INTER-SKILL INTEGRATION

This section governs how Pricer operates when invoked mid-workflow by another Das Experten skill.

### Authorized Calling Skills

Any Das Experten skill may call the Price Gate. Most common callers:

| Calling Skill | Typical Trigger |
|---|---|
| `invoicer` | Building invoice line items — needs unit prices per SKU |
| `das-presenter` | Building distributor deck — needs price tier for commercial slide |
| `sales-hunter` | Preparing offer for prospect — needs FOB or distributor price |
| `personizer` | Preparing commercial message — needs price reference |

### How inter-skill calls work

When another skill (invoicer, logist, legalizer, etc.) loads pricer/SKILL.md mid-workflow:

1. Pricer reads the calling context — seller, buyer, products, purpose
2. Runs STEP 1–4 of this skill normally
3. Returns the **Price Gate Output block** (compact format, see above)
4. Signals return: "↩️ Returning to [calling skill] — data ready for insertion."

The calling skill then resumes its own workflow using the prices returned.

---

## ADDING NEW PRICE LISTS

This skill is permanently open for expansion. To add a new price list:

1. Create a new file: `references/pricelist-[id].md`
2. Use the standard template (see below)
3. Add one row to the Price List Registry table in this SKILL.md
4. If it is a Special / Named Buyer list → add to the Special registry table

**New reference file template:**

```markdown
# [Price List Name]
**Price List ID:** [ID]
**Currency:** [CNY / USD / RUB]
**Valid from:** [date]
**Source file:** [original filename]
**Applies to:** [seller entity → buyer type or named buyer]
**Notes:** [any special conditions, VAT rules, etc.]

---

## Price Table

| SKU | Product Name | Price | Unit | Notes |
|-----|-------------|-------|------|-------|
| DE### | [name] | [price] | pcs | |
```

No other changes needed. The skill auto-routes to any reference file listed in the registry.

---

## ERROR HANDLING

| Situation | Action |
|---|---|
| SKU not found in target price list | Output: "SKU [DE###] not listed in [List ID]. Provide price manually or check source file." |
| Buyer not recognized | Ask: "Please confirm buyer legal name and country." |
| Seller not specified and cannot be inferred | Ask: "Which Das Experten entity is selling — DEE, DEI, DEASEAN, or DEC?" |
| Price list file not yet created | Output: "Price list [ID] reference file not yet loaded. Please provide the price data to populate it." |
| Conflict between two lists | Show both with source labels — let user decide |

---

## CRITICAL REMINDERS

✅ One price output per request — never dump all lists  
✅ Always show Price List ID in output — this is the audit trail  
✅ RSP prices are for reference only — never used in invoices  
✅ Never fabricate prices — "not listed" is always the correct fallback  
✅ Skill is always open for new reference files — never close it  
✅ VAT (Russia): distributor prices are ex VAT — add 20% only when invoice requires it  
✅ Special buyer prices override entity-logic prices — always check special registry first

---

## PARTNER RETAIL PRICER (RPP) — LAZY LOAD

**Do NOT load by default.** Load `references/RPP_reference.md` only when the user mentions:
- `RPP`, `retail pricing for partner`, `partner retail pricer`, `ритейл-ценообразование`, `сетевое ценообразование`, `цена входа в сеть`

When triggered, read the file and follow the RPP workflow inside it.

---

## END OF SKILL
