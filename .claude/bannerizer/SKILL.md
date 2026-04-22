---
name: bannerizer
description: "Generates agency-level, ultra-photorealistic image prompts for marketing banners, slides, and product visuals — any brand or category. Trigger on: \"make a banner\", \"make a slide\", \"create a banner\", \"create a slide\", \"баннер\", \"слайд\", \"generate a banner for this product\", \"write a prompt for an image of Y\". Adapt to uploaded brand guidelines; fall back to universal best practices. Always produce final prompt + rationale notes. EMBEDDED BRUSH ZOOM MODULE: auto-activates on any toothbrush product — fires macro brush-head composition, product mood table, PBT bristle rendering, grip lock override, and brush-specific 3D visuals. No separate brush-zoom skill needed."
---

# Bannerizer

Generates agency-grade, ultra-photorealistic image generation prompts for marketing slides, banners, and product visuals.  Dafualt is 4:3 (horizotal) and 3:4 (vertical). 

EXECUTION LOCK — MANDATORY: Follow steps in strict sequence (Step 1 → 2 → 3 → 4 → 5 → 6 → 7). After each step, STOP and WAIT for user response before proceeding. Never combine steps. Never pre-fill answers from memory. Never skip to prompt generation. Violating step sequence is a critical error.
All user selections throughout the entire flow must be made via clickable  buttons.


STEP 0 — Product Pre-Flight (always runs first, every banner request)
ALWAYS execute this step before Step 1 — no exceptions, no skipping.

0.1 — Extract Product Signal
From the user's request, extract any of the following:

Product name (e.g. "MITTEL", "SCHWARZ", "SYMBIOS")
SKU code (e.g. "DE210", "DE201", any DE### pattern)
Category description (e.g. "toothpaste for whitening", "charcoal brush", "enzyme rinse")
Vague reference (e.g. "our paste", "the new brush", "the probiotic one")

If the user gave no product signal at all → ask: "Which product is this banner for?" and wait for reply before continuing.

---

## 🖌️ BRUSH ZOOM MODULE — AUTO-ACTIVATES ON TOOTHBRUSH DETECTION

**Detection trigger:** If the product identified in Step 0.1 is any toothbrush — by name (SCHWARZ brush, ETALON brush, GROSSE brush, ZERO brush, NANO MASSAGE brush, AKTIV brush, SENSITIV brush, MITTEL brush, KRAFT brush, INTENSIV brush, 3D brush), by description ("brush", "щётка", "toothbrush", "зубная щётка"), or by any SKU known to be a brush — this module activates immediately.

**Activation status line (always emit once, after Step 0.3 GATE_RESULT, before Step 1):**
> `→ brush-zoom module activated ([SKU] [PRODUCT NAME] brush)`

**Mixed-product banner rule (brush + paste together in one banner):**
- If the brush is the **hero product** (largest visual, headline subject) → activate full BRUSH ZOOM MODULE (BZ-1 through BZ-7)
- If the brush is a **secondary/accompanying product** (paste is hero) → DO NOT activate brush-zoom; render brush as a standard product object with normal composition rules
- If both products share equal hero status → ask user: "В этом баннере что главный герой — щётка [SKU] или паста [SKU]? От этого зависит композиция."

Once active, the following rules OVERRIDE the standard bannerizer composition and visual rules for the entire session:

### BZ-1: Composition Lock (replaces standard layout)

**NEVER split the banner into two separate halves.** Always render as one unified cinematic scene with depth-of-field layering — product in foreground sharp, character and atmosphere in background bokeh. No hard left/right divide.

Dual-focus composition:
- LEFT SIDE → Character (if included) or text block
- RIGHT SIDE → Extreme macro zoom of toothbrush head at **80% visual weight**
- OVERALL MOOD → Set by Product Mood Table below (BZ-4)

### BZ-2: Hero Visual — Brush Head Zoom (mandatory)

The brush head is ALWAYS the dominant product render when this module is active.

Mandatory rendering rules:
- Extreme macro zoom — brush head fills 80% of the right side of the frame
- Brush head angled slightly toward the viewer — never flat/straight-on
- Bristle zone fully visible — no occlusion by hand, character, or text
- Each filament rendered in obsessive detail:
  - Micro-tapered tips visible
  - Material infusion visible (charcoal, gold-ion, silicone, etc. — per product)
  - Micro-spacing between bristle clusters visible
  - Subtle translucency at filament tips
- Micro-specular highlights on individual bristle tips catching light like fiber optics
- Shallow depth of field: bristles in razor focus, background softly bokeh-blurred

Insert the following fidelity block verbatim into Step 7 prompt:

> Hero product(s) = exact user-uploaded photo(s). Ultra-photorealistic, agency-level, zero geometry/label/color/proportion changes. Perfect fidelity on gloss, cap reflections, material texture, label clarity. Seamless micro-shadows and ground reflections.

### BZ-3: 3D Technological Visual — Brush-Specific Options

For Step 5, use the brush-appropriate 3D visual options below instead of the standard toothpaste/liquid families. Select based on product or user context:

| Option | Description |
|---|---|
| Stain absorption field | Dark pigment particles (coffee, wine, tobacco) pulled into bristle tips — cinematic particle physics, motion blur on trails only |
| Charcoal fiber cross-section | Single PBT bristle sliced open — charcoal matrix inside, ember-red glow, biotech schematic style, 3–4× scale |
| Activated carbon molecular mesh | Dark porous honeycomb carbon structure floating behind brush, biotech bubble style |
| Gold-ion antibacterial field (GROSSE) | Au⁺ particle cloud emanating from bristle tips |
| 360° spiral filament cross-section (ETALON) | Schematic illustration of full-coverage filament geometry |
| NanoFlex silicone micro-bubble visualization (NANO MASSAGE) | Gentle silicone micro-bubble field, warm soft light |
| Orthodontic bracket clearance schematic (ZERO) | Technical side-view of bristle tips clearing bracket geometry |
| None | Brush head carries full visual — clean dark background only |

Multiple options may be combined when it strengthens the narrative.

### BZ-4: Product Mood Table (auto-applies to Step 6 palette)

| Brush | Mood | Key Visual Energy |
|---|---|---|
| SCHWARZ brush | Predatory, intense, raw | Dark, dramatic, cinematic |
| ETALON brush | Clean, precise, clinical | White/silver, minimal, scientific |
| GROSSE brush | Powerful, full-coverage | Bold, wide, energetic |
| ZERO brush | Precision, orthodontic | Tight, focused, technical |
| NANO MASSAGE brush | Gentle, family, soft | Warm, soft light, approachable |
| AKTIV brush | Ultra-soft, delicate | Pastel-adjacent, soft shadows |
| SENSITIV brush | Safe, enamel-care | Clean white, calm, trusted |
| MITTEL brush | Workhorse, stain removal | Mid-tone, confident, direct |
| KRAFT brush | Aggressive, heavy-duty | Dark, industrial, strong |
| INTENSIV brush | Dense, ultra-clean | Deep blue/white, clinical |
| 3D brush | Dynamic, multi-angle | Motion-implied, energetic |

This mood overrides Step 6 palette defaults unless the user explicitly selects a different palette.

### BZ-5: Text Rules for Brush Banners

- No English words on banner — only abbreviations (PBT, RDA, Au⁺, etc.)
- All copy in Russian unless user specifies otherwise
- Left-aligned text block, standard horizontal reading orientation
- Stacked top to bottom: headline → subheadline → benefits list
- Flush left, minimum 20px margin from all edges
- No rotation, no tilt, no decorative orientation

### BZ-6: Grip Lock Override for Brush Banners

When a character is present + BRUSH ZOOM is active, replace the standard toothbrush grip block in Step 4 with this verbatim version (do NOT use the standard Step 4 toothbrush grip):

> GRIP LOCK: Character holds the referenced toothbrush in exact realistic grip — thumb pad presses firmly on mid-body near head for controlled hold, index and middle fingers wrap partially around handle opposite thumb creating natural pinch, ring finger supports lower curve, pinky relaxed with light contact near base. Palm cups lower handle for stability, slight wrist flexion toward camera, natural finger curves, moderate pressure causing subtle volumetric deformation on handle walls, realistic muscle tension in thenar eminence and forearm flexors, correct joint angles — no hyperextension, gravity-consistent natural droop of wrist. Brush head fully visible beyond fingers, no occlusion of bristle zone, clear bristle detail and color visible.

### BZ-7: Step 7 Composition Block (insert at start of final prompt)

When assembling the Step 7 prompt, begin with this composition block — insert verbatim BEFORE the shot type line:

> Dual-focus composition: left side occupied by [CHARACTER / text block], right side dominated by an extreme macro zoom of the [BRUSH NAME] toothbrush head at 80% visual weight. Overall mood: [INSERT FROM BZ-4 MOOD TABLE].

---

0.2 — Search product Skill
Immediately read product skill and look up the product identified in 0.1.
Search by:
Exact product name match
SKU/article number match (DE### format)
Ingredient or function match if only a category hint was given
This search runs silently. Do not announce it. Do not ask permission. Just do it.

Read it fully. Extract and summarize:
- Typography preferences
- Tone of voice and messaging rules
- Product names, hero claims, key ingredients or technologies
- Any prohibited visual or language elements (e.g. no SKU codes, no flat icons)

Present a 3–5 line extraction summary. Ask the user to confirm accuracy

## STEP 0.3 — Product Knowledge Gate ⛔ MANDATORY

After brand knowledge extraction — before Step 1 — invoke the canonical product knowledge gate:

```
[[GATE: product-knowledge]]
Mode: Gate (compact spec return)
SKU: [matched from Step 0.2 — DE105 / DE201 / etc., or product name if SKU not yet identified]
Fields needed: hero-ingredient, core-function, clinical-stat, target-condition, competitive-advantage, manufacturer-facts
Purpose: bannerizer Step 0.3 — base facts for prompt assembly
```

**Return signal branching:**
- ✅ `Product data returned` (PASS or CONDITIONAL PASS) → proceed to Step 1 using the Corrected Knowledge Block from the gate
- ⚠️ `FAIL` → output exactly one line to user: "Product data adjusted for accuracy — proceeding with verified version." Then proceed to Step 1 using the Corrected Knowledge Block
- 🔴 `Product not identified — please provide SKU or full product name` → halt the workflow, ask user: "Уточни SKU или точное название продукта — без этого я не могу гарантировать точность ингредиентов и клинических данных."
- 🔴 `Gate unavailable / no response` → halt the workflow, output: "Product knowledge gate недоступен. Не могу продолжить без верифицированных данных по ингредиентам — иначе риск фабрикации фактов о продукте."

⛔ **Do not proceed to Step 1 until a valid GATE_RESULT is received.**
⛔ **All downstream steps (headlines, prompt copy, rationale) use the Corrected Knowledge Block only — never the raw extracted data.**

---

## STEP 1 — Brand & Product Knowledge Intake

Ask for these minimum inputs before continuing:
1. Key hero claim or benefit (1 sentence)
2. Aspect ratio — default **4:3**or **3:4**

## HERO INTRIGUE LOCK

**Applies to every Hero headline generated in Step 2 and Step 7.**

The Hero main text must create **immediate curiosity**. It works as a hook — not a neutral label.

A headline passes if it triggers at least one of:
- **Intrigue** — raises a question the reader wants answered
- **Tension** — creates a sense of before/after, problem/resolution, or hidden risk
- **Novelty** — signals something unexpected, counterintuitive, or first-of-its-kind
- **Hidden discovery** — implies knowledge or a mechanism the reader doesn't yet have

**A headline fails if it:**
- Merely names the product category (e.g. "Toothpaste for sensitive teeth")
- States an obvious benefit without a hook (e.g. "Whitens in 7 days")
- Reads as a product label rather than a provocation

**Self-test before finalizing any Hero text:**
> "Would this instantly make a distracted reader look further?"
> If No — rewrite. If unsure — rewrite.

**Examples:**

| Flat / Fails | Intrigue / Passes |
|---|---|
| Probiotics for your mouth | The bacteria your dentist never told you about |
| Whitening toothpaste | Your enamel has been lying to you |
| Charcoal care formula | The ingredient that absorbs what brushing misses |
| Natural oral care | What 10,000 bacteria in your mouth actually need |

**Enforcement:** If the first Hero draft fails the self-test, generate two alternative rewrites before presenting options to the user. Never output a failing headline without alternatives alongside it.

**[WAIT for user confirmation before proceeding to Step 2]**

---

## STEP 2 — Slide Structure Selection

2.1 — Hero Headline Options 3 headlines generated, each labeled with its intrigue trigger type. Four buttons: 1️⃣ 2️⃣ 3️⃣  + 🔥 Try Harder — which discards all 3 and forces a complete rewrite, loops until one is picked.
**If user selects 🔥 Try Harder:**
Discard all previous headlines entirely — none may be reused, rephrased, or echoed in any form.

Escalate on all three axes with each round:
- **Conceptual depth** — go beneath the surface benefit; find the mechanism, the paradox, the hidden consequence
- **Unexpectedness** — avoid the first idea that comes to mind; avoid category clichés; avoid anything that sounds like it could sit on a competitor's shelf
- **Linguistic sharpness** — fewer words, more charge; every word earns its place; no filler, no softeners

**Each round follows this escalation path:**
Round 1 — Strong, product-grounded hooks
Round 2 — Conceptual provocation, assumption-challenging, problem reframing
Round 3 — Uncomfortable truths, counterintuitive angles, poetic compression
Round 4+ — Pure creative aggression. The headline that makes the team nervous.

Track round number internally. The bar only moves up. Never plateau. Never repeat a direction already explored.

2.2 — Content Preview Fires only after Hero is locked. All blocks filled with real specific text for this brief — Hero slot shows the selected headline as confirmed.
2.3 — Structure Selection 6 structure buttons as before — shown after the content preview is visible, so the user picks structure knowing exactly what content goes inside it.




**First**, generate a task-specific **CONTENT PREVIEW** — what would go inside each block
for THIS exact brief. Write the concrete intended text in bold for each block:

```
HERO:          What the headline will say, specifically (Always Bold with CAPS)
CORE MESSAGE:  What the subheadline or core claim will say
CONTEXT:       What problem/situation framing will say
TECHNOLOGY:    What the mechanism/ingredient/science block will say
BENEFITS:      What the benefit statements will say
OUTCOMES:      (If relevant) What the proof/result block will say
```

**Then**, present the available structures below as a multiple-choice list.
For each option show:
- Structure name
- Block sequence (e.g. Hero→Core→Tech→Benefits)
- 2 pros and 2 cons specific to this brief

Ask the user to select a structure by letter, and optionally specify block numbers
(e.g. "A 1+3+5"). Only selected blocks appear in the final output.

### Available Slide Structures

**A — DYSON**
Dyson-style slide structure: start with a Hero statement (2–5 words, BOLD, ALL CAPS, largest text) expressing the core idea or conflict; below it place one short context line in regular weight explaining the statement; then add a core message line (1–2 sentences, semi-bold, medium size) presenting the solution or main claim; follow with a technical block (2–3 lines, regular text with key scientific terms or numbers in bold); finish with a compact benefit list of 3–5 short items in regular weight. Composition balanced with safe margins 9% on left and right edges for UI icons and navigation.

**B — APPLE**
Apple R&D-style slide structure: start with a Hero statement (2–5 words, BOLD, ALL CAPS, largest text) expressing the central technological idea or conflict; directly below place one short context line in regular weight explaining the relevance or problem; follow with a core message sentence in semi-bold, medium size presenting the key innovation or solution; add a technical block (1–2 concise lines in regular weight with key engineering terms, mechanisms, or performance numbers in bold) describing how the system works; finish with a compact benefit list (3–5 short items in regular weight). Maintain a strict Apple-like hierarchy and clarity, using extremely short lines, large negative space, precise alignment, and minimal wording.
Composition balanced with safe margins 9% on left and right edges for UI icons and navigation.

**C — DEEPMIND**
DeepMind-style slide structure: start with a short Hero statement (2–5 words, BOLD, ALL CAPS, largest text) presenting the core scientific idea; directly below place one concise context line in regular weight explaining the problem or significance; follow with a core message sentence (semi-bold, medium size) describing the key solution or discovery; add a technology/mechanism block (2–3 lines, regular text with key scientific terms or numbers in bold) explaining how the system works; finish with a compact benefit or outcome list (3–5 short items, regular weight). Maintain a clear logical hierarchy and scientific flow, using short lines, precise terminology, and strong visual spacing.
Composition balanced with safe margins 9% on left and right edges for UI icons and navigation.

**D — COLGATE**
Colgate Total-style slide structure: start with a Hero statement (2–5 words, BOLD, ALL CAPS, largest text) expressing the main oral-health threat or prevention idea; directly below place one short context line in regular weight explaining the bacterial or biofilm-related cause; then add the core message line in semi-bold, medium size presenting the prevention-focused solution; follow with a technical block in regular text, highlighting key terms such as oral bacteria, biofilm, antibacterial protection, or whole-mouth health in bold; finish with a compact benefit list in regular weight showing 3–5 broad preventive outcomes. Maintain a clear hierarchy. The tone should feel mainstream-scientific, prevention-led, biologically grounded, clean, and accessible.
Composition balanced with safe margins 9% on left and right edges for UI icons and navigation.

**E — GSK**
GlaxoSmithKline-style slide structure: start with a Hero statement (2–5 words, BOLD, ALL CAPS, largest text) expressing the core oral-health problem or treatment principle; directly below place one short context line in regular weight explaining the biological issue; then add the core message line (semi-bold, medium size) presenting the clinically developed solution; follow with a technical block in regular text, where key active ingredients, mechanisms, or clinical numbers are in bold; finish with a compact benefit list in regular weight showing 3–5 clear patient-relevant outcomes. Composition balanced with safe margins 9% on left and right edges for UI icons and navigation.

**F — P&G**
Start with a Hero statement (2–5 words, BOLD, ALL CAPS, largest text) presenting the key cleaning or protection technology; directly below place one short context line in regular weight describing the oral care problem (plaque, acid erosion, enamel weakening); then add the core message line (semi-bold, medium size) introducing the engineered solution or cleaning system; follow with a technical block in regular text highlighting the mechanism or technology with key terms or performance numbers in bold; finish with a compact benefit list in regular weight showing 3–5 clear performance outcomes. Maintain a clean hierarchy, using clear consumer-science language where technology and measurable cleaning performance are emphasized. Composition balanced with safe margins 9% on left and right edges for UI icons and navigation.

**[WAIT for user selection before proceeding to Step 3]**

---

## STEP 2.5 — Marketolog Gate (Optional Hero Validation) ⚙️

After the user has selected slide structure but **before** Step 3 (Hero Product Render Decision), if a draft Hero headline already exists from earlier brainstorming or HERO INTRIGUE LOCK self-test, run an optional external marketolog validation:

```
[[GATE: marketolog]]
Check type: VALIDATE
Draft: [Hero headline + subhead, verbatim]
Context: bannerizer Step 2.5 — banner hero copy validation
Audience: [marketplace buyer / B2B viewer / retail shopper from Step 1 brief]
SKU: [from Step 0.3]
```

**Return signal branching:**
- ✅ `MARKETOLOG GATE: PASSES` → proceed to Step 3 with current headline
- ⚠️ `MARKETOLOG GATE: WEAK` → apply marketolog's sharper variant, then proceed
- ❌ `MARKETOLOG GATE: FAILS` → regenerate headline using HERO INTRIGUE LOCK rules, re-run Step 2.5

**When to skip Step 2.5:**
- No draft headline exists yet (will be generated in Step 7) → final conversion check at FINAL STEP catches everything
- Single hero word only (e.g. "ВНИМАНИЕ") — too short for marketolog framework
- User explicitly says "skip marketolog" or "no validation"

This step is a **safety net**, not a hard gate. The mandatory final conversion check (FINAL STEP) is the universal filter that nothing escapes.

---

## STEP 3 — Hero Product Render Decision

Ask the user exactly this:

> "Do you want hero product(s) included as the dominant render?
> Reply with percentage (e.g. 75) and count (1–3) for Yes, or No/skip for No."

**Default if no reply:** 75% width, 1 product.

If Yes:
Insert the following line exactly as written:

Hero product(s) = exact user-uploaded photo(s). Ultra-photorealistic, agency-level, zero geometry/label/color/proportion changes. Perfect fidelity on gloss, cap reflections, material texture, label clarity. Seamless micro-shadows and ground reflections.

⚠️ NEVER ask user to upload. Insert verbatim only.


**If No / no upload:**
- Increase central 3D visualization to dominant size (~85–90% width)
- No standalone product renders generated
- Central visualization carries the full narrative
- Slightly expand left text area for compositional balance
- Central visual may feature macro/micro anatomy relevant to the product category
  rendered in a scientific, cinematic style consistent with biotech or advanced
  clinical presentation visuals

[WAIT for reply before proceeding to Step 4]

##STEP 4 — Character Decision
Ask the user exactly this:

"Do we include character(s)? Reply with a number (e.g. 1, 2, 3) or No."

If the user replies No / skips: proceed without character.
If the user replies with a number — AUTO-INSERT RULE:
⚠️ NEVER ask any follow-up questions about the character (age, gender, appearance, style, etc.).
⚠️ NEVER ask user to upload photos.
⚠️ NEVER summarize, shorten, or paraphrase the CHARACTER block below.
Replace [number] with the user's number and insert the full block EXACTLY as written — copy-paste only, zero modifications:

Character(s) = [number] reference close-up headshot (or half-body) shot(s) uploaded by user — exact facial features preserved: identical structure, eye shape / color / asymmetry / iris pattern / sclera tone / crease structure / interpupillary distance, nose contour / deviation, lip form with duchenne smile, eyebrow arch / thickness, hairline / parting, skin tone + all imperfections (freckles, fine lines), cheekbones, jawline, neck/shoulders. Integrate naturally into continuous ultra-photoreal scene with perfect perspective, DOF, grain, occlusion, contact shadows, no copy-paste feeling or cutout edges. Facial expression free to change, ensuring every edit fully matches and blends with the entire scene context.
CHARACTER OUTFIT — Outfit and styling must always match the scene context. If the scene setting implies a specific dress code (spa, beach, sport, clinical, etc.), character clothing must reflect that environment exactly — never default to neutral everyday clothing. AI must adapt wardrobe to scene, not scene to wardrobe. Outfit must feel native — never transplanted.
CHARACTER CROP — head-to-chest maximum, never full body. Crop optimized per layout: tight enough for expression, wide enough for GRIP LOCK to read naturally.

Specify natural actions explicitly (e.g. Character 1 observing/pointing at main 3D visualization, Character 2 discussing with Character 1, Character 3 holding/examining product element). Place characters interacting naturally in a logical real-life scene; allow natural interaction with main 3D visualizations (observing, picking, touching, pinching, pointing at, surrounded by molecular/tech elements). Use strong bokeh background for depth and focus when it enhances the scene.*

**If the user replies No / skips:** proceed without character.

**GRIP LOCK RULE — DEFAULT ON:**
Whenever a character and the hero product appear in the same scene, **Grip Lock fires automatically.** No detection needed — if there is a character and a product, the character is holding it. This is the default.

The only exception: user explicitly uses one of these opt-out signals — **"separate", "отдельно", "независимо", "product standing", "продукт стоит", "product floating separately", "product on shelf", "character not holding it"** — or any clear equivalent. In that case — and only that case — skip Grip Lock.

Identify the product type present in the scene and append the matching grip block below verbatim. No summarization. No shortening.

### Grip Lock Blocks

**Toothbrush only:**
Referenced product(s) must 100% match reference(s): exact branding / logos / colors / texts / shape / proportions / reflections / textures. Toothbrush length is exactly 17 cm. The referenced person has a Duchene smile, holding the referenced toothbrush fully visible without covering face or obstructing smile, toothbrush positioned laterally ~12–13 cm from lips. She/He holds the toothbrush in exact precision grip of the upper part of the toothbrush handle: thumb pad firmly presses top of handle ~2–3 cm from head (near neck), index finger extends straight along top for primary control, middle finger curls strongly underneath providing main support and opposition, ring finger wraps around mid-lower handle with moderate pressure, pinky relaxed/light touch near tail. Handle gripped ~4–5 cm from bristle tips, palm facing slightly upward, wrist neutral, fingers show natural flexion curves, realistic muscle tension, correct joint angles (MCP/PIP/DIP), light-moderate pressure, no hyperextension or strain, gravity-consistent droop. Tail (rounded base) fully visible beyond pinky/ring fingers.

Toothbrush + Toothpaste Tube:
Referenced product(s) must 100% match reference(s): exact branding / logos / colors / texts / shape / proportions / reflections / textures. Toothbrush length is exactly 17 cm. The referenced person has a Duchene smile, holding the referenced toothbrush fully visible without covering face or obstructing smile, toothbrush positioned laterally ~12–13 cm from lips. Right hand precision grip: thumb pad and index finger press top/side near neck for control, middle finger supports underneath, ring/pinky relaxed/light contact, natural curl, light pressure, correct joints/tension/gravity, no distortion; bristles fully visible facing viewer with close detailed focus on head, bristle arrangement, paste texture, exact positioning. Left hand holds a 15.5 cm toothpaste tube in exact realistic grip matching reference: thumb pad presses firmly on mid-body near cap for controlled expulsion, index and middle fingers wrap partially around tube opposite thumb creating pinch/squeeze, ring finger supports lower curve, pinky relaxed / light contact near base. Palm cups bottom for stability, slight wrist flexion, natural finger curves, moderate pressure causing localized volumetric deformation (tube walls indent inward), realistic muscle tension in thenar eminence and forearm flexors, correct joint angles (no hyperextension), gravity-consistent droop. Tail/base fully visible beyond pinky/ring fingers, no occlusion, clear edge and color transition.

Toothpaste Tube only:
Referenced product(s) must 100% match reference(s): exact branding / logos / colors / texts / shape / proportions / reflections / textures. Referenced toothpaste tube length is exactly 15 cm. The referenced person has a Duchene smile, holding the referenced 15.5 cm toothpaste tube in exact realistic grip matching reference: thumb pad presses firmly on mid-body near cap for controlled expulsion, index and middle fingers wrap partially around tube opposite thumb creating pinch/squeeze, ring finger supports lower curve, pinky relaxed / light contact near base. Palm cups bottom for stability, slight wrist flexion, natural finger curves, moderate pressure causing localized volumetric deformation (tube walls indent inward), realistic muscle tension in thenar eminence and forearm flexors, correct joint angles (no hyperextension), gravity-consistent droop. Tail/base fully visible beyond pinky/ring fingers, no occlusion, clear edge and color transition.

**[WAIT for user reply before proceeding to Step 5]**

---



STEP 5 — Central 3D / Technological Visual

⚠️ **If BRUSH ZOOM MODULE is active:** Skip the visual families below. Use BZ-3 (Brush-Specific 3D Visual Options) instead. Present BZ-3 options to the user as clickable buttons and wait for selection.

For all other products — select the most appropriate visual family (or combination) for the product category and chosen slide structure from the families listed below.

Regardless of which visual family is selected, the central visualization must always follow these integration rules:
Occupies 60–70% of background canvas behind character and product
NOT a bubble, NOT a frame, NOT a schematic insert, NOT a floating object
Seamless full-bleed background layer — no borders, no circles, no containers
Depth of field creates natural bokeh fade at edges, blending organically with dark background
Lit independently with cooler temperature to create separation from warm foreground
Opacity and blur calibrated so visualization is clearly readable but never competes with hero product, character, or typography
The visualization breathes freely behind the entire scene

The central 3D visual must be:

Photorealistic, clinical or scientific in tone
High complexity — not decorative or abstract
Placed behind, beside, or subtly around the product and character
~75% width when product and/or character is present; larger when both are absent

Multiple visual families may be combined when it strengthens the narrative.
Document your visual family selection in Step 7 rationale notes.

Allowed Visual Families (Universal for all Oral-Care Products):

A. Molecular & Biochemical Structures (ONLY FOR TOOTHPASTES & LIQUIDS)

A1. Molecular Clusters & Architectures

Polymeric Structures: Visualizing the scaffolding and network formed by long-chain molecules within the product matrix or on the tooth surface.
Micellar Envelopes: Showing the spherical arrangement of surfactant or lipid molecules that encapsulate and solubilize impurities or active compounds.
Crystalline Lattices: Illustrating the ordered, repeating structure of mineral components or drug delivery systems, often featuring sharp, geometric precision.

A2. Enzymes / Peptides / Polyphenols: Catalytic & Protective Mechanisms

Dextranase Action: Polysaccharide-Cleaving Arcs — dynamic visuals of the enzyme's active site docking onto and hydrolyzing glucan chains that form the backbone of the plaque biofilm matrix.
Invertase Function: Sucrose-Splitting Micro-Reaction Chains — representation of the enzyme catalyzing the rapid breakdown of dietary sucrose into less harmful monosaccharides.
GOX (Glucose Oxidase) System: Hydrogen-Peroxide Micro-Generation Nodes and Antimicrobial Gradient Halos.
Papain Activity: Proteolytic Softening Pathways Targeting Protein Debris Layers.
Bromelain Mechanism: Protease Lattices Fragmenting Organic Deposits.
Lysozyme Action: Peptidoglycan-Disrupting Vectors Breaking Bacterial Cell-Wall Structures.

A3. Bioactive Organic Systems
Broader category for natural extracts and compounds whose activity is best visualized as a system or complex interaction.
A4. Microbiome Lattices & Probiotic Interactions

Bacillus Coagulans: Spore-Forming Probiotic Spheres, Microbiome-Balancing Nodes, and Pathogen-Downregulation Lattice.
Antimicrobial / Probiotic Interactions: Dynamic graphics illustrating complex interplay where probiotics out-compete harmful bacteria for binding sites.

A5. Ion-Exchange or Remineralization Schematics

Recaldent (CPP-ACP) System: Casein-Phosphopeptide Nanocomplexes, Amorphous Calcium-Phosphate Delivery Nodes, and Enamel-Binding Remineralization Halos.
pH-Modulating Networks: Schematic representations of buffering agents dynamically neutralizing acid challenges in plaque and saliva.

B. Phytochemical & Natural Compound Structures (Universal for All Oral-Care Products)

Clove (Eugenol): Amber Phenolic Rings, Antimicrobial Binding Sites.
Cinnamon (Cinnamaldehyde): Elongated Aldehyde Chains, Anti-Biofilm Suppression Lines.
Hemp Seed Oil: Omega Lipid Arcs, Green–Gold Membrane Hydration Halos.
Coconut Oil (Lauric Acid Focus): Micelle Clusters, Soft-White Antimicrobial Lipid Spheres.
Ginger Extract (Gingerol/Shogaol): Angular Phenolic Lattices, Anti-Inflammatory Downregulation Arcs.
Activated Charcoal (Coconut-Shell Derived): Ultra-Porous Micro-Honeycomb Lattice, High-Surface Adsorption Zones.


## STEP 6 — Palette Selection

Present the user with **four professionally curated color palette options**, each with:
- A palette name
- 5–7 hex values with role labels (background, typography, accent 1, accent 2, etc.)
- 1-line mood/tone description

If brand colors were extracted in Step 1, build **Palette A** around those brand colors.
Build the remaining three as complementary professional alternatives suited to the
product category and message tone.

Ask the user to select one by name or number.

**Default if no selection:** use extracted brand colors, or clean clinical white +
graphite + one accent if no brand file was provided.

**[WAIT for palette selection before proceeding to Step 7]**

---

## STEP 7 — Final Prompt Generation

Generate the final output in two parts:

### PART A — THE PROMPT

A single continuous image generation prompt. Must always begin with:

> **"Create an Ultra-photorealistic marketing banner, 4:3 as..."**

Follow these rules:

- Written in English regardless of banner text language
- Only copy marked as **TEXT ON BANNER** appears as visible slide text —
  never expose block labels (Hero, Core, Benefits, etc.) as rendered text
- No SKU numbers or alphanumeric product codes on-slide
- No flat line-icons (microscope, shield, feather, gear, hand, etc.) — strictly prohibited
- All visual markers = advanced scientific schematics, anatomical cutaways,
  or biotech-style information bubbles — never simplified pictograms
- Banner text language = language requested by user (or detected from brief)
- All instructions are English-only and must never appear visually in the render

Structure the prompt in this sequence:
0. **[If BRUSH ZOOM MODULE active]** Insert BZ-7 Composition Block verbatim as the very first line
1. Shot type + overall composition
2. Hero product description (if included)
3. Central 3D / technological visual description
4. Character description (if included) + grip lock (if applicable)
5. Lighting, shadows, depth of field
6. Color palette + material finishes
7. Typography + TEXT ON BANNER (verbatim final copy only)
8. Technical render quality descriptors

### PART B — RATIONALE NOTES

After the prompt, add a section titled **— Rationale Notes —**

For each major creative decision write 1–2 sentences explaining:
- Why this slide structure was chosen for this brief
- Why this visual family / central 3D element was selected
- Why the palette fits the brand and message
- Any notable trade-offs (e.g. no character = stronger central visual)
- Any brand guideline rules that shaped specific wording or visual choices

Rationale notes are for the user's understanding only and do not appear in the prompt.

---

## FINAL STEP — CONVERSION CHECK (benefit-gate Mode B) ⛔ MANDATORY BEFORE OUTPUT

Before the final banner prompt + rationale leaves bannerizer, the TEXT ON BANNER copy MUST pass `[[GATE: benefit-gate]]` in **Check type: CONVERSION** mode. Visual elements are evaluated by the user visually — but the on-banner copy (headline, subhead, CTA) decides whether the banner drives a sale or just looks nice.

### What to submit to the gate

Only the rendered-text content of the banner — NOT the full image-generation prompt. The gate checks words that will appear on screen to the viewer.

### Invocation
```
[[GATE: benefit-gate]]
Check type: CONVERSION
Draft: [headline + subhead + CTA + any other on-banner copy, verbatim]
Offer type: [banner copy — product promotion / category awareness / promotional / retention]
Audience: [from the brief — ozon buyer / wb buyer / retail shopper / B2B viewer]
Desired action: [click / add-to-cart / learn-more / buy — the one outcome this banner must drive]
```

### Return signal branching

- ✅ `CONVERSION PASS` → ship the prompt + rationale
- ⚠️ `CONVERSION WEAK` → apply the top rewrite from gate output to the TEXT ON BANNER block in the prompt, then ship
- 🔴 `CONVERSION FAIL` → rewrite the on-banner copy, re-run gate, do not output until PASS or WEAK

### CTA urgency rule (fails the gate without it)

All banner CTAs must include urgency or limitation ("сегодня", "сейчас", "успейте купить", "до конца недели", "пока есть в наличии"). A CTA without urgency triggers ⚠️ WEAK minimum on Q3 (one clear CTA) / Q4 (removes friction).

---

## Global Rules (enforced throughout all steps)

| Rule | Description |
|---|---|
| Opening Rule | Every prompt must begin with "Create an Ultra-photorealistic marketing banner, 4:3 as..." |
| SKU Rule | Never include SKU numbers or alphanumeric product codes anywhere on-slide |
| Icon Rule | No flat line-icons. All informational icons = scientific schematics or biotech bubbles |
| Text Rule | Only TEXT ON BANNER copy appears visually. All other text = invisible instruction |
| Grip Rule | Character + product in scene = Grip Lock fires automatically by default. Skip ONLY if user explicitly states no contact. Match product type and append verbatim. |
| Language Rule| Prompt instructions in English; banner text in user's requested language |
| Fidelity Rule | Never alter product geometry, label layout, colors, or proportions |
| Ratio Default| 4:3 unless user specifies otherwise || Upload Request Rule | NEVER ask user to upload hero product or character photos. Insert verbatim blocks only. |
| Verbatim Rule | CHARACTER block and GRIP LOCK must always be inserted in full — no summarizing, no shortening, ever. |
---

**Version:** 1.5
**Gate integrations:** product-knowledge (Step 0.3, mandatory), marketolog (Step 2.5, optional validation), benefit-gate (FINAL STEP, mandatory CONVERSION mode)
**Return signals expected:**
- product-knowledge: product data / `Product not identified` / Gate unavailable
- marketolog: `✅ PASSES / ⚠️ WEAK / ❌ FAILS`
- benefit-gate (conversion): `✅ CONVERSION PASS / ⚠️ CONVERSION WEAK / 🔴 CONVERSION FAIL`
**Embedded modules:** brush-zoom (auto-activates on toothbrush detection — BZ-1 through BZ-7)
**Verbatim blocks (never paraphrase, never summarize):**
- CHARACTER REFERENCE block (Hard Rule #19)
- PRODUCT REFERENCE block (Hard Rule #20)
- GRIP LOCK block (matched per product type)
- BZ-7 Composition Block (when brush-zoom active)
- Hero product fidelity line
**Owner:** Aram Badalyan
**Brand scope:** Das Experten + adaptable to any brand via uploaded brand guidelines
**Changelog:**
- 1.5 — Replaced legacy `[[GATE: product → Product Knowledge Gate]]` with canonical `[[GATE: product-knowledge]]`; added full return signal branching including halt-on-not-identified and gate-unavailable; added Step 2.5 optional marketolog gate as hero validation safety net; replaced silent brush-zoom activation with explicit status line; added mixed-product banner rule (brush + paste hierarchy logic); added versioned footer with explicit gate integrations and verbatim block registry
- 1.4 — Brush-zoom module embedded directly into bannerizer; no separate brush-zoom skill needed
- 1.3 — Final Conversion Check (benefit-gate Mode B) added as mandatory pre-output filter; CTA urgency rule formalized
- 1.2 — CHARACTER + PRODUCT REFERENCE verbatim rules locked (no upload requests, no paraphrasing); Grip Lock rules per product type
- 1.1 — Hero Intrigue Lock self-test framework added (Intrigue / Tension / Novelty / Hidden Discovery)
- 1.0 — Initial 7-step bannerizer with brand intake, slide structure (DYSON/APPLE/DEEPMIND/GSK/P&G), palette, prompt assembly
