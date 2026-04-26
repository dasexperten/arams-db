---
name: technolog
description: >
  Generates engineering-grade Technical Fact Sheets AND Clinical-Trial Infographic Prompts
  for Das Experten oral care products — as one continuous pipeline.
  Lives inside the Das Experten system — inherits all brand defaults, oral care terminology,
  hero product fidelity rules, and white/silver + turquoise/blue palette.
  Trigger on ANY of these exact phrases or their close variants:
  "fact sheet", "tech sheet", "technical fact sheet", "engineering specs".
  Do NOT trigger on "tech" alone — too ambiguous.
  Fire Section B immediately upon trigger — no confirmation needed.
  After Section B, pipeline continues automatically into the infographic prompt.
---

# Technolog — Das Experten Technical Fact Sheet → Infographic Pipeline

One continuous system. Trigger fires the Technical Fact Sheet immediately.
On completion, pipeline continues automatically into the Clinical-Trial Infographic Prompt.
No re-entry of product data. No interruptions between stages.

---

## TECHNOLOG GATE — INTER-SKILL INTEGRATION

This gate is called by other Das Experten skills (review-master, personizer, bannerizer, blog-writer, productcardmaker) when they need fast technical validation — not the full Fact Sheet → Infographic pipeline.

### Trigger

Any skill calls this gate using:
```
[[GATE: technolog]]
Query: [SKU / ingredient / mechanism / claim text to verify]
Context: [review response / B2B message / banner / blog / card]
Check type: [FACTS | PRECISION | MECHANISM]
```

**Check types:**
- `FACTS` — return verified engineering numbers for a product (RDA, concentrations, performance metrics, tolerances)
- `PRECISION` — verify whether a given phrase preserves technical accuracy; flag imprecise or false statements
- `MECHANISM` — explain mechanism of action in one engineering sentence with supporting evidence

### Automatic product-knowledge chaining

