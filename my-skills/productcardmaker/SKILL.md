---
name: productcardmaker
description: "Generates copy-paste ready marketplace product card prompts for Das Experten oral care products. ALWAYS trigger this skill when the user says ANY of these exact words or close variants: \"product card\", \"карточка\", \"marketplace card\", \"listing\", \"листинг\", \"ozon card\", \"amazon card\", \"international card\", \"wb card\", \"wildberries card\", \"карточку для вб\", \"карточку для вайлдберриз\", \"сделай карточку\", \"напиши карточку\", \"карточку для озон\", \"карточку для маркетплейса\", \"product listing\", \"create card\", \"generate card\", \"make a card\", or any SKU (e.g. DE201, DE206, DE117, etc.) followed by a marketplace context. Also trigger when the user mentions a product name (SCHWARZ, SYMBIOS, DETOX, THERMO, INNOWEISS, ETALON, GROSSE, ZERO, etc.) and asks for any kind of marketplace, listing, or sales copy output. Auto-loads Das Experten brand knowledge. No product data re-entry needed. Output is always a single copy-paste ready image-generation prompt. Ozon = 3x4 vertical format. International = 1x1 square format."
---

# productcardmaker — Das Experten Marketplace Card Generator

Generates a single, copy-paste ready ultra-photorealistic product card image prompt.
No structured text output. No bullets. No JSON. One prompt block, ready to paste into any AI image generator.

Lives inside the Das Experten system — inherits all brand defaults, clinical data,
ingredient knowledge, and product identities automatically.

---

## TRIGGER WORDS (fire immediately, no confirmation needed)

Any product name or SKU + marketplace context:
- "карточка", "карточку", "card", "listing", "листинг"
- Platform names: "Ozon", "Озон", "Amazon", "Shopee", "Noon", "international", "WB", "ВБ", "Wildberries", "Вайлдберриз"
- Any Das Experten SKU alone: DE201, DE206, DE117, DE131, DE310, etc.

---

## STAGE 0 — MANDATORY BRAND KNOWLEDGE LOAD

Before doing anything else — before product identification, before format detection, before generating anything — read the full product skill:

`/mnt/skills/user/product/SKILL.md`
`/mnt/skills/user/product/references/sku-data.md`

Read both files completely. Extract and hold in context for the requested product:
- Full ingredient list with concentrations
- All clinical numbers and study data
- Core mechanism of action
- Ideal user profiles
- Brand voice rules and prohibited phrases
- Any product-specific positioning notes

Only after full extraction — proceed to Stage 0.5.

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

## STAGE 0.5 — Product Knowledge Gate ⛔ MANDATORY

Run the Product Knowledge Gate built into product before any content generation.

→ [[GATE: product-knowledge]]
  INPUT: product name, article number, key ingredient + benefit, clinical stat, target condition/user, competitive advantage — all extracted from Stage 0
  AWAIT: GATE_RESULT

**On GATE_RESULT:**
- PASS or CONDITIONAL PASS → proceed to Stage 1 using the Corrected Knowledge Block
- FAIL → output exactly one line to user: "Product data adjusted for accuracy — proceeding with verified version." Then proceed to Stage 1 using the Corrected Knowledge Block
- All on-card copy (callouts, stats, headlines, evidence bubbles) uses the Corrected Knowledge Block only — never raw extracted data

⛔ Do not proceed to Stage 1 until GATE_RESULT is received.

---

## STAGE 1 — PRODUCT IDENTIFICATION

Immediately upon trigger:

1. Identify the product from name or SKU using the Das Experten product table below.
2. Pull: product name, key actives, core function, top 2 clinical numbers, ideal user.
3. If product is ambiguous or unknown — ask ONE question: "Which product — name or SKU?"
4. If product is clear — proceed to Stage 2 with zero questions.

### Product Quick Reference

