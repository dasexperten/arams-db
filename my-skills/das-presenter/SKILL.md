---
name: das-presenter
description: >
  Generates fully customized, brand-accurate Das Experten .pptx presentation files
  for B2B distributors, retail chains, and product catalog reviews. ALWAYS trigger
  this skill when the user says ANY of these exact words or their close variants:
  "presentation", "презентацию", "ppt", "powerpoint", "make a presentation",
  "create a deck", "prepare slides", "make a pitch", "сделай презентацию",
  "подготовь презентацию", "сделай слайды", "pitch deck", "distributor deck",
  "retail proposal", "сделай ppt", "сделай powerpoint", "нужна презентация",
  "нужен ppt", "нужен powerpoint". Also trigger when the user mentions a country
  + distribution or retail context (e.g., "presentation for Vietnam distributor",
  "deck for pharmacy chain", "slides for the buyer meeting"). Produces a ready
  .pptx file — not a script, not a prompt. Full file output every time.
---

# Das Presenter Skill

Generates complete, audience-specific `.pptx` presentations for Das Experten.
Black/red/yellow brand palette. Full custom per audience type and country.

---

## Step 0 — Mode Selection (FIRST MESSAGE — before anything else)

**Ask this single binary question before ANY other step. Nothing proceeds until answered.**

Use `ask_user_input_v0` (single_select):

> **How do you want to work?**
> - **Auto** — I collect all inputs upfront and build the full deck myself. You review the result.
> - **Manual** — I guide you step by step, waiting for your confirmation at each stage.

**Auto mode:** Collect Steps 1 + 1B + 2C in a single combined message, then build without further interruption. Present the finished `.pptx` for review.

**Manual mode:** Follow every step sequentially — ask, wait, confirm, proceed. Never skip ahead.

⛔ **Do not proceed to Step 1 until the user has selected Auto or Manual.**

---

## Step 1 — Interview (MANDATORY, do not skip)

Before writing a single slide, collect these parameters.

**Q2 — Country / Region** ask as a plain open text question first:
> "Which country or region is this deck for? (Determines language, market data, logistics terms, and entity.)"

Then immediately render Q1, Q3, Q4, Q5 in a **single `ask_user_input_v0` call** (all four questions at once, each as `single_select`):

**Q1 — Audience type** (single_select):
- Distributor / Importer
- Retail chain
- Product catalog review
- Consumer / DTC
- Dentist / Dental professional
- Blogger / Influencer

**Q3 — Products to feature** (single_select):
- Full line (all SKUs)
- Toothpastes only
- Brushes + Flosses
- Brushes + Accessories
- Specific SKUs — I'll type them

*(If user selects "Specific SKUs — I'll type them", immediately ask as a follow-up open text question: "Which SKUs? List them.")*

**Q4 — Include prices?** (single_select):
- Yes
- No — price on request

*(Price type is determined automatically by audience: Distributor → wholesale/distributor price · Retail chain → retail shelf price + margin · Consumer / DTC → RSP · Blogger / Influencer → RSP · Dentist → professional trade price · Catalog review → no prices, always hidden)*

**Q5 — Presentation language** (single_select):
- English
- Russian
- Other — I'll specify

*(If user selects "Other — I'll specify", ask as follow-up open text: "Which language?")*

Wait for user response. Do NOT proceed until all questions are answered.

---

## Promo Support Rule — AUTOMATIC, NO QUESTION NEEDED

Do NOT ask the user about promo support. Always include the following support items automatically in every applicable slide, using standard Das Experten language:

| Audience | Where to include | Items to always mention |
|---|---|---|
| Distributor / Importer | Slide 9 — Partnership Benefits | POS materials ready · Sampling program available · Co-marketing support · Product knowledge training sessions |
| Retail chain | Slide 9 — Trade Terms | In-store POS materials · Sampling / trial kits · Co-marketing mechanics (endcap, in&out) · Staff training available |
| Dentist / Dental professional | Partnership slide | Professional sampling · Co-branded materials · Clinical training available |
| Blogger / Influencer | Partnership slide | Product sampling · Co-branded content assets · Campaign co-creation |

For Catalog Review and Consumer / DTC audiences — omit promo support block entirely.

---

## Step 1B — Product Knowledge Gate ⛔ MANDATORY — RUNS FIRST, ALWAYS

**This is the first hard gate. Nothing else runs until product facts are verified.**

Run the Product Knowledge Gate for every featured product immediately after Step 1 is complete.

→ [[GATE: product-knowledge]]
  INPUT: each featured product's name, article number, key ingredient + benefit, clinical stat, target condition/user, competitive advantage — pulled from product
  AWAIT: GATE_RESULT per product

**On GATE_RESULT:**
- PASS or CONDITIONAL PASS → proceed using Corrected Knowledge Blocks
- FAIL on any product → output exactly one line: "Product data adjusted for accuracy — proceeding with verified version." Use Corrected Knowledge Block for that product
- All slide copy (product descriptions, clinical claims, ingredient mentions, differentiators) uses Corrected Knowledge Blocks only — never raw input

⛔ Do not proceed to Step 1C until all featured products have returned GATE_RESULT.

---

## Step 1C — Marketing Strategy Gate ⛔ MANDATORY — DO NOT SKIP

**This is the second hard gate. No palette. No slide structure. No copy. Nothing until this step is complete.**

This step defines the IDEA behind the deck — without it, the presentation is just pretty slides with no strategic spine. It runs on top of verified product knowledge from Step 1B.

### How to present Step 1C (MANDATORY FORMAT):

Present all 5 questions in ONE single message. For each question, generate AI-suggested options dynamically based on the audience type + country collected in Step 1. Always include one last option labeled **"✏️ Write my own"** for the user to type their answer freely.

Use the **ask_user_input_v0 tool** (multi_select for Q1–Q4, single_select for Q3 and Q5) to render each question as clickable buttons. Present all 5 questions at once in a single tool call.

⛔ **REGENERATE OPTION — GLOBAL RULE (applies to EVERY options widget in this skill without exception):**
Every set of options presented via `ask_user_input_v0` must include **"🔄 Regenerate — think harder"** as the final option, placed after "✏️ Write my own". If the user selects it:
1. Discard all previously generated options for that question
2. Apply stricter criteria: higher tension, more specific to the audience + country, no generic phrasing that could appear on a competitor's deck
3. Re-generate 3 entirely new options — no recycling, no rephrasing of the rejected set
4. Present as a fresh widget for that question only — do not re-ask already-answered questions
5. Repeat until the user selects a real option or writes their own

Wait for user reply. Do NOT proceed until all 5 are answered.

---

## Legal Gate Protocol ⚖️ — INTER-SKILL INTEGRATION

Das Presenter must pause and invoke the **Legalizer (compliance mode)** whenever legal-sensitive content surfaces during presentation building. This gate operates independently of — and does not replace — the Marketing Strategy Gate or Marketolog Gate. It fires on-demand throughout the workflow — not at a fixed step.

### When to activate the Legal Gate

Activate immediately if any of the following appear in user input or generated slide content:

| Trigger | Where it typically appears |
|---------|---------------------------|
| Exclusivity terms (exclusive territory, sole distributor, exclusive rights) | Slide 8 Commercial Terms |
| NDA reference or request ("sign NDA", "confidentiality") | Slide 10 Next Steps |
| Payment terms beyond standard (deferred payment, consignment, credit) | Slide 8 Commercial Terms |
| Governing law or jurisdiction mention | Any slide, user input |
| Liability or indemnification language | Any slide |
| Wildberries or other marketplace name in legal-risk context | Any slide copy |

### How to activate

1. Pause das-presenter workflow immediately — do NOT write the slide or proceed to the next step.
2. Output this exact line:
   > "⚖️ **Legal Gate activated** — passing to Legalizer (compliance mode) for risk check before proceeding."
3. State the flagged item in one sentence (e.g., "Exclusivity clause detected in Slide 8 — no performance conditions specified.").
4. Invoke with the exact syntax:
   ```
   [[GATE: legalizer-compliance]]
   Flagged item: [one-sentence description]
   Context: das-presenter Slide [N] — [section name]
   Jurisdiction: [country from Step 1]
   ```
5. Wait for Legalizer to output its Gate Decision Block.

### After Legalizer responds

| Gate Status | Das Presenter action |
|-------------|---------------------|
| ✅ `LEGALIZER-COMPLIANCE GATE: CLEARED` | Resume from the paused step — write the slide as planned |
| ⚠️ `LEGALIZER-COMPLIANCE GATE: PROCEED WITH CAUTION` | Resume — append Legalizer's recommended note as a speaker note on that slide |
| 🔴 `LEGALIZER-COMPLIANCE GATE: BLOCKED` | Halt. Do not generate the slide. Inform user that legal review must complete first |

---

### How to generate the options (AI logic — vary by audience + country):

**Q1 — HOOK** (multi_select — user picks 1 or writes their own)
Generate 3 options that reflect what makes Das Experten genuinely surprising or threatening to competitors in this specific market. Each option must be a tension statement, not a neutral description. Tailor to audience + country. Examples for UAE Blogger context:
- "A European science brand that's never been seen in UAE — yet"
- "Clinically proven to outperform Colgate — without fluoride or SLS"
- "The cleanest ingredient list on the market — and we can prove it"
- ✏️ Write my own