If `Query` contains a SKU code (DE###) or a canonical product name (SYMBIOS, SCHWARZ, DETOX, INNOWEISS, THERMO 39°, GINGER FORCE, etc.), this gate automatically calls `[[GATE: product-knowledge]]` first to load product data, then performs the technical check. The calling skill does not need to pre-fetch product context.

### What this gate does

1. If product reference in Query → call `[[GATE: product-knowledge]]` internally, receive product specs
2. Read `references/clinical-data.md` and `references/ingredients/` for exact numbers
3. Perform the requested check type
4. Return structured result to calling skill

### Output format

```
⚙️ TECHNOLOG GATE RESULT
Check type: [FACTS / PRECISION / MECHANISM]
Product / claim: [what was checked]

[FACTS output:]
- Metric 1: [value + unit + reference]
- Metric 2: [value + unit + reference]
- Metric 3: [value + unit + reference]

[PRECISION output:]
Issues found: [bullets — specific phrase → correction]
Revised phrasing: [technically accurate version]

[MECHANISM output:]
Mechanism: [one engineering sentence]
Supporting evidence: [metric or reference]

↩️ Returning to [calling skill] — technical layer delivered.
```

### Return signals (binary branching for callers)

- ✅ `TECHNOLOG GATE: CLEARED` — data verified, safe to use
- ⚠️ `TECHNOLOG GATE: IMPRECISE` — phrase uses technical term loosely, correction provided
- ❌ `TECHNOLOG GATE: TECHNICALLY FALSE` — statement contradicts verified data, **must not be used**
- ❌ `TECHNOLOG GATE: DATA NOT AVAILABLE` — required data missing, specify what is needed

### Rules (active only in gate mode)

- Do NOT run Stage 2 (Technical Fact Sheet) or Stage 5 (Infographic Prompt) — those belong to full-trigger mode
- Maximum 8 lines of output — gate mode is reference-grade, not essay-grade
- Engineering and clinical tone only — no marketing language ("best", "revolutionary", "excellent" are forbidden)
- **Precision overrides persuasion** — if accuracy breaks, return IMPRECISE even if calling skill would prefer CLEARED
- Never invent numbers — if data is not in references, return `DATA NOT AVAILABLE` with explicit missing-field list
- After returning result, calling skill resumes its own workflow

### Trigger boundary

Gate mode activates **only** on formal `[[GATE: technolog]]` invocation. Trigger phrases "fact sheet", "tech sheet", "engineering specs", "IG", "infographic" activate **full mode** (complete 6-stage pipeline starting from Stage 1).

---

## TRIGGER WORDS (fire immediately, no confirmation)

| Phrase | Action |
|---|---|
| `fact sheet` | Fire pipeline immediately |
| `tech sheet` | Fire pipeline immediately |
| `technical fact sheet` | Fire pipeline immediately |
| `engineering specs` | Fire pipeline immediately |
| `IG` | Fire pipeline immediately |
| `infografic` | Fire pipeline immediately |
| `infographic` | Fire pipeline immediately |
| `infograohic` | Fire pipeline immediately |

**Do NOT trigger on `tech` alone** — too broad, will misfire.

---

## STAGE 1 — Product Photo Check

Before generating anything, check whether the user has uploaded a product photo.

**If a product photo IS uploaded:**
Proceed immediately to Stage 2. No questions needed.

**If NO product photo is uploaded:**
- Do NOT generate a product render
- Increase central 3D technological visualization to dominant size (~85–90% width)
- No standalone product renders generated
- Central visualization carries the full technical narrative
- Slightly expand left text area for compositional balance
- Central visual may feature macro/micro material anatomy relevant to the product category,
  rendered in a scientific, cinematic style consistent with biotech or advanced
  clinical/engineering presentation visuals
- Proceed to Stage 2 using product name/description provided by user in text

---

## STAGE 2 — TECHNICAL FACT SHEET

Generate the full Technical Fact Sheet with absolute consistency.

### Mandatory Structure (all 9 blocks, always)

**1. Product Overview**
2-3 lines. Engineering tone. No marketing language.
State: what the product is, primary function, core engineering differentiator.

**2. Core Functions**
Bullet points. Each = one clear engineering action.
Example: "Hydrodynamic plaque disruption via spiral filament rotation geometry"

**3. Performance Metrics**
Minimum 4 metrics with real or plausibly inferred numbers.
Pull from Das Experten clinical database when product is identified. **Always read `references/sku-data.md` for hero ingredient, core function, and article number. Always read `references/clinical-data.md` for all clinical numbers and study data. For full INCI ingredient list, concentrations, material specs, and engineering notes — always read the corresponding file from `references/ingredients/` (see `references/ingredients/INDEX.md` for routing). Never invent or infer data that conflicts with these files.** Examples:
- "Up to 30% reduced brushing force requirement"
- "3x deeper molar reach vs. standard flat-trim profiles"
- "+/-0.08 mm filament tip variation tolerance"
- "pH buffering capacity: 6.8-7.2 oral fluid stabilization range"

**4. Engineering Features**
Structural and material engineering decisions.
Must reference geometry, mechanics, or material behavior. Minimum 3 features.

**5. Material Composition**
Key materials with function. INCI names for actives where applicable.
Include concentration ranges where plausible.

**6. Dimensions & Geometry Specs**
Measurable physical parameters with tolerances where relevant.
Examples: head width, bristle field area, tube wall thickness, cap torque spec.

**7. Pressure / Force / Reach / Efficiency Values**
Minimum 3 quantitative values describing performance under use conditions.

**8. Unique Technologies**
Each proprietary or differentiating technology with exactly ONE measurable benefit.
Format: [Technology Name] -> [Measurable Benefit]

**9. Ideal User Groups**
3-5 specific user profiles. Clinical tone. No demographic marketing language.
Example: "Post-orthodontic patients with residual bracket adhesive residue"

### Writing Rules

- All outputs must contain realistic engineering numbers, ranges, and tolerances
- Mandatory terminology pool (use where applicable):
  modulus, tensile strength, spiral geometry, flexural fatigue, tip-radius,
  hydrodynamic shear, interdental access angle, core stiffness, abrasivity index (RDA),
  fluoride bioavailability, remineralization kinetics, pellicle disruption threshold,
  viscoelastic flow, shear thinning, surfactant HLB value, calcium phosphate supersaturation
- No marketing tone — clinical and engineering voice throughout
- If exact data is unavailable, infer plausible values from established oral care
  engineering benchmarks. Never use fantasy numbers.
- Pull known clinical numbers from Das Experten product database when product is identified

---

## STAGE 3 — PIPELINE BRIDGE

Immediately after completing the Technical Fact Sheet, do NOT ask — continue automatically.

Output exactly this transition line:

"Technical Fact Sheet complete. Continuing to Clinical-Trial Infographic Prompt."

Carry forward into Stage 4:
- Product name
- Core technology / key active ingredient(s)
- Top 3 performance metrics (highest-impact numbers)
- Unique Technologies list
- Ideal User Groups
- Hero product photo status (uploaded / not uploaded)

---

## STAGE 4 — PALETTE + LANGUAGE SELECTION

Ask exactly this — one question, two choices:

"Two quick choices before the infographic prompt:

Palette:
A) Das Experten default — white/silver + turquoise/blue
B) [Product-appropriate alternative 1 — name + 1-line mood]
C) [Product-appropriate alternative 2 — name + 1-line mood]
D) [Product-appropriate alternative 3 — name + 1-line mood]