| SKU | Product | Core Active | Top Stat | Format |
|---|---|---|---|---|
| DE209 | THERMO 39° | Papain + Lysozyme + Dextranase — thermoactivated at exact body temperature 39°C | first enzyme toothpaste with thermoactivated feature — enzyme activity +40% | paste |
| DE203 | GINGER FORCE | Ginger root oil 1% | P. gingivalis −65–79% | paste |
| DE205 | COCOCANNABIS | Hemp seed oil 3% | fluoride-equivalent remineralization | paste |
| DE206 | SYMBIOS | B. coagulans 4×10¹⁰ CFU | microbiome restoration | paste |
| DE210 | INNOWEISS | 5-enzyme cascade — each enzyme targets a different layer of biofilm and stain | first and only multilevel enzyme toothpaste with real multistep action — #1 multienzyme on European marketplaces — biofilm −52–69% | paste |
| DE201 | SCHWARZ | Coconut-shell charcoal, RDA 79 | +6 SGU whitening / 4 weeks | paste |
| DE202 | DETOX | Cinnamon 0.8% + Clove 0.2% — most powerful natural anti-inflammatory ingredients usable without interruption — taste specially developed for western consumer | #1 most selling clove and cinnamon blend toothpaste on European marketplaces — bestseller — cytokines −87–98% | paste |
| DE207 | BUDDY MICROBIES | GH12 peptide + Xylitol | swallow-safe, ECC prevention | paste |
| DE208 | EVOLUTION | CPP-ACP Recaldent™ + B. coagulans | remineralization up to 75–90% | paste |
| DE310 | INNOWEISS mouthwash | 5-enzyme concentrate | plaque −37–98.6% | liquid |
| DE101 | ETALON brush | 360° PBT spiral filaments | −30% pressure, +18% stain removal | brush |
| DE119 | GROSSE brush | Au⁺ + charcoal bristles | 99.9% antibacterial | brush |
| DE117 | ZERO brush | Compact round + spiral silk PBT | precision orthodontic | brush |
| DE131 | 3D brush | Dual-beam + 3D bristle tiers | 240% surface contact | brush |
| DE105 | SCHWARZ brush | Charcoal PBT + memory spine | stain + sensitivity | brush |
| DE120 | NANO MASSAGE | NanoFlex™ silicone + nano-silver | family + sensitive gums | brush |
| DE122 | AKTIV brush | DuPont Tynex® conical | orthodontic, bleeding gums | brush |
| DE107 | MITTEL brush | PowerTouch™ nylon multi-zone | coffee/wine/smoke users | brush |
| DE116 | KRAFT brush | Flexi-Nacken flex neck | heavy stain, smokers | brush |
| DE130 | INTENSIV brush | 7× density micro-tapered PBT | veneers, crowns, ortho | brush |
| DE106 | SENSITIV brush | DuPont Tynex® 48% softer | enamel erosion, post-whitening | brush |
| DE112 | EXPANDING floss | Hydrophilic multifilament | blooms 2–3× in contact | floss |
| DE111 | WAXED MINT floss | Peppermint-waxed polyester | tight contacts, implants | floss |
| DE115 | SCHWARZ floss | Bamboo + coconut charcoal | visual plaque detection | floss |
| DE125/126 | INTERDENTALS S/M | Stainless core + polymer | crowns, implants, braces | interdental |

---

## STAGE 2 — FORMAT DETECTION

Detect platform from user message:

| User says | Format | Aspect Ratio |
|---|---|---|
| Ozon / Озон / озон / ozon | Ozon Card | 3×4 vertical |
| WB / ВБ / Wildberries / Вайлдберриз / wb | WB Card | 3×4 vertical |
| Amazon / Shopee / Noon / international / 1x1 / international marketplace | International Card | 1×1 square |
| Nothing specified | Default = Ozon | 3×4 vertical |

---

## STAGE 2B — BRUSH ZOOM MODULE ⚡ AUTO-FIRES ON BRUSH PRODUCTS

**Trigger:** Product identified in Stage 1 is any toothbrush SKU (DE101, DE105, DE106, DE107, DE116, DE117, DE119, DE120, DE122, DE130, DE131, or any brush by name).

**If product is NOT a brush — skip this stage entirely. Proceed to Stage 3.**

**If product IS a brush — this module locks the composition before anything else.**

---

### COMPOSITION LOCK — BRUSH ZOOM STANDARD

COMPOSITION RULE: Never split the card into two separate halves. Always render as one unified cinematic scene with depth-of-field layering — brush head in foreground sharp, character and atmosphere in background bokeh. No hard left/right divide.