**Q2 — AUDIENCE PAIN** (multi_select — user picks 1–2 or writes their own)
Generate 3 options that reflect the most common oral care complaints among the target audience's followers. Tailor to region and audience type. Examples for UAE:
- "Yellow teeth / whitening — most-searched oral care term in UAE"
- "Sensitivity — can't enjoy hot or cold drinks"
- "Fear of chemicals — looking for clean, natural alternatives"
- ✏️ Write my own

**Q3 — DESIRED ACTION** (single_select — user picks 1 or writes their own)
Generate 3 options that reflect realistic blogger collaboration goals at this stage. Examples:
- "Post an unboxing + first-impression reel"
- "Write a 30-day comparison review vs. their current brand"
- "Sign an affiliate deal with a personalized discount code"
- ✏️ Write my own

**Q4 — TONE** (multi_select — user picks 1–2 or writes their own)
Generate 3 options that reflect brand positioning choices relevant to this audience and country. Examples for UAE:
- "Luxury European science — premium, precise, trusted"
- "Clean & honest — nothing to hide, every ingredient explained"
- "Challenger brand — here to disrupt what Colgate built"
- ✏️ Write my own

**Q5 — COMPETITOR ANGLE** (single_select — user picks 1 or writes their own)
Generate 3 options that reflect what these specific bloggers are most likely promoting today. Tailor to country. Examples for UAE:
- "Colgate / Sensodyne / Signal — mass market dominance"
- "Local or regional brands (Miswak-based, natural, halal-positioned)"
- "No dominant brand — open white space"
- ✏️ Write my own

---

⛔ **HARD STOP — Do not proceed to Step 2 until all 5 marketing questions are answered by the user.**

These answers directly shape:
- Cover headline tension (Step 2B ①)
- 3 differentiators framing (Step 2B ②)
- Hero product selection and one-liners (Step 2B ③ ④)
- CTA slide closing line (Step 2B ⑤)
- Entire tone of all body copy across all slides

Note: All answers must be grounded in the Corrected Knowledge Blocks returned by the Product Knowledge Gate in Step 1B — not raw user input or assumed product data.

---

## Step 1D — Audience Psychographic Profiling Gate ⛔ MANDATORY — RUNS SILENTLY, NEVER SKIPPED

**This gate runs immediately after Step 1C. Invisible to the user — no widget, no question, no output shown.**

→ [[GATE: benefit-gate → Audience Psychographic Profiling]]
  INPUT: audience_type (from Step 1 Q1), country (from Step 1 Q2)
  AWAIT: BENEFIT_GATE_RESULT

Read `/mnt/skills/user/benefit-gate/SKILL.md` now. Execute Steps 1 and 2 from that skill in full. Use the returned `BENEFIT_GATE_RESULT` to color all slide copy generated in Step 3.

⛔ Do not proceed to Step 2 until BENEFIT_GATE_RESULT is produced.

Based on answers, select the correct content configuration:

| Audience | Template Logic | Price type (if prices = Yes) |
|---|---|---|
| **Distributor** | Focus: brand strength, market opportunity, margins, MOQ, logistics | Wholesale / distributor price |
| **Retail chain** | Focus: shelf strategy, consumer demand, placement, promo mechanics, margins per SKU | Retail shelf price + margin per SKU |
| **Catalog review** | Focus: full SKU table, full ingredient list per SKU, technical specifications, clinical data, certifications, packaging details (weight, volume, inner-box count, barcode) — NO pricing of any kind | No prices (never shown — confidential by default) |
| **Consumer / DTC** | Focus: visible results in 14 days, daily routine simplicity, before/after stories, taste/texture wins, subscription value. Emotional hook first — this is the revenue engine. | RSP (Recommended Selling Price) |
| **Dentist / Dental professional** | Focus: peer-reviewed clinical data, mechanism of action, ADA-equivalent proof, in-office trial kit ROI, patient compliance stats. High-trust multiplier — professionals become brand advocates. | Professional trade price |
| **Blogger / Influencer** | Focus: unboxing hooks, "why this beats Colgate" angles, content calendar co-creation, affiliate + exclusives, raw authenticity assets. If using interpreter-collaborator: instant cultural bridge — but diversify to avoid single-point dependency. | RSP (Recommended Selling Price) |

### Country → Entity + Language defaults

| Region | Legal entity to reference | Default deck language |
|---|---|---|
| Russia / CIS | Das Experten Eurasia LLC | Russian |
| UAE / MENA / GCC | Das Experten International LLC | English |
| Vietnam / ASEAN | Das Experten ASEAN Co. Ltd. | English |
| EU / Germany | Das Experten GmbH | English |
| Armenia | Das Experten Eurasia (or DEC) | Russian or Armenian |
| Other | Das Experten International LLC | English |

---

## Step 2B — Marketolog Gate ⛔ MANDATORY — DO NOT SKIP OR PROCEED WITHOUT COMPLETING

**This step is a hard gate. Do not write a single slide until it is complete.**

Read `/mnt/skills/user/marketolog/SKILL.md` now. Apply its Hero Intrigue Lock framework to each element below.

### For each of the 5 elements listed:
1. Generate **3 variants**
2. Score each on intrigue: curiosity gap / tension / hidden discovery
3. Select the highest-scoring variant
4. That variant — and only that variant — goes into the slide

If any variant describes the product neutrally, names the category plainly, or could appear on a competitor's label → it FAILS. Rewrite until it passes.

---

### Elements requiring the Marketolog Gate:

For each element below: generate **3 variants** scored for intrigue, then present them to the user as **selectable options** using the `ask_user_input_v0` tool (single_select). Always include **"✏️ Write my own"** as the last option, and **"🔄 Regenerate — think harder"** as the final option after it (see global rule in Step 1B). Wait for user selection before applying to slides.

**① Slide 1 — Cover headline** (present as single_select buttons)
- Must trigger curiosity, tension, or hidden discovery in the first 3 seconds
- NEVER default to the default taglines in Step 3 (those are placeholders — override them)
- Audience-specific tension framing:
  - Distributor: first-mover gap, market left open, urgency of entry
  - Retail: shelf conversion, consumer pull, competitor weakness
  - Catalog: clinical discovery framing
  - Consumer / DTC: personal transformation in days — not someday
  - Dentist: what you recommend today shapes your patients' microbiome for years
  - Blogger / Influencer: the content angle your audience hasn't seen yet
- Generate 3 variants → present as buttons → wait for user pick

**② Slide 2 — 3 differentiators** (present each as single_select buttons — 3 separate widget calls, one per differentiator line)
- Each must challenge an industry assumption or expose an indirect competitor weakness
- Format: Power verb + real outcome + data where available
- Not a feature list. Each line must make the reader feel slightly behind.
- For each of the 3 differentiator slots: generate 3 variants → present as buttons → wait for user pick
- All 3 can be presented together in a single multi-question widget call (Q1: Differentiator 1, Q2: Differentiator 2, Q3: Differentiator 3)

**③ Slide 5 — Hero Products slide: ALL copy elements** (present as single_select per element per SKU)

⛔ **INGREDIENT LOCK — READ THIS BEFORE GENERATING ANY COPY FOR ANY SKU:**
Before writing a single tagline or function line for any product, open `references/sku-data.md` and read the exact row for that SKU. Use ONLY the Hero Ingredient and Core Function listed there. Do NOT reference ingredients from any other row. Do NOT use ingredients mentioned in examples elsewhere in this skill. Each product's copy must be derived exclusively from its own data row. Violations: SYMBIOS must never mention lysozyme, dextranase, papain, or charcoal. THERMO 39° must never mention probiotics. SCHWARZ must never mention enzymes. Any cross-contamination is a factual error.

For each hero SKU, every text element on the slide is a creative decision that needs a selectable choice — not just the tagline. Apply the same 3-variant → select logic to all of the following:

- **Tagline** — the 1-line hook that replaces the product name as the lead statement
  - Must pass the "would they stop scrolling?" test
  - No: "Probiotic toothpaste with live cultures" (neutral label)
  - Yes: "The first toothpaste in [country] that actually restores — not just cleans" (tension + discovery)

- **Core function line** — 1 sentence describing what it does (mechanism-light, benefit-forward)
  - No: "Contains activated charcoal and abrasive particles" (ingredient dump — generic, flat)
  - Yes: "Dismantles biofilm at the source — without disturbing the microbiome" (mechanism + intrigue)
  - ⛔ ALWAYS derive the core function line from the hero ingredient listed in `references/sku-data.md` for that specific SKU. Never borrow ingredients from another product. SYMBIOS = Bacillus coagulans only. THERMO 39° = Papain + Lysozyme + Dextranase only. Cross-product contamination is a critical error.

- **"Best for" profile line** — who this product is made for (audience archetype, not demographic)
  - No: "For adults 18+" (useless)
  - Yes: "For anyone who brushed their teeth for 30 years and never felt the difference" (tension + identification)

- **Clinical number framing** — the 1 supporting stat and how it's labeled
  - No: "Clinical study: −68% bacteria" (flat)
  - Yes: "68% fewer bacteria — verified, not claimed" (same number, different trust signal)