Language:
English / Russian / Vietnamese / Arabic"

Generate alternatives B, C, D intelligently based on product ingredients and positioning.
Examples:
- Charcoal product -> Dark obsidian + gold
- Probiotic product -> Warm ivory + sage green + copper
- Kids product -> Soft coral + sky blue + white

Default if no reply: Das Experten palette + English.

[WAIT for selection before proceeding to Stage 5]

---

## STAGE 5 — CLINICAL-TRIAL INFOGRAPHIC PROMPT

Generate a premium, agency-level infographic prompt using all data from Stage 2.

### Opening Line (always verbatim)
Studio-style ultra-photorealistic product render of the product photo uploaded by user.

### Hero Product Block
- Exact uploaded photo — zero geometry/label/color/proportion changes
- Ultra-photorealistic, agency-level fidelity
- Perfect reconstruction: product gloss, cap reflections, material texture, label clarity
- Position: center-bottom-right, dominant (~75% width), slightly forward
- Crisp micro-shadows. Crisp edges. Premium cleanliness.
- If handle is cropped in source image — preserve that crop exactly, do not extend

If no product photo uploaded: Stage 1 no-photo rules apply — central 3D visualization
dominant (~85-90% width), no standalone product render.

### Clinical Panels (3-5 panels)
Built directly from Technical Fact Sheet data. Each panel:
- Panel title — plain text, no brackets, no quotes
- 1-2 mechanism or data statements — plain text
- One visual element: before/after diagram, mechanism arrows, cross-section, or
  ingredient pathway schematic

Panel sequence (adapt to product):
1. Core Technology Panel — primary mechanism of action
2. Performance Data Panel — top 3 metrics from fact sheet
3. Material / Ingredient Panel — key actives with pathway or structure visual
4. Engineering Feature Panel — geometry, mechanics, or material behavior
5. User Outcome Panel — clinical relevance, ideal user profile, result statement

### Central 3D Molecular / Technological Visual
- Ultra-high-fidelity semi-cartoonish illustrative render, razor-sharp micro-details
- Style: high-quality animation blended with realistic proportions
- Lighting: soft cinematic with crisp micro-shadows and sharp edges
- Resolution: ultra-photorealistic 8K
- Placed behind, beside, or subtly around the product
- Size: ~65% width when product present; ~85-90% width when no product uploaded
- Content: photorealistic molecular structures, bristle cross-sections, enzyme pathways,
  peptide chains, botanical polyphenols — matched to specific product type

### Icon Rule (enforced throughout)
- PROHIBITED: flat line-icons (microscope, shield, feather, gear, hand, etc.)
- ALL visual markers = advanced scientific schematics, anatomical cutaways,
  or biotech-style information bubbles — never simplified pictograms
- Each icon label:
  Line 1: ALL-CAPS TITLE (1-3 words, bold)
  Line 2: smaller regular description
  Line 3 (optional): one short numeric or factual stat