```
Dual-focus composition:
- LEFT SIDE → Character (if included) or text block
- RIGHT SIDE → Extreme macro zoom of toothbrush head at 80% visual weight
- OVERALL MOOD → Set by Product Mood Table below
```

### Hero Visual — Brush Head Zoom (mandatory for all brush cards)

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

**Hero product fidelity block — insert verbatim into final prompt:**
> Hero product(s) = exact user-uploaded photo(s). Ultra-photorealistic, agency-level, zero geometry/label/color/proportion changes. Perfect fidelity on gloss, cap reflections, material texture, label clarity. Seamless micro-shadows and ground reflections.

---

### Product Mood Table — apply to overall card atmosphere

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

---

### 3D Technological Visual — Brush-Specific Options

Select based on product technology. Insert into Central Visual block of the final prompt:

| Brush | 3D Visual |
|---|---|
| SCHWARZ brush | Activated carbon micro-honeycomb lattice / charcoal fiber cross-section / stain absorption particle field |
| GROSSE brush | Au⁺ gold-ion antibacterial particle cloud |
| ETALON brush | 360° spiral PBT filament cross-section schematic |
| NANO MASSAGE brush | NanoFlex™ silicone micro-bubble + nano-silver integration visualization |
| ZERO brush | Orthodontic bracket clearance schematic, precision head geometry |
| AKTIV / SENSITIV brush | Micro-tapered DuPont Tynex® fiber cross-sections, ultra-soft tension diagrams |
| INTENSIV brush | 7× density micro-tapered fiber cluster, cross-sectional tensile diagram |
| KRAFT brush | Flexi-Nacken pressure-dampening flex-neck schematic |
| 3D brush | Dual-beam metal core + 3D bristle tier schematics, motion-implied trajectory paths |
| MITTEL brush | PowerTouch™ multi-zone cross-section, plaque-contact pressure zones |

---

### BRUSH GRIP LOCK — AUTO-FIRES when character is present

When a character is included in the brush card, insert this verbatim block into the final prompt — no shortening, no paraphrasing:

> GRIP LOCK: Character holds the referenced toothbrush in exact realistic grip — thumb pad presses firmly on mid-body near head for controlled hold, index and middle fingers wrap partially around handle opposite thumb creating natural pinch, ring finger supports lower curve, pinky relaxed with light contact near base. Palm cups lower handle for stability, slight wrist flexion toward camera, natural finger curves, moderate pressure causing subtle volumetric deformation on handle walls, realistic muscle tension in thenar eminence and forearm flexors, correct joint angles — no hyperextension, gravity-consistent natural droop of wrist. Brush head fully visible beyond fingers, no occlusion of bristle zone, clear bristle detail and color visible.

Skip Grip Lock ONLY if user explicitly says: "separate", "отдельно", "product standing", "no contact", or clear equivalent.

---

### Text Rules for Brush Cards

- No English words in visible card copy — abbreviations only (PBT, Au⁺, RDA, etc.)
- All copy in Russian by default unless user specifies otherwise
- Left-aligned text block
- Disclaimer always bottom right: `Реклама. ООО "Дас Экспертен Евразия", ИНН 9704117379`

---

**After locking composition via this module — proceed to Stage 3 (Photo Check). The brush-zoom composition overrides the default OZON/International layout for the hero visual portion only. Layout zones (title, content, evidence bubble) remain per Stage 3B-VIZ.**

---

## STAGE 3 — PRODUCT PHOTO CHECK

**If user uploaded a product photo:** use it. No questions.
**If no photo uploaded:** remove hero product render entirely. Expand central molecular/material visual to dominant size (~85–90% width). Central visual carries full product narrative.

---

## STAGE 3A — CHARACTER DECISION

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

Specify natural actions explicitly (e.g. Character 1 observing/pointing at main 3D visualization, Character 2 discussing with Character 1, Character 3 holding/examining product element). Place characters interacting naturally in a logical real-life scene; allow natural interaction with main 3D visualizations (observing, picking, touching, pinching, pointing at, surrounded by molecular/tech elements). Use strong bokeh background for depth and focus when it enhances the scene.