For each SKU: present all 4 elements as a single multi-question widget call (Q1: Tagline, Q2: Core function, Q3: Best for, Q4: Stat framing) → wait for user picks → proceed to next SKU.

**④ Slide 6 — Clinical Proof section headline** (present as single_select buttons)
- Must feel like a discovery, not a spec sheet
- Example pass: "Numbers your competitor's R&D team already knows"
- Example fail: "Clinical Data" (flat, generic)
- Generate 3 variants → present as buttons → wait for user pick

**⑤ Slide 10 — Next Steps CTA headline + closing line** (present as single_select buttons)
- The headline must force a decision, not invite one politely
- The closing line must draw a line in the sand: evolve or get left behind
- No "Contact us", "Learn more", "Try now" softness — ever
- Generate 3 variants → present as buttons → wait for user pick

⛔ **Do not write a single slide until ALL 5 elements have been selected by the user.**

---

### Hero Intrigue Lock — quick test:

| Result | Signals |
|---|---|
| ✅ PASS | Creates knowledge gap · signals hidden discovery · triggers mild tension · makes reader feel slightly behind |
| ❌ FAIL | Names category neutrally · states the obvious · could appear on any competitor's label · describes without provoking |

**Rule:** If you find yourself reframing a neutral phrase to make it seem acceptable — that reframing is the signal to reject and rewrite, not to proceed.

---

## Step 2C — Palette Selection ⛔ HARD GATE — DO NOT PROCEED WITHOUT EXPLICIT USER SELECTION

**This is a blocking step. No default. No assumption. No proceeding.**

⛔ **SEQUENTIAL RULE — STRICT:**
- Ask palette question ONLY → STOP and wait for user reply
- **NEVER proceed to Step 3 until palette is confirmed**
- Do NOT apply any palette until the user has chosen — not even Palette A as a fallback
- If user says "you decide" or "default" — reply: "This choice is yours — it affects every slide in the deck. Please pick one." and wait again

---

### Typography System — Fixed (applies to ALL slides, ALL presentations, no exceptions)

Das Experten uses a fixed 6-level typographic hierarchy. This is not selectable — it is a brand standard applied automatically to every deck.

| Level | Role | Style |
|---|---|---|
| **L1 — Primary Headline** | Main slide statement | Ultra-bold sans-serif · ALL CAPS · largest size · maximum visual weight · left or right placement |
| **L2 — Key Slogan / Subhead** | Supporting claim or slogan | Bold sans-serif (slightly lighter weight) · mixed case + proprietary styling · high contrast · centered or top-right lockup |
| **L3 — Body Header** | Section or block label | Medium/regular sans-serif · mid-size · explanatory blocks on left or right |
| **L4 — Body Copy** | Descriptive paragraphs and lists | Regular/light sans-serif · smaller size · descriptive paragraphs and lists |
| **L5 — Fine Print** | Specs, technical detail, icons | Light sans-serif · smallest readable size · low contrast · product specs and icons |
| **L6 — Footer** | Branding marks, bottom alignment | Thinnest sans-serif · tiny scale · minimal weight · bottom alignment with icons/branding marks |

Apply this hierarchy to ALL content slide copy blocks — headlines, subheads, body, captions, footers. No deviations. No style overrides.

---

### Color Palette

**Only generate palettes after Step 1C (all gates cleared). Generate 4 fresh palettes every time based on the context collected in Step 1.**

Use these factors to derive the palettes:

| Factor | How it influences palette |
|---|---|
| **Audience** | Distributor/B2B → authoritative, structured · Dentist → clinical, sterile, precise · Blogger/Influencer → vibrant, editorial, contemporary · Retail chain → commercial, shelf-ready, high contrast · Consumer/DTC → emotional, benefit-led, lifestyle |
| **Country/Region** | UAE/MENA → gold, warm sand, deep rich darks · Germany/EU → cold grays, minimalist, precision tones · Vietnam/ASEAN → vivid, tropical contrast, energetic · Russia/CIS → bold, strong, authoritative reds and blacks · US/UK → clean, modern, challenger brand energy |
| **Product focus** | Schwarz/charcoal → deep blacks, ashy grays, activated carbon feel · Symbios/probiotic → clean whites, science blues, living-culture greens · InnoWeiss/whitening → bright whites, icy blues, pearl tones · Kids → warm, soft, playful lights · Full line → balanced, versatile |

#### Palette rules (hard constraints):

- Always generate exactly **4 palettes** (A, B, C, D)
- Each palette must have **6 hex colors**: bg-primary · bg-secondary · accent-1 · accent-2 · text · muted
- Each palette must have a **short creative name** (2–3 words) + a **3-word descriptor** (mood · industry · feel)
- **DUOCHROMATIC PALETTE RULE — ABSOLUTE:** Each palette built from exactly TWO color families — vary only lightness and saturation. Neutrals (off-white, light gray, dark gray) permitted for text and background only — not a third hue family
- Fixed hue-pair assignments:
  - **A — Nature / Fresh:** Emerald green + deep-to-light blues
  - **B — Science / Trust Authority:** Deep navy + cool gray/steel
  - **C — Fresh Innovation:** Teal/turquoise + vibrant aqua/cyan
  - **D — Warm Premium / Luxury:** Warm gold + black/dark bronze
- Never reuse the same palette set across two different presentations

#### Present palette options:

Once palettes are generated, present them using `ask_user_input_v0` (single_select) with 4 options:

> **Choose your color palette:**
> - A — [PALETTE NAME] · [mood · industry · feel]
> - B — [PALETTE NAME] · [mood · industry · feel]
> - C — [PALETTE NAME] · [mood · industry · feel]
> - D — [PALETTE NAME] · [mood · industry · feel]

⛔ **No default. User must select one explicitly before proceeding.**

---

**Apply selected palette hex values to ALL slides in Step 3.**
**Apply the fixed 6-level typography hierarchy to ALL content slides — no style selection needed.**

⛔ **[HARD STOP — Do not write a single line of code or slide content until palette is confirmed by the user.]**

---

## Step 2D — Price Gate ⛔ CONDITIONAL — RUNS ONLY IF Q4 = "Yes"

**This gate fires only when the user selected "Yes" in Step 1 Q4 (Include prices). If Q4 = "No — price on request" → skip this step entirely, every price slot on slides shows "По запросу" / "Price on request".**

**If Q4 = "Yes": do not write Slide 5 (Hero Products) or any commercial slide with pricing until this gate returns.**

### Invocation

```
[[GATE: pricer]]
Seller entity: [from Step 1D Country → Entity table]
Buyer / audience: [from Step 1 Q1 + Q2, e.g. "Dentist clinic in Kazakhstan"]
Price list type: [auto-derived per audience mapping — see below]
SKUs: [list from Step 1 Q3, or the user's typed SKUs]
```

### Audience → Price list type mapping

| Audience (Step 1 Q1) | Price list type to request from pricer |
|---|---|
| Distributor / Importer | Distributor / wholesale price list for that country |
| Retail chain | Retail shelf price list + margin per SKU |
| Catalog review | N/A — Q4 is always overridden to "No" for this audience, skip this gate |
| Consumer / DTC | RSP (Recommended Selling Price) for that country |
| Dentist / Dental professional | Professional trade price list — if not yet registered in pricer, pricer returns `NOT_LISTED` and das-presenter falls back to distributor price with note "Professional tier pending" |
| Blogger / Influencer | RSP (Recommended Selling Price) for that country |

### On return

| Pricer return signal | Das Presenter action |
|---|---|
| `⚙️ PRICE GATE RESULT` with prices per SKU | Insert prices into Slide 5 tagline/support line AND Slide 8 Commercial Terms — always cite Price List ID as speaker note for audit |
| `⚙️ PRICE GATE RESULT: NOT_LISTED` for specific SKU | Show "Price on request" for that SKU only; continue with other SKUs |
| `⚙️ PRICE GATE RESULT: NOT_LISTED` for entire price list type | Override Q4 to "No — price on request" silently, inform user in one line: "Prices hidden — [price list type] not yet registered in pricer registry" |

⛔ **Never fabricate a price. Never infer a price from another list. If pricer returns nothing — price on request is the only valid fallback.**

---

## Step 3 — Slide Structure

Build exactly this slide sequence. Adjust section content per audience type (see rules below each slide).

### Universal Slides (ALL audience types)