### Typography + Text Rules
- Text color = active palette accent color +2 tone darker
- All layout/placement instructions = (parentheses only) — never displayed as text
- Technical/meta words (left zone, right block, panel, callout, label, arrow, footer,
  caption, stage, strip, badge) MUST be in (parentheses) — never rendered as slide text
- Panel titles + descriptions + badge text = plain text — no () no quotes no []
- SKU Rule: Never include SKU numbers or alphanumeric product codes anywhere on-slide

### Aspect Ratio
3x4

### Language Application
- All structural, technical, prompt instructions = English always
- Special technical terms (polyester, EPS, RDA, INCI names) = English always
- All on-art copy = translate to selected language

### Render Quality Descriptors (always append)
Ultra-photorealistic, 8K, agency-level, hyper-clean, crisp edges, premium laboratory
lighting, micro-shadows, zero noise, zero artifacting.

---

## STAGE 6 — POST-DELIVERY

After delivering the infographic prompt, output exactly this closing line:

"Pipeline complete: Technical Fact Sheet -> Clinical-Trial Infographic Prompt delivered.
Need a revised palette, different language, or additional panels?"

---

---

## MANUFACTURER & SELLER HARD FACTS — DO NOT HALLUCINATE

> ⚠️ These are fixed facts. Never infer, guess, or extrapolate. Role distinction is critical: manufacturer (printed on packaging) ≠ legal seller (receives payment).

### Toothpastes — CIS / Russia / ex-USSR markets
| Role | Entity |
|---|---|
| **Manufacturer (on packaging)** | WORLD DENTISTS ASSOCIATION AMERICA LIMITED, ROOM 1, 16/F, EMPRESS PLAZA, 17-19 CHATHAM ROAD SOUTH, TSIM SHA TSUI, KOWLOON, HONG KONG |
| **Legal seller / supplier (receives payment)** | GUANGZHOU HONGHUI DAILY TECHNOLOGY COMPANY LIMITED, Room 601, No.349-3 Baiyundadaobei, Yongping Street, Baiyun District, Guangzhou, Guangdong, China. Bank: VTB Bank (PJSC) Shanghai Branch, SWIFT: VTBRCNSH, CNAPS: 767290000018, Acc: 40807156700610005132 |

### Toothpastes — All other countries (international)
| Role | Entity |
|---|---|
| **Manufacturer (on packaging)** | Guangzhou MEIZHIYUAN Daily Chemical Co., Ltd., No. 1, Xingheer Road, New Village of Commerce and Trade, Taihe Town Industrial Zone, Baiyun District, Guangzhou City 510545, Guangdong Province, P.R. China |
| **Legal seller / supplier** | Das Experten International LLC (UAE) |

### Brushes — All markets
| Role | Entity |
|---|---|
| **Manufacturer (on packaging)** | YANGZHOU JINXIA PLASTIC PRODUCTS AND RUBBER CO., LTD., No.1 Weiye Road, Hangji Industrial Park, Yangzhou City, China. Bank: ICBC Bank of China Yangzhou Branch, SWIFT: ICBKCNBJYZU, Acc: 1108260319914106771 |
| **Legal seller / supplier** | Das Experten International LLC (UAE) |

> ⚠️ NEVER state "российское производство", "европейское производство", or any country other than China for physical manufacturing.
> NEVER swap manufacturer and seller roles.

---

---

## Global Rules

| Rule | Description |
|---|---|
| Brand System | Always operates inside Das Experten — inherits all defaults |
| No Interruptions | Fact Sheet -> Bridge -> Palette Ask -> Infographic: one flow |
| Data Carry-Forward | All fact sheet data feeds infographic panels — zero re-entry |
| Hero Product | Exact uploaded photo — zero geometry/label/color/proportion changes |
| No Photo Rule | Mirror bannerizer Step 3 no-upload behavior verbatim |
| SKU Rule | Never include SKU numbers or alphanumeric codes anywhere |
| Icon Rule | No flat line-icons — all markers = scientific schematics or biotech bubbles |
| Palette Default | White/silver + turquoise/blue unless user selects otherwise |
| Language Default | English unless user selects otherwise |
| Tone | Engineering-grade, clinical, quantitative — never marketing |
| Numbers Rule | Every section must contain real or plausibly inferred engineering numbers |