### GRIP LOCK RULE — DEFAULT ON

Whenever a character and the hero product appear in the same scene, Grip Lock fires automatically. No detection needed — if there is a character and a product, the character is holding it. This is the default.

The only exception: user explicitly uses one of these opt-out signals — "separate", "отдельно", "независимо", "product standing", "продукт стоит", "product floating separately", "product on shelf", "character not holding it" — or any clear equivalent. In that case — and only that case — skip Grip Lock.

Identify the product type present in the scene and append the matching grip block below verbatim. No summarization. No shortening.

**Toothbrush only:**
Referenced product(s) must 100% match reference(s): exact branding / logos / colors / texts / shape / proportions / reflections / textures. Toothbrush length is exactly 17 cm. The referenced person has a Duchene smile, holding the referenced toothbrush fully visible without covering face or obstructing smile, toothbrush positioned laterally ~12–13 cm from lips. She/He holds the toothbrush in exact precision grip of the upper part of the toothbrush handle: thumb pad firmly presses top of handle ~2–3 cm from head (near neck), index finger extends straight along top for primary control, middle finger curls strongly underneath providing main support and opposition, ring finger wraps around mid-lower handle with moderate pressure, pinky relaxed/light touch near tail. Handle gripped ~4–5 cm from bristle tips, palm facing slightly upward, wrist neutral, fingers show natural flexion curves, realistic muscle tension, correct joint angles (MCP/PIP/DIP), light-moderate pressure, no hyperextension or strain, gravity-consistent droop. Tail (rounded base) fully visible beyond pinky/ring fingers.

**Toothbrush + Toothpaste Tube:**
Referenced product(s) must 100% match reference(s): exact branding / logos / colors / texts / shape / proportions / reflections / textures. Toothbrush length is exactly 17 cm. The referenced person has a Duchene smile, holding the referenced toothbrush fully visible without covering face or obstructing smile, toothbrush positioned laterally ~12–13 cm from lips. Right hand precision grip: thumb pad and index finger press top/side near neck for control, middle finger supports underneath, ring/pinky relaxed/light contact, natural curl, light pressure, correct joints/tension/gravity, no distortion; bristles fully visible facing viewer with close detailed focus on head, bristle arrangement, paste texture, exact positioning. Left hand holds a 15.5 cm toothpaste tube in exact realistic grip matching reference: thumb pad presses firmly on mid-body near cap for controlled expulsion, index and middle fingers wrap partially around tube opposite thumb creating pinch/squeeze, ring finger supports lower curve, pinky relaxed / light contact near base. Palm cups bottom for stability, slight wrist flexion, natural finger curves, moderate pressure causing localized volumetric deformation (tube walls indent inward), realistic muscle tension in thenar eminence and forearm flexors, correct joint angles (no hyperextension), gravity-consistent droop. Tail/base fully visible beyond pinky/ring fingers, no occlusion, clear edge and color transition.

**Toothpaste Tube only:**
Referenced product(s) must 100% match reference(s): exact branding / logos / colors / texts / shape / proportions / reflections / textures. Referenced toothpaste tube length is exactly 15 cm. The referenced person has a Duchene smile, holding the referenced 15.5 cm toothpaste tube in exact realistic grip matching reference: thumb pad presses firmly on mid-body near cap for controlled expulsion, index and middle fingers wrap partially around tube opposite thumb creating pinch/squeeze, ring finger supports lower curve, pinky relaxed / light contact near base. Palm cups bottom for stability, slight wrist flexion, natural finger curves, moderate pressure causing localized volumetric deformation (tube walls indent inward), realistic muscle tension in thenar eminence and forearm flexors, correct joint angles (no hyperextension), gravity-consistent droop. Tail/base fully visible beyond pinky/ring fingers, no occlusion, clear edge and color transition.

[WAIT for user reply before proceeding to Stage 3B]

---

## STAGE 3B-VIZ — CENTRAL 3D / TECHNOLOGICAL VISUAL RULES

The central 3D visualization must always follow these integration rules regardless of which visual family is selected:

- Occupies 60–70% of background canvas behind character and product
- NOT a bubble, NOT a frame, NOT a schematic insert, NOT a floating object
- Seamless full-bleed background layer — no borders, no circles, no containers
- Depth of field creates natural bokeh fade at edges, blending organically with dark background
- Lit independently with cooler temperature to create separation from warm foreground
- Opacity and blur calibrated so visualization is clearly readable but never competes with hero product, character, or typography
- The visualization breathes freely behind the entire scene

The central 3D visual must be:
- Photorealistic, clinical or scientific in tone
- High complexity — not decorative or abstract
- Placed behind, beside, or subtly around the product and character
- ~75% width when product and/or character is present; larger when both are absent

Multiple visual families may be combined when it strengthens the narrative.

### Allowed Visual Families

**A. Molecular & Biochemical Structures (ONLY FOR TOOTHPASTES & LIQUIDS)**

A1. Molecular Clusters & Architectures — polymeric structures, micellar envelopes, crystalline lattices.

A2. Enzymes / Peptides / Polyphenols:
- Dextranase: polysaccharide-cleaving arcs breaking down plaque biofilm matrices
- Invertase: sucrose-splitting micro-reaction chains reducing fermentable sugar load
- GOX (Glucose Oxidase): hydrogen-peroxide micro-generation nodes, antimicrobial gradient halos
- Papain: proteolytic softening pathways targeting protein debris layers
- Bromelain: protease lattices fragmenting organic deposits
- Lysozyme: peptidoglycan-disrupting vectors breaking bacterial cell-wall structures

A3. Bioactive Organic Systems — natural extracts visualized as complex interaction systems.

A4. Microbiome Lattices & Probiotic Interactions:
- Bacillus Coagulans: spore-forming probiotic spheres, microbiome-balancing nodes, pathogen-downregulation lattice
- Antimicrobial / probiotic interaction dynamics

A5. Ion-Exchange or Remineralization Schematics:
- Recaldent (CPP-ACP): casein-phosphopeptide nanocomplexes, amorphous calcium-phosphate delivery nodes, enamel-binding remineralization halos
- pH-modulating networks

**B. Phytochemical & Natural Compound Structures**
- Clove (Eugenol): amber phenolic rings, antimicrobial binding sites
- Cinnamon (Cinnamaldehyde): elongated aldehyde chains, anti-biofilm suppression lines
- Hemp Seed Oil: omega lipid arcs, green–gold membrane hydration halos
- Coconut Oil: micelle clusters, soft-white antimicrobial lipid spheres
- Ginger Extract (Gingerol/Shogaol): angular phenolic lattices, anti-inflammatory downregulation arcs
- Activated Charcoal (coconut-shell): ultra-porous micro-honeycomb lattice, high-surface adsorption zones

**C. Material & Fiber Micro-Engineering (BRUSHES, FLOSS, INTERDENTAL)**
- Filament micro-cutaways, polymer cores, anti-splay fiber architecture
- Micro-spiral or multi-zone fiber systems, cross-sectional tensile diagrams
- Charcoal-infused filament channels, wax-layer micro-coating maps
- Braided/expanded-floss expansion diagrams, precision shred-resistant tensile webs
- NanoFlex™ silicone cross-sections, nano-silver integration schematics

**D. Mechanical / Kinematic Systems**
- Brushing trajectory paths, interdental navigation schematics
- Pressure-response frameworks, oscillation / flex-control diagrams
- Floss tension-distribution arcs, micro-debris capture pathways, waxed glide mechanics
- Charcoal adsorption interaction paths

**E. Chemical Delivery & Interaction Models**
- Whitening reaction layers, enzymatic softening arcs
- Protective barrier formation, fluoride-free mineral delivery paths
- Herbal extract diffusion gradients

---

## STAGE 3B — PALETTE + LANGUAGE SELECTION

After photo check, always ask exactly this — one message, two choices:

---

"Two quick choices before I generate the card:

**Palette:**
A) Das Experten default — white/silver + turquoise/blue
B) [Product-appropriate alternative 1 — name + 1-line mood]
C) [Product-appropriate alternative 2 — name + 1-line mood]
D) [Product-appropriate alternative 3 — name + 1-line mood]