**Slide 1 — Cover**
- Full dark background (#1A1A1A)
- ⛔ **NO product image on the cover. No photos. No SKU visuals. Typography only.**
- Brand logo: top-left, use `addLogoCover()` (dark logo)
- **Headline 1** (white, bold): Use the variant selected in Step 2B ①. Full-width, large — `font size 40–48pt`, `x: 0.5"`, `w: 9.0"`, `y: 1.2"`, `h: 1.6"`. Do NOT constrain to half-width. This is the dominant visual element of the slide.
- **Headline 2** (accent-1, bold): Second line of the headline concept. `font size 28–34pt`, `x: 0.5"`, `w: 9.0"`, `y = headline1_y + headline1_h + 0.1"` — always calculated, never hardcoded.
- **Subline** (bottom label): Format strictly as **[AUDIENCE TYPE] PARTNER DECK · [COUNTRY] [YEAR]** — all caps, muted color, font size 11–12pt. Fixed `y: 4.9"`. Example: `DISTRIBUTOR PARTNER DECK · IRAQ 2026`. Never use sentence case, never omit the year.

**Slide 2 — About Das Experten**
- Founded: Germany. Science-first oral care brand.
- Mission: Evidence-driven formulations with clinically active ingredients.
- Presence: Russia/CIS · UAE/MENA · Vietnam/ASEAN · EU
- 3 key differentiators: **Use the variants selected in Step 2B ②.** The raw material below is for reference only — do NOT copy-paste as-is, they must pass the Marketolog Gate first:
  - Raw: "No synthetic fillers — every ingredient has a clinical function"
  - Raw: "Microbiome-friendly formulations — the first in the CIS market"
  - Raw: "Proven sell-through: #1 oral care brand by reviews on Wildberries — 500,000+ reviews, avg 4.87 stars — 67% reorder rate"
  - Raw: "Enzyme-based whitening — zero peroxide, zero sensitivity"
  - Raw: "Probiotic toothpaste with 4×10¹⁰ CFU live cultures per dose"

**Slide 3 — Market Opportunity**

⛔ **LIVE MARKET RESEARCH — MANDATORY. NO STATIC DATA. NO EXCEPTIONS.**

`references/market-data.md` has been permanently deleted. It contained outdated, unverified figures that will not survive scrutiny from a professional buyer. Every number on this slide must be researched fresh for the specific country AND the specific retail channel named in Step 1.

**This research protocol runs before any slide code is written. No shortcuts. No recalled figures from training data.**

---

### STEP A — Market Size
**Minimum 3 web_search calls. Accept nothing older than 18 months.**

Run all of these queries, adapted to the target country and language:
- `[country] oral care market size [year] billion revenue`
- `[country] toothpaste toothbrush market value [year]`
- `рынок зубной гигиены [страна] [год] объём млрд` (Russian-language markets)
- `[country] personal care FMCG oral hygiene market report [year]`

**Source hierarchy — top to bottom:**
1. Euromonitor International / Passport database references
2. Nielsen / NielsenIQ retail audit data
3. Statista (only if citing a named primary source, not Statista's own estimates)
4. National trade associations (e.g. DSM Group RU, Gradus Retail Index RU, VIETRADE VN, Dubai Chamber UAE)
5. RBC Research / Kommersant / Vedomosti (Russia)
6. Government trade statistics (customs, ministry of industry)

**Reject immediately:**
- Any source without a publication date
- PR agency press releases citing unnamed "industry analysts"
- Brand-funded market research (Colgate, Oral-B, etc.)
- Undated Wikipedia-style summaries

**Handling conflicts between sources:**
- If two credible sources differ by <15% → use the lower figure, note both in speaker notes
- If two credible sources differ by >15% → use both with explicit attribution ("Source A: X / Source B: Y — figures differ, using conservative estimate")
- Never average conflicting figures silently

**Partial data rules:**
- If only 9-month data available → state "9M [year] annualised estimate" — never present as full-year without flagging
- If only aптека/pharmacy channel data found → state "pharmacy channel only — total retail market larger"
- Segment the figure correctly: toothpaste only ≠ total oral care ≠ personal care — never conflate

---

### STEP B — Growth Rate & Consumer Trends
**Minimum 2 web_search calls.**

Run:
- `[country] oral care premium segment growth CAGR [year]`
- `[country] probiotic enzyme natural toothpaste consumer trend [year]`
- `[country] oral care e-commerce growth [retailer] [year]`

**Distinguish and separately state:**
- Total oral care market growth (usually 3–8% in developed markets)
- Premium / functional segment growth (usually 10–18% — this is the relevant number for Das Experten)
- E-commerce channel growth (often 25–40% in developing markets — relevant for Russia/ASEAN)
- Ingredient-specific trend: probiotic / enzyme / fluoride-free / microbiome — search this explicitly

**If no growth data found for the specific country:** state explicitly — "Segment CAGR not publicly available for [country]. Estimated at [X]% based on [neighbouring market / global trend]. Flagged as estimate."

**Never present an estimated figure as a verified figure.**

---

### STEP C — Competitive Landscape (Deep)
**Minimum 5 web_search calls. This is the most important step.**

⛔ A buyer sitting across the table knows their shelf. If the competitive analysis is generic or wrong, the meeting ends. This step must be executed with the precision of a mystery shopper, not a marketing intern.

**Phase 1 — Identify who is on the shelf in THIS specific retailer:**
Run:
- `[retailer name] [country] зубная паста ассортимент бренды`
- `[retailer name] toothpaste brands range [country/city]`
- `[retailer name] oral care premium shelf [year]`
- If retailer has an online store → fetch their oral care category URL directly with web_fetch

For each brand found, record:
| Brand | Origin | Segment | Key claim | Approx. price | SKU count |
|---|---|---|---|---|---|
| [Brand] | [DE/RU/US/local] | Mass/Mid/Premium | [whitening/sensitivity/herbal] | [price range] | [# of SKUs] |

**Phase 2 — Identify ingredient gaps:**
After mapping the shelf, explicitly check for each of the following — present or absent:
- [ ] Live probiotic / live culture toothpaste → if absent: SYMBIOS = pioneer + #1 on European marketplaces
- [ ] Enzyme-based whitening (no peroxide, no abrasive)
- [ ] Microbiome-friendly / Microbiome Friendly label
- [ ] Activated charcoal paste (present in most markets — if yes, who and at what price)
- [ ] Fluoride-free premium paste with clinical backing
- [ ] Ginger / botanical clinical-grade gum care
- [ ] Kids probiotic / remineralising paste

Each "absent" = a white space Das Experten can claim on the slide.

**Phase 3 — Price architecture:**
- What is the cheapest paste on this shelf? (price anchor)
- What is the most expensive paste on this shelf? (price ceiling)
- Where does the "premium" tier begin in this market?
- Where would Das Experten sit? Is that position vacant or contested?

**Phase 4 — Dominant brand analysis (top 2–3 brands):**
For the top 2–3 brands by shelf presence, run one additional search each:
- `[Brand] [country] market share oral care [year]`
- `[Brand] [country] consumer complaints reviews`

Extract:
- What claim they lead with (whitening, sensitivity, natural, antibacterial)
- What they DO NOT claim (this is where Das Experten enters)
- Whether they have clinical data publicly cited — or just marketing language
- Review sentiment: what do users complain about? (sensitivity after whitening, no lasting freshness, foam too strong = SLS complaints — Das Experten answers these directly)

**Phase 5 — White space formulation:**
After all research, write exactly ONE sentence for the slide:
> "На полке [ритейлера] представлено X брендов — ни один не предлагает [живые культуры / ферментное отбеливание / пробиотик-уход]. Das Experten входит в незанятый сегмент."

This sentence must be factually supported by the research above. If the segment is NOT empty, state who is there and what Das Experten's differentiation is vs. that specific competitor.

**Competitive output format for the slide (mandatory 3-column table):**
```
ТЕКУЩАЯ ПОЛКА           | ПУСТОЙ СЕГМЕНТ              | DAS EXPERTEN
[Бренд A] — отбелив.    | Нет пробиотик-пасты         | SYMBIOS — pioneer + #1 probiotic toothpaste on European marketplaces — 4×10¹⁰ КОЕ живых культур
[Бренд B] — чувств.     | Нет фермент. отбеливания    | INNOWEISS — first and only multilevel enzyme toothpaste with real multistep action — #1 multienzyme on European marketplaces — 0 абразивов, 5 ферментов
[Бренд C] — травяной    | Нет клинических данных      | DETOX — #1 most selling clove + cinnamon blend toothpaste on European marketplaces — taste specially developed for western consumer — bestseller — −74% P.gingivalis, клиника — safe for continuous daily use
```

---

### STEP D — E-commerce Intelligence
**Minimum 2 web_search calls. Mandatory for Russia, ASEAN, UAE.**

**Russia:**
- Search top-selling oral care on Wildberries and Ozon by category rating
- Queries: `Wildberries зубная паста топ продаж рейтинг`, `Ozon oral care bestseller`
- Extract: top 5 SKUs by review count, price range, brand origin, key claims
- Note: review count on WB/Ozon = proxy for volume. 10,000+ reviews = significant seller.

**Vietnam / ASEAN:**
- Search Shopee VN / Lazada VN / TikTok Shop oral care top sellers
- Query: `Shopee Vietnam toothpaste bestseller [year]`, `kem đánh răng bán chạy Shopee`
- Extract: top brands, price range in VND, claims (whitening dominant? herbal? charcoal?)

**UAE / GCC:**
- Search Noon.com + Amazon.ae oral care category
- Query: `Noon UAE toothpaste bestseller`, `Amazon.ae oral care top rated`
- Extract: top brands, price in AED, whether premium European brands are present

**Output:** 3 bullet points per market — top SKU, price range, what claim dominates. This feeds into slide body copy about channel opportunity.

---

### STEP E — Synthesis & Slide Brief
**Run this before generating any slide code. It is the brief the slide is built from.**

After completing Steps A–D, write a structured brief:

```
MARKET BRIEF — [Country] — [Retailer] — [Date of research]

MARKET SIZE: [figure] [currency] ([year], [source], [channel])
PREMIUM GROWTH: [%] YoY ([source])
E-COM SHARE: [%] of total ([source or "estimated"])

SHELF OCCUPANTS (top brands):
1. [Brand] — [segment] — [price] — [key claim]
2. [Brand] — [segment] — [price] — [key claim]
3. [Brand] — [segment] — [price] — [key claim]

INGREDIENT GAPS CONFIRMED ABSENT:
- Live probiotic paste: [YES ABSENT / NO — [Brand] present at [price]] → SYMBIOS: pioneer + #1 probiotic toothpaste on European marketplaces
- Multienzyme paste: [YES ABSENT / NO — [Brand] present at [price]] → INNOWEISS: first and only multilevel enzyme toothpaste with real multistep action — #1 multienzyme on European marketplaces
- Enzyme whitening: [YES ABSENT / NO — [Brand] present at [price]]
- Microbiome Friendly: [YES ABSENT / NO]

PRICE ARCHITECTURE:
- Floor: [price]
- Ceiling: [price]
- Das Experten target position: [price range] — [VACANT / contested by [Brand]]

WHITE SPACE STATEMENT (one sentence):
[...]

CONSUMER PAIN POINTS (from reviews/complaints):
- [pain 1] — [which Das Experten SKU addresses this]
- [pain 2] — [which Das Experten SKU addresses this]

DAS EXPERTEN ENTRY ANGLE:
[One paragraph — what story to lead with in this specific market for this specific buyer]
```

This brief is not shown to the user. It is the internal working document that drives all copy decisions for Slides 3, 7, 8, and the closing CTA.

---

### Final Slide 3 Build Rules

After the brief is complete, build the slide with:

**Three stat callouts (L1 size, accent-1 colour):**
- Stat 1: Market size — verified figure with source in L5 fine print
- Stat 2: Growth rate — premium segment specifically, not total market
- Stat 3: Competitive gap — e.g. "0 пробиотик-паст на полке [ритейлера]" OR consumer trend stat

**One competitive gap table (3 columns, dark bg):**
- Column 1: Current shelf brands + their dominant claim
- Column 2: What is missing — the ingredient/need-state gap
- Column 3: Das Experten SKU that fills it + one clinical number

**One white space statement (L2, full width, accent-1):**
- The exact sentence formulated in Step E

**Source attribution (L6, muted, bottom of slide):**
- List all sources used: "Sources: [Source 1, Year] · [Source 2, Year] · [Retailer research, Date]"

⛔ **If any step returns insufficient data:** do not fabricate. State on the slide: "Данные по рынку ограничены — рекомендован полевой анализ." Use only what was verified. A slide with 2 real stats is stronger than a slide with 5 invented ones.

**Slide 4 — Product Line Overview**
- Visual grid of SKUs to feature (based on user's answer to Q3)
- Each card: product name, article number, 1-line benefit, key ingredient
- Pull data from `references/sku-data.md`

**Slide 5 — Hero Products (2–3 SKUs in depth)**
- For each hero product:
  - Product name + article
  - Core function + mechanism
  - 1 clinical number
  - "Best for" profile
- Selection logic — **only fires when Q3 = "Full line" or "Toothpastes only" or "Brushes only"**. If user specified exact SKUs, take the first 2–3 by brand ranking as heroes — no override.

  Ask the user (single_select via `ask_user_input_v0`):
  > "Which angle should the hero products lead with?"
  > - **Bestsellers / Top Sellers** — proven commercial pull, high review volume, buyer confidence
  > - **Innovative Hits** — hot science angles, category disruptors, conversation starters
  > - 🔄 Regenerate — think harder

  **Bestsellers / Top Sellers bucket** (full list):
  - Pastes: SYMBIOS (DE206), DETOX (DE202), INNOWEISS (DE210), SCHWARZ (DE201)
  - Brushes: GROSSE (DE119), NANO MASSAGE (DE120), SCHWARZ brush (DE105)

  **Innovative Hits bucket** (full list):
  - Pastes: INNOWEISS (DE210), THERMO 39° (DE209), SYMBIOS (DE206)
  - Brushes: GROSSE (DE119), ETALON (DE101), INTENSIV (DE130)

  **Auto-filter by Q3 category:**
  - "Toothpastes only" → drop all brushes from the bucket before selecting heroes
  - "Brushes + Flosses" → drop all pastes from the bucket before selecting heroes
  - "Brushes + Accessories" → drop all pastes from the bucket before selecting heroes
  - "Full line" → use full bucket as-is

  **BUDDY MICROBIES (DE207)** sits outside both buckets. Only include if audience context explicitly confirms kids/family focus.

  Pick the first 2–3 SKUs from the filtered bucket as Slide 5 heroes.

**Slide 6 — Clinical Proof / Why It Works**
- 4–5 key clinical numbers from the brand (use `references/clinical-data.md`)
- Format: large number + bold claim + short evidence note
- Example: "−74% P. gingivalis | DETOX — 2-week clinical study"

### Audience-Specific Slides

#### If Distributor:

**Slide 7 — Distribution Opportunity**
- Market gap: "Probiotic oral care — underdeveloped in [country]"
- Positioning: first-mover advantage, no local competitor with live cultures
- Suggested product entry set (3–5 SKUs as starter assortment)

**Slide 8 — Commercial Terms**
- MOQ (use user-provided info or leave as [to be confirmed])
- Payment terms
- Delivery terms (EXW / CIF / FCA)
- Lead time
- Exclusivity options (if applicable)
- Legal entity + contact for this market

**Slide 9 — Partnership Benefits**
- Co-marketing support available
- Marketing assets: ready imagery, product descriptions, translations
- Online marketplace setup support (WB, Ozon, Amazon, Shopee, etc.)
- Training / product knowledge sessions

#### If Retail Chain:

**Slide 7 — Shelf & Category Strategy**
- Recommended shelf placement (oral care premium segment)
- Suggested facing count per SKU
- Planogram concept (describe as text layout)
- Entry assortment: 2 pastes + 2 brushes minimum

**Slide 8 — Consumer Demand & Pull**
- Sales data reference: "More than 507,000 reviews from satisfied customers — average rating 4.87 out of 5"
- Review count / average rating if available
- Social proof stats: 500,000+ verified buyer reviews on Wildberries — avg rating 4.87 stars
- 67% reorder rate — one of the highest in the oral care category on European marketplaces
- Target consumer profile: 25–45, health-conscious, urban

**Slide 9 — Trade Terms**
- Margin structure (wholesale vs. retail)
- In-store promo mechanics available (in&out, endcap, loyalty)
- Return policy
- Supply chain: delivery terms, lead time, min order per SKU

#### If Catalog Review:

**Slide 7 — Full SKU Table**
- Table format: SKU | Article | Format | Key Ingredient | RRP | B2B Price
- Include all requested products
- Pull prices from user input (or leave [price on request])

**Slide 8 — Ingredients Matrix**
- Table: Product | Hero Ingredient | Function | Clinical Claim
- Use data from `references/sku-data.md`

#### If Consumer / DTC:

**Slide 7 — The 14-Day Challenge**
- Visual timeline: Day 1 → Day 7 → Day 14 — what the user feels / sees / notices
- Lead with the most sensory-immediate product (SCHWARZ visual contrast, SYMBIOS freshness, BUDDY for kids)
- Frame as personal transformation, not a product spec sheet
- Include one real-world before/after story or testimonial archetype (e.g., "Heavy coffee drinker, 34, Moscow")

**Slide 8 — Daily Routine Integration**
- Show how Das Experten fits into a 2-minute morning routine
- Taste + texture callouts per hero SKU (e.g., "No foam shock — gentle mint," "Warming sensation — not burning")
- Pair products: paste + brush + floss — show the full system
- Subscription / bundle value: "Save X% vs. single purchase" (fill with real or [TBC] figures)

**Slide 9 — Why Das Experten Beats the Big Brands**
- Side-by-side: Das Experten vs. Colgate / Sensodyne / Lacalut on 3 key axes (ingredients, microbiome safety, clinical backing)
- No fear language. Frame as "what's actually in what you're using now"
- Source: ingredients transparency / fluoride-free / SLS-free / live cultures angle

#### If Dentist / Dental Professional:

**Slide 7 — Mechanism of Action**
- For each hero SKU: active ingredient → target pathway → clinical outcome
- Example structure: "Bacillus coagulans JYBC-016 → displaces S. mutans → −68% caries-linked bacteria at 4 weeks"
- Use scientific terminology. No consumer softening.
- Reference strain numbers, CFU counts, enzyme names (dextranase, lysozyme, papain, etc.)

**Slide 8 — Clinical Evidence Summary**
- Lead with the 3 strongest numbers from `references/clinical-data.md`
- Format: Study design | Duration | Key metric | Result
- Follow with: "Available on request: full study documentation, methodology, IRB status"
- Add: ADA-equivalent positioning note (fluoride-free alternative with enzyme-based remineralization)

**Slide 9 — In-Office Trial Program**
- Trial kit proposal: 5–10 units per SKU, 30-day patient trial
- ROI framing: "1 recommendation = avg. X units/year per patient household"
- Patient compliance note: taste/texture acceptance data, pediatric line highlight (BUDDY + EVOLUTION)
- Offer: professional discount tier, co-branded sample packs, CPD session (Continuing Professional Development)

#### If Blogger / Influencer:

**Slide 7 — Content Angles That Convert**
- 3 proven hook formats for Das Experten content:
  - "I switched from [Colgate/Sensodyne] for 30 days — here's what happened"
  - "This black toothpaste actually works — and here's the science"
  - "The toothpaste my dentist hasn't heard of yet — but should"
- For interpreter-collaborators: "You're not just translating — you're the cultural bridge between a German science brand and [country] consumers"
- Note: diversify creator roster — single-point dependency is a brand risk

**Slide 8 — What We Give You (Assets + Support)**
- ⛔ This slide contains product images — **must use dark background** (#1A1A1A). See Product Assets section for absolute rule.
- Raw unboxing assets: product shots (black-bg), ingredient cards, before/after visual templates
- Content calendar framework: 4-week rollout (unboxing → review → deep-dive → comparison)
- Affiliate structure: [% commission] per validated sale / promo code
- Exclusives available: first-to-market SKUs, limited drops, co-branded packs
- Language assets: ready captions in EN / RU / [local language]

**Slide 9 — Collaboration Terms**
- Barter vs. paid: product send (trial) → performance review → paid partnership
- Deliverables expected: [X] posts / [Y] stories / [Z] reels over [period]
- Brand guidelines: what to say, what NOT to say (no detox for SCHWARZ; no health claims without sourcing)
- Contact: Aram Badalyan — General Manager (direct, no middleman)


### Dedicated Category Slides — MANDATORY RULES

#### ⛔ FLOSSES DEDICATED SLIDE — fires when Q3 = "Brushes + Flosses" OR "Brushes + Accessories" OR "Full line"

Always insert a dedicated Flosses slide immediately after the brushes product slides. Never merge flosses into the brushes slide.

**Flosses Slide — structure:**
- Slide title: "Complete the System — Interdental Care"
- 3-column layout, one column per floss SKU:
  - **DE112 EXPANDING floss** — hydrophilic multifilament, blooms 2–3× on contact, mixed contacts + restorations
  - **DE111 WAXED MINT floss** — peppermint-waxed polyester glide, tight contacts + implants + retainers
  - **DE115 SCHWARZ floss** — bamboo + coconut charcoal expanding floss, visual plaque detection
- Dark background (#1A1A1A) — product images if available, otherwise SKU name + 1-line benefit card
- Footer: Das Experten logo (dark variant)

#### ⛔ ACCESSORIES DEDICATED SLIDE — fires ONLY when Q3 = "Brushes + Accessories" OR "Full line"

Always insert an Accessories slide immediately after the Flosses slide. Never merge with flosses.

**Accessories Slide — structure:**
- Slide title: "Total Oral Hygiene System — Accessories"
- 3-column layout:
  - **DE125 INTERDENTALS S** — interdental brush small, stainless core + polymer filaments, crowns + implants + braces (narrow embrasures)
  - **DE126 INTERDENTALS M** — interdental brush medium, same construction, wider embrasures
  - **DE114 ZUNGER** — Das Experten tongue scraper, daily tongue hygiene, halitosis prevention
- Dark background (#1A1A1A)
- Footer: Das Experten logo (dark variant)

### SLIDE COUNT — EXTENSION RULES

**Default deck structure:**
- Slides 1–6: Fixed for all deck types — never removed, never reordered
- Slides 7–9: Audience-specific — vary by deck type (distributor, retail, catalog, dental, influencer, etc.)
- Slide 10: Next Steps — always present
- Slide 11: Contact / Back Cover — always last
- Optional inserts: Flosses slide, Accessories slide — fire when Q3 triggers them

**Default total: 11–13 slides depending on optional inserts.**

**If the user requests more slides — proportional extension rules:**

⛔ NEVER invent new slide types or improvise structure.

Extend ONLY within these allowed zones, in this order:

1. **Slides 7–9 zone** — split any slide in this zone into 2 slides if content justifies it (e.g. one slide per hero SKU, one slide per clinical claim, one slide per category)
2. **Hero Products (Slide 5)** — default is 2–3 SKUs. When user requests more slides, extend up to 10 hero product slides — one SKU per slide. Selection must come exclusively from the two existing buckets:

   **Bestsellers / Top Sellers bucket:**
   - Pastes: SYMBIOS (DE206), DETOX (DE202), INNOWEISS (DE210), SCHWARZ (DE201)
   - Brushes: GROSSE (DE119), NANO MASSAGE (DE120), SCHWARZ brush (DE105)

   **Innovative Hits bucket:**
   - Pastes: INNOWEISS (DE210), THERMO 39° (DE209), SYMBIOS (DE206)
   - Brushes: GROSSE (DE119), ETALON (DE101), INTENSIV (DE130)

   The user's selected angle (Bestsellers or Innovative Hits) from Step 3 determines which bucket to draw from. Never pull SKUs from outside the selected bucket to fill extra slides. BUDDY MICROBIES (DE207) only enters if audience context confirms kids/family focus.
3. **Clinical Proof (Slide 6)** — extend from summary to one slide per product clinical story
4. **Product Line Overview (Slide 4)** — extend to separate pastes slide + brushes slide + accessories slide

**Hard rules for extension:**
- Slides 1–3 (Cover, About, Market) — never split, never duplicated
- Slide 10 (Next Steps) and Slide 11 (Contact) — always remain last, never split
- Every added slide must follow the same layout, palette, and typography rules as its section
- Never add a slide without a clear content reason — if user says "make it longer" ask: which section should be deeper?

**When user requests more slides — always confirm in one line:**
"Extending [section name] from X to Y slides — adding [what content]."

---

### Universal Closing Slides (ALL types)

**Slide 10 — Next Steps**
- 3 clear action items (customize per context)
  - "Sign NDA + receive full price list"
  - "Confirm entry assortment + MOQ"
  - "Schedule technical Q&A call"
  - "Submit shelf space request"
- Timeline suggestion: "We aim to confirm within [X] days"

**Slide 11 — Contact / Back Cover**

⛔ **CONTACTS GATE — MANDATORY BEFORE WRITING SLIDE 11**

Before generating Slide 11, invoke the contacts skill to pull the canonical entity record:

```
[[GATE: contacts?entity=<entity-slug>&fields=legal-name-full,website,primary-email,contact-persons&purpose=das-presenter-slide11]]
```

Where `<entity-slug>` is derived from the Country → Entity table in Step 1D:
- Russia / CIS → `dee`
- UAE / MENA / GCC / other international → `dei`
- Vietnam / ASEAN → `deasean`
- EU / Germany → `de-gmbh` (if registered) else `dei`
- Armenia → `dee` or `dec` per user context

**On return:**
- Use `legal-name-full` from contacts/ as the entity name on the slide — never the short-form from memory
- Use `website` from contacts/ as the domain displayed
- Use `primary-email` from contacts/ as the entity email
- Use `contact-persons` block from contacts/ to resolve the assigned contact person (see routing table below as the logic layer — names themselves come from contacts/)

**Fallback routing tables (used only if contacts/ returns `NOT_FOUND` for the entity — log a warning to user):**

- Legal entity relevant to this market
- Contact: email/phone as appropriate — **use the routing table below to assign the correct contact person**
- Brand logo
- Tagline: "innovativ und praktisch"
- Dark background, full bleed

**Website domain routing — fallback table:**
| Market | Website to display |
|---|---|
| Russia / Russian-language deck | dasexperten.ru |
| All other markets / all other languages | dasexperten.com |

**Email routing — fallback directory:**

| Email | Entity / Role | Use when |
|---|---|---|
| emea@dasexperten.de | Das Experten International LLC (UAE) — DEI | All non-Russian/non-CIS markets — general contact |
| eurasia@dasexperten.de | Das Experten Eurasia LLC (Russia) — DEE | Russia + CIS + ex-USSR — general contact |
| marketing@dasexperten.de | Marketing department | Marketing materials, banners, influencer outreach |
| gmbh@dasexperten.de | Das Experten GmbH (Germany) | Legal and contract documents |
| export@dasexperten.de | Export department | All international B2B export inquiries |
| dr.badalian@dasexperten.de | Aram Badalyan — General Manager | Personal direct contact |

⛔ Never swap these. Each email has one function.

#### ⛔ CONTACT PERSON ROUTING TABLE — MANDATORY — NO EXCEPTIONS

Assign the contact person based on the country/region collected in Step 1. Never use Aram Badalyan as the primary contact for the regions below.

| Region | Contact Person | Role |
|---|---|---|
| Ukraine + all European countries (EU, Czech Republic, Germany, Poland, etc.) | **Vitali Kravchenko** | Regional Sales Manager |
| Russia | **Андрей Черкашин** | Региональный менеджер по продажам |
| Central Asia (Kazakhstan, Uzbekistan, Kyrgyzstan, Tajikistan, Turkmenistan, Azerbaijan) | **Vahram Gevorgyan** | Regional Sales Manager |
| All other markets (UAE, MENA, ASEAN, Armenia, other) | **Aram Badalyan** | General Manager |

Include the assigned contact person's name, role, and correct entity email (emea@dasexperten.de for DEI markets / eurasia@dasexperten.de for DEE markets) on Slide 11. If phone was provided by the user — include it. If not — leave as `[phone]` placeholder.

---

## Step 4 — Design Rules (MANDATORY)

### Color System

Use **exclusively** palette hex from Step 2C. Map: `bg-primary` (dark bg / cover / dividers) · `bg-secondary` (content slides) · `accent-1` (headlines / bars / key numbers) · `accent-2` (callouts / highlights / icons) · `#FFFFFF` (text on dark) · `text` (body on light) · `muted` (captions / labels / logo). ⛔ **Never hardcode any hex value not derived from the selected palette.**

### Typography

Fixed 6-level hierarchy — brand standard, applies to ALL slides without exception:

⛔ **ALL TEXT AT ALL LEVELS IS `bold: true` — NO EXCEPTIONS. No regular, light, thin, or semibold weight anywhere in any deck, in any language.**

| Level | Role | Min Font Size | Application |
|---|---|---|---|
| L1 | Primary Headline | **36pt default** | Bold sans-serif · ALL CAPS · `bold: true` · left or right placement · **MUST fit exactly 1 line — shrink font 1pt at a time until it snaps in. ONE-LINE RULE IS SUPERIOR TO MIN SIZE: continue shrinking below 36pt if needed. STOP only when text fits on 1 line. NO wrap. NO exceptions.** |
| L2 | Key Slogan / Subhead | **24pt default** | Bold sans-serif · mixed case · `bold: true` · high contrast · centered or top-right lockup · **MUST fit exactly 1 line — shrink font 1pt at a time until it snaps in. ONE-LINE RULE IS SUPERIOR TO MIN SIZE: continue shrinking below 24pt if needed. STOP only when text fits on 1 line. NO wrap. NO exceptions.** |
| L3 | Body Header | **18pt minimum** | Bold sans-serif · `bold: true` · mid-size · left or right blocks |
| L4 | Body Copy | **14pt minimum** | Bold sans-serif · `bold: true` · paragraphs and lists |
| L5 | Fine Print | **12pt minimum** | Bold sans-serif · `bold: true` · low contrast · specs and icons |
| L6 | Footer | **10pt minimum** | Bold sans-serif · `bold: true` · bottom alignment · icons/branding marks |

⛔ **ONE-LINE RULE — ABSOLUTE PRIORITY — OVERRIDES ALL SIZE FLOORS:**
L1 and L2 text MUST always render on exactly one line. This rule is superior to all minimum font size constraints.

**Sizing protocol — execute in this exact order:**
1. Start at default size (L1: 36pt, L2: 24pt)
2. If text wraps → **widen the text box first** (up to max available slide width)
3. If still wraps after max width → **shrink font 1pt at a time** — no floor, no stop — until text fits on 1 line
4. Stop the moment text fits on 1 line — do not shrink further
5. Never wrap L1 or L2. Never. A two-line L1 is a layout failure regardless of font size.

⛔ The one-line requirement is SUPERIOR to the minimum size floor. If fitting on 1 line requires going below 36pt (L1) or 24pt (L2) — go below. No exceptions.

#### ⛔ TYPOGRAPHY HARD RULES

- `charSpacing` = `0` on ALL text boxes across ALL slides — **ABSOLUTE, NO EXCEPTIONS, NEVER OVERRIDE.**
  - This means: do NOT pass `charSpacing: 1`, `charSpacing: 2`, or any non-zero value — ever.
  - In pptxgenjs, every `addText()` call must include `charSpacing: 0` explicitly:
    ```javascript
    slide.addText("ПОРТФЕЛЬ БРЕНДА", {
      x: 0.5, y: 1.2, w: 9.0, h: 1.6,
      fontSize: 40, bold: true, color: "FFD700",
      charSpacing: 0,   // ⛔ MANDATORY — never omit, never change
      fontFace: "Arial"
    });
    ```
  - Spacious layouts are achieved via `line height + vertical padding` — NEVER via character spacing.
- Any accent-2 colored text MUST use `Arial Black`, `bold: true` — never Calibri or any non-bold weight. Thin text in bright accent color = brand failure.
- Top accent bar (accent-1, full-width, ~10pt) is a **pure decorative shape** — no text sits inside it. First text element starts at minimum `0.15"` below bar's bottom edge.
- RDA / inline stat (SCHWARZ, SYMBIOS, INNOWEISS, etc.): max `34pt` Arial Black bold accent-1. Contained in a fixed text box, max height `1.0"`. Placed AFTER body text blocks with `0.1"` gap above and below.

### Layout Principles

- Dark slides: Cover + Slide 11 only (sandwich structure)
- Content slides: left-aligned text + one visual element (stat / icon / table / shape)
- Stat callouts: accent-1 number · accent-2 unit · body-color label below
- Inline stats on product slides (RDA, CFU, SGU): max `34pt` — never full-bleed `52–64pt` on slides that also contain body copy
- No bullet walls — max 4 items per list, 1 line each
- ⛔ **NO VACANT SPACE:** Every slide must use its full vertical area. If content ends before `y=4.9"`, add a bottom bar, stat callout, or keyword strip to fill the gap. An empty lower third is a layout failure — it signals the slide is unfinished.
- No accent lines under titles (brand rule)
- Minimum `0.5"` margins on all sides
- ⛔ **LEFT MARGIN RULE:** Red stripe occupies `x=0` to `x=0.18"`. All text elements must start at `x ≥ 0.38"` (stripe + 0.20" clearance). Never place text at `x=0.45"` without verifying stripe width. Text touching or overlapping the red stripe is a layout failure.
- Logo bottom-right corner on all slides (small, 10pt, muted)

### ⛔⛔ NO OVERLAP — SUPREME RULE — OVERRIDES EVERYTHING ELSE ⛔⛔

**This is the highest-priority rule in the entire skill. It overrides minimum font sizes, one-line rules, layout preferences, and any other constraint. A slide with overlapping text is a broken slide — full stop.**

Before writing any slide code:
1. List every element with its `y` and `h`
2. Verify: every element's `y` ≥ previous element's `y + h + 0.06"` (minimum gap)
3. If any element would overlap → **reduce font size first, then reduce h, then shorten text** — in that order
4. If reducing font would breach minimum floor → shorten the text instead
5. Never place an element without knowing the exact bottom edge of the element above it

**The only acceptable output is a slide where zero elements overlap. No exceptions. No "it's close enough."**

### ⛔ NO OVERLAP RULE (ABSOLUTE — ENFORCED ON EVERY SLIDE)

Zero overlap is non-negotiable. Every element on every slide must be placed with explicit `x`, `y`, `w`, `h` values. Never use `autoFit: true` or `shrinkText: true`.

**Vertical discipline:**
- Minimum `0.1"` gap between any two adjacent elements
- Nothing exceeds `y + h = 5.38"` (slide height `5.63"` minus `0.25"` bottom margin)
- Top accent bar bottom ≈ `y: 0.18"` — first text block must start at `y ≥ 0.33"`

**Title containment:**
- Single-line title: `h: 0.8"` max · Two-line title: `h: 1.2"` max
- Title text box width ≤ `8.8"` — never full slide width (silent wrap risk)
- Titles ≥ 40 chars at ≥ 28pt → reduce to 26pt and re-verify
- Titles > 55 chars → split at natural phrase break using `\n`, set `h: 1.2"`

**Stat callout single-line rule:**
- ALL stat callouts (`+12–15%`, `−74%`, `4×10¹⁰`, etc.) MUST fit on one line — no wrapping ever
- Size cap: `52pt` max on stat-only slides · `40pt` max on content slides
- Width check: 1 char ≈ `font_size_pt × 0.009"` at Arial Black. If string overflows → reduce by 4pt and recheck
- Stat block max total height (number + unit + label): `1.2"`

⛔ **COVER SLIDE — ABSOLUTE:**
- **Background shape FIRST** — before any text or logo: full-bleed dark rectangle `x: 0`, `y: 0`, `w: 10.0"`, `h: 5.63"`, fill `#1A1A1A`. This shape must cover 100% of the slide. No white gaps on any side.
- TWO separate stacked headline boxes — NEVER same `y` or overlapping range
- Headline 1 (white): `y: 1.2"`, `h: 1.6"` max, full width `w: 9.0"`, font 40–48pt, `charSpacing: 0` — **mandatory**
- Headline 2 (accent-1): `y = headline1_y + headline1_h + 0.1"` — calculated, never hardcoded, font 28–34pt, `charSpacing: 0` — **mandatory**
- Subline (AUDIENCE · COUNTRY YEAR): `y: 4.9"` fixed — never floats up, `charSpacing: 0` — **mandatory**
- Verify: `headline2_y + headline2_h < 4.7"` — if not, shrink headline fonts, not subline
- ⛔ `charSpacing: 0` on EVERY text element on the cover — no exceptions. Expanded spacing is a brand failure.
- ⛔ No product images on cover — typography only

⛔ **PRODUCT CARD SLIDES — ABSOLUTE:**
- Columns are independent zones — no shared Y across columns
- 3-column layout: `w: 3.0"` max per column · 2-column: `w: 4.5"` max
- Fixed order within each column: image (max `2.8"` height, derive `w` from real pixel ratio) → name → SKU → tagline → stat block — all with explicit pre-calculated `y` values

**Pre-build verification — mandatory 2D overlap check (run before declaring done):**

After generating the file, run this check on every slide. Zero overlaps is the only acceptable result:

```python
from pptx import Presentation
prs = Presentation('output.pptx')
for slide_num, slide in enumerate(prs.slides, 1):
    elements = []
    for shape in slide.shapes:
        if hasattr(shape,'text') and shape.text.strip():
            x=round(shape.left/914400,3); y=round(shape.top/914400,3)
            w=round(shape.width/914400,3); h=round(shape.height/914400,3)
            elements.append((x,y,w,h,shape.text.strip()[:30]))
    overlaps=0
    for i,(x1,y1,w1,h1,t1) in enumerate(elements):
        for j,(x2,y2,w2,h2,t2) in enumerate(elements):
            if i>=j: continue
            if x1<x2+w2 and x2<x1+w1 and y1<y2+h2 and y2<y1+h1:
                print(f'Slide {slide_num} OVERLAP: [{t1}] + [{t2}]'); overlaps+=1
    if overlaps==0: print(f'Slide {slide_num}: ✓ clean')
```

If any overlap found → fix before presenting to user. No exceptions.
1. Any text box `y + h` exceed next element's `y`? → Fix
2. Any element `y + h > 5.38"`? → Move up or reduce
3. Title overlaps accent bar? → Increase title `y` by `0.15"`
4. Any stat exceeds allowed max pt for slide type? → Reduce font
5. Any image outside slide bounds? → `x + w ≤ 9.9"` · `y + h ≤ 5.5"` — reduce `h`, recalculate `w` from ratio
6. Cover headline overlap? → `headline2_y ≥ headline1_y + headline1_h + 0.05"` — if not, shrink headline 1 first
7. Stat wrap? → If box rendered `h > font_size_pt × 0.014" × 1.5`, wrap occurred — reduce 4pt, re-verify
8. ⛔ Any L1/L2 font below default floor? → Only acceptable reason is ONE-LINE RULE enforcement. If text fits on 1 line — it's correct regardless of size. If text is below floor AND still wraps — shorten the text, then re-apply shrink protocol. L3/L4/L5/L6 floors remain hard: L3 < 18pt · L4 < 14pt · L5 < 12pt · L6 < 10pt — **shorten the text, never shrink the font**
9. ⛔ Any `bold: false` or missing `bold` property? → Set `bold: true` on every single text element — no exceptions

---

## Step 5 — Build the File

Use `pptxgenjs` to generate the `.pptx`. Read `/mnt/skills/public/pptx/pptxgenjs.md` for full syntax.

```bash
npm install -g pptxgenjs
node das_presentation.js
```

Save output to `/mnt/user-data/outputs/DasExperten_[AudienceType]_[Country]_[YYYY].pptx`

Example: `DasExperten_Distributor_Vietnam_2026.pptx`

---

## Step 6 — QA

Follow the full QA loop from `/mnt/skills/public/pptx/SKILL.md`:

1. Extract text: `python -m markitdown output.pptx`
2. Check: missing content, wrong order, placeholder text remaining
3. Convert to images for visual inspection
4. Fix layout issues, re-verify
5. Do not declare success until one full fix-and-verify cycle is complete

---

## Prohibited in All Outputs

- No "high quality" without data
- No fear-based messaging
- Do NOT call Schwarz a "detox" product — it is charcoal-based delicate care
- No apologies for product performance
- No mention of Wildberries by name in visual design (legal risk)
- Never sign as "Команда" — always from Aram Badalyan, General Manager
- No «» quotation marks — use "" only
- **NEVER set both `w` and `h` of a product image as independent fixed values** — always derive one from the other using the real pixel ratio. Hardcoding both dimensions stretches the image and distorts product proportions.

---


## PRODUCT ASSETS & LOGO USAGE — LAZY LOAD

**Do NOT load by default.** Load `references/PRODUCT_ASSETS_reference.md` only when the user mentions:
- `assets`, `логотип`, `logo`, `фото продукта`, `product photo`, `изображения`, `product images`, `background rules`, `dark slide`, `тёмный фон`, `PNG`, `logo rules`
- Or when Step 5 (Build the File) requires inserting product images or logo into slides

When triggered, read the file and apply asset rules to slide generation.
After completing, signal: `↩️ PRODUCT_ASSETS_reference loaded — resuming main workflow.`

---

## Reference Files

| File | Contents | When to read |
|---|---|---|
| `references/sku-data.md` | Full SKU table with ingredients, articles, clinical claims | Slide 4, 5, 7 (catalog), 8 (catalog) |
| ~~`references/market-data.md`~~ | **DELETED** — replaced by live web_search research protocol in Slide 3 rules | — |
| `references/clinical-data.md` | All key clinical numbers across products | Slide 6 |
| `assets/logo_light.jpg` | Light logo — JPG, ratio 3.003 | Step 5 — light slides |
| `assets/logo_dark.png` | Dark logo — transparent PNG, 944×264px, ratio 3.576 | Step 5 — dark slides |

#### ⛔ SLIDE 5 — HERO PRODUCT LAYOUT RULES (ABSOLUTE — DO NOT DEVIATE)

These rules come from verified, tested, working code. Follow exactly.

**Background**: DARK (#1A1A1A). Product images require dark bg — absolute rule.

**Layout pattern: [text | image] [divider] [text | image] — two panels**

```
Red stripe: x=0 w=0.18" — text must NEVER start before x=0.38" (0.20" margin from stripe)
Slide usable: x=0.38" to 9.9"

Panel A: txt_x=0.38  txt_w=1.90" | gap=0.12" | img_x=2.40  img_w=IMG_W  right=4.79"
Divider: x=4.90"
Panel B: txt_x=5.05  txt_w=2.10" | gap=0.12" | img_x=7.27  img_w=IMG_W  right=9.66"
All right edges < 9.9" ✓
```

**Image dimensions — ALWAYS use image-size to get real pixel ratio. NEVER hardcode both w and h:**
```javascript
const sizeOf = require("image-size");
const dims = sizeOf(filePath);
const IMG_RATIO = dims.width / dims.height;   // real ratio — lock this
const IMG_H = 3.2;                             // set ONE dimension only
const IMG_W = parseFloat((IMG_H * IMG_RATIO).toFixed(3)); // derive the other
const IMG_Y = 1.08;
// img bottom = 1.08 + 3.2 = 4.28"
```

**Y stack — ALL positions pre-calculated before writing ANY addText(). Minimum 0.07" gap:**
```
title  y=1.08  h=0.38  bottom=1.46   (L2 product name, 18pt bold)
tag    y=1.53  h=0.58  bottom=2.11   (tagline, 2 lines, 14pt bold)
mech   y=2.18  h=0.75  bottom=2.93   (mechanism, 3 lines, 12pt bold)
stat   y=3.00  h=0.42  bottom=3.42   (clinical stat, 14pt bold accent-1)
for    y=3.49  h=0.38  bottom=3.87   (best-for, 12pt bold muted)
                                       3.87 < img_bottom 4.28 ✓ no overlap
```

**Bottom bar — MANDATORY. Fills vacant space below images. Never leave empty slide bottom:**
```
bar_y=4.38  bar_h=0.55  bottom=4.93  < logo_y 5.05 ✓
Panel A bar: x=0.38  w=4.42  fill=#262626  border=#333333
Panel B bar: x=5.05  w=4.57  fill=#262626  border=#333333
Text inside: x=bar_x+0.10  y=bar_y+0.10  h=0.35  fontSize=12  bold=true  color=muted
Content: 3–4 product keywords (e.g. "Пробиотик · Microbiome Friendly · Без фтора")
```

**Divider — must span full content height including bottom bar:**
```javascript
s.addShape(pres.ShapeType.rect, {
  x: 4.90, y: 1.08, w: 0.03,
  h: IMG_H + BAR_H + 0.18,   // full height — not just img height
  fill: { color: "333333" }, line: { color: "333333" }
});
```

**Universal rules (apply to every addText() on this slide — no exceptions):**
- `charSpacing: 0` — always explicit
- `bold: true` — always explicit
- `margin: 0` — always explicit
- `fontFace: "Arial"` — always explicit

**After generating — run 2D overlap check (both X and Y must overlap to count). Zero overlaps = only acceptable result. If any found → fix before presenting.**

---

**Version:** 1.1
**Gate integrations:** product-knowledge (Step 1B), marketolog (Step 2B, direct read), benefit-gate (Step 1D), pricer (Step 2D, conditional), contacts (Slide 11), legalizer-compliance (on-demand)
**Return signals expected:**
- product-knowledge: `PASS / CONDITIONAL PASS / FAIL`
- benefit-gate: `BENEFIT_GATE_RESULT` (Profile Mode)
- pricer: `⚙️ PRICE GATE RESULT` or `NOT_LISTED`
- contacts: `FOUND / NOT_FOUND / STALE / INCOMPLETE`
- legalizer-compliance: `✅ CLEARED / ⚠️ PROCEED WITH CAUTION / 🔴 BLOCKED`
**Owner:** Aram Badalyan
**Brand scope:** Das Experten
**Changelog:**
- 1.1 — Added Step 2D Price Gate; added Contacts Gate for Slide 11; clarified legalizer-compliance as the correct legalizer entry point; added explicit return signal documentation
- 1.0 — Initial version with 6 audience types, 3 hard gates (product, marketolog, benefit), on-demand legal gate