**Language:**
Russian / English / Vietnamese / Arabic"

---

Generate alternatives B, C, D intelligently based on product ingredients and positioning:
- Charcoal product → e.g. Deep obsidian + platinum silver + accent white
- Probiotic product → e.g. Warm ivory + sage green + copper
- Kids product → e.g. Soft coral + sky blue + clean white
- Herbal/botanical → e.g. Forest green + amber gold + warm ivory
- Enzyme whitening → e.g. Bright clinical white + electric turquoise + silver

**Default if no reply within this turn:** Das Experten palette + Russian.

[WAIT for selection before proceeding to Stage 4]

---

## STAGE 4 — GENERATE THE PROMPT

Output: one single copy-paste image-generation prompt block.
No preamble. No explanation. No headers. No bullets outside the prompt.
Just the prompt — start to finish — ready to paste.

---

### PROMPT ARCHITECTURE

#### OPENING LINE (always verbatim, adapt format only)

**Ozon:**
`Create an ultra-photorealistic agency-level 3×4 vertical marketplace product card for [PRODUCT NAME], featuring...`

**WB (Wildberries):**
`Create an ultra-photorealistic agency-level 3×4 vertical marketplace product card for [PRODUCT NAME], featuring...`

**International:**
`Create an ultra-photorealistic agency-level 1×1 square marketplace product card for [PRODUCT NAME], featuring...`

---

#### HERO PRODUCT BLOCK (always verbatim when photo uploaded)

```
Hero product = the product photo uploaded by user — exactly ultra-photorealistic, agency-level, high-fidelity, ultra-sharp render. No redraw / re-model / substitute packshot. No label, color, proportion, or geometry changes. Only realistic lighting integration: micro-shadows + reflections. Position: center-bottom-right, dominant, slightly forward. Crisp micro-shadows, crisp edges, premium cleanliness. If handle is cropped in source image — preserve that crop exactly, do not extend or reconstruct.
```

**No photo version:** Replace with: `No standalone product render. Central molecular/material visualization dominant (~85–90% width), carrying full product narrative.`

---

#### LAYOUT ZONES

**OZON 3×4:**

```
TITLE ZONE (top, ~35% width): Clean background with lighting continuity. No overlapping molecules or callouts. Subtle ambient gradient only. Space visually prepared for product title overlay.

CENTRAL VISUAL (~75% width): [MOLECULAR/MATERIAL VISUAL — see selection rules below]. Ultra-photorealistic, 8K, clinical-biotech aesthetic. Placed behind and beside the hero product. Reinforces the product's core mechanism visually.

LEFT CONTENT ZONE (~25% width): 3–4 scientific benefit callouts. Each with ALL-CAPS title (1–3 words, bold) + 1-line description + optional stat. No flat icons — all markers must be biotech schematics, anatomical callouts, or molecular bubbles. 2–4 thin biotech pointer lines toward product and molecular zones.

EVIDENCE BUBBLE: One glowing callout bubble with top clinical stat, connected by thin medical line to the hero product or molecular zone.
```

**INTERNATIONAL 1×1:**

```
CENTERED HERO PRODUCT: dominant, centered, slightly angled. Clean premium background.

TOP TEXT ZONE: Product name + 1 headline benefit. Clean typography, no clutter.

BOTTOM TEXT ZONE: 2 key stats or benefits. Compact, high-contrast, clinical tone.

BACKGROUND MOLECULAR ELEMENT: Subtle, integrated, reinforces product category. Not dominant — supporting role only. 30–40% opacity fade at edges.

BADGE (optional): One circular or pill-shaped callout with top clinical stat.
```

---

#### CENTRAL VISUAL SELECTION RULES

Auto-select based on product category:

**PASTES & LIQUIDS — Molecular & Biochemical:**
- SYMBIOS → B. coagulans spore spheres, microbiome-balancing probiotic lattice, pathogen-downregulation nodes
- INNOWEISS → 5-enzyme cascade pathways: dextranase plaque-cleaving arcs, papain proteolytic softening, GOX hydrogen-peroxide generation nodes, bromelain protease lattice, invertase sucrose-splitting chains
- SCHWARZ paste → ultra-porous coconut-shell charcoal micro-honeycomb lattice, high-surface adsorption zones
- DETOX → cinnamaldehyde anti-biofilm suppression lines + eugenol amber phenolic rings, antimicrobial binding sites
- GINGER FORCE → angular gingerol/shogaol phenolic lattices, anti-inflammatory downregulation arcs, salivary gland activation pathways
- COCOCANNABIS → omega lipid arcs (hemp), micelle clusters (coconut), green-gold membrane hydration halos
- THERMO 39° → thermal enzyme activation gradient, papain softening pathways at physiological temperature
- EVOLUTION → CPP-ACP nanocomplexes, amorphous calcium-phosphate delivery nodes, enamel-binding remineralization halos
- BUDDY MICROBIES → GH12 peptide chains selectively targeting S. mutans, xylitol interference lattice

**BRUSHES — Material & Fiber Micro-Engineering:**
- Spiral/micro-tapered → filament micro-cutaways, polymer cores, micro-spiral fiber architecture
- Charcoal bristles → charcoal-infused filament channels, deposition pathways
- Silicone/nano-silver → NanoFlex™ cross-section, nano-silver integration schematics
- Orthodontic → precision shred-resistant tensile webs, compact head geometry diagrams
- Multi-zone → cross-sectional tensile diagrams, multi-zone bristle tier schematics

**FLOSS — Material & Mechanical:**
- Expanding → hydrophilic bloom diagrams, fiber swelling under tension, debris capture zones
- Waxed → wax micro-coating translucent film maps, low-friction motion paths
- Charcoal → charcoal adsorption interaction paths, bamboo fiber cross-sections

**INTERDENTALS:**
- Stainless core + polymer → tensile core anatomy, interdental navigation arc, pressure-response frameworks

---

#### PALETTE

Default Das Experten palette: white/silver + turquoise/blue.

Product overrides (auto-apply unless user specifies):
- SCHWARZ (paste or brush) → deep obsidian + platinum silver + accent white
- DETOX → deep forest green + amber gold + warm ivory
- GINGER FORCE → warm terracotta + deep amber + cream white
- COCOCANNABIS → sage green + hemp gold + soft white
- SYMBIOS → clinical white + soft cobalt + warm silver
- EVOLUTION / BUDDY → soft coral + sky blue + clean white
- INNOWEISS → bright clinical white + electric turquoise + silver

---

#### COPY RULES

- Default language: Russian (unless user specifies English, Vietnamese, Arabic, etc.)
- All structural/layout/technical instructions in prompt = English always
- All on-card visible text (titles, stats, callouts) = selected language
- Never include SKU numbers (DE201, DE117, etc.) in any visible card text
- Never use the word "detox" when describing SCHWARZ — use "delicate charcoal care" instead
- Text color = active palette accent +2–3 tones darker for legibility

---

#### CLOSING QUALITY LINE (always append verbatim)

```
Ultra-photorealistic, 8K, agency-level, hyper-clean, crisp edges, premium laboratory lighting, micro-shadows, zero noise, zero artifacting.
```

---

## STAGE 5 — OUTPUT FORMAT

Deliver the prompt as one clean block of text.
No markdown headers inside the prompt.
No explanation before or after — just the prompt, copy-paste ready.

After delivering, output exactly one line:

`Card prompt ready. Platform: [Ozon 3×4 / International 1×1]. Language: [language]. Need a different palette, platform, or language?`

---

## GLOBAL RULES

| Rule | Value |
|---|---|
| Brand system | Always operates inside Das Experten — all defaults inherited |
| Default format | Ozon 3×4 if platform not specified |
| Default language | Russian if not specified |
| Hero product | Exact uploaded photo — zero changes to geometry, label, color, proportion |
| No photo | Expand central visual to dominant, no standalone product render |
| SKU rule | Never display SKU codes as on-card text |
| SCHWARZ rule | Never say "detox" for SCHWARZ paste — use "delicate charcoal care" |
| Flat icon ban | No flat pictograms — all markers = scientific schematics or biotech bubbles |
| Output | One prompt block only — no bullets, no structure, no explanation |
| Tone | Clinical, premium, evidence-driven — never generic wellness language |