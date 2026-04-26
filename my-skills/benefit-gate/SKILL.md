---
name: benefit-gate
description: >
  Standalone psychological profiling and copy-alignment gate for Das Experten.
  ALWAYS trigger this skill when any other Das Experten skill needs to adapt
  its output to a specific audience type before generating slides, emails,
  product cards, blog posts, or any persuasive copy. Trigger phrases include:
  "profile the audience", "psychographic brief", "reader mind map", "benefit gate",
  "who is reading this", "write for the audience", or any inter-skill call via
  [[GATE: benefit-gate]]. Also auto-triggers from das-presenter (Step 1D),
  sales-hunter, productcardmaker, and blog-writer whenever audience type is known.
---

# Benefit Gate

**Purpose:** Every output must speak to the reader's inner dialogue — not at them. Before any skill generates persuasive copy, it must know who is sitting in that chair, what they are afraid of, what they are trying to prove to themselves or their boss, and what hidden objection is already forming in their mind. The product solution must grow in their head as a logical, inevitable conclusion — never as a sales pitch.

Benefit-gate operates in **two distinct modes**. Callers choose the mode explicitly through the Check type parameter.

---

## MODE A — PSYCHOGRAPHIC PROFILING (default)

Called when another skill needs an audience brief **before** generating copy — to know who will read it and how their mind works.

### Invocation
```
[[GATE: benefit-gate]]
Check type: PROFILE
Audience type: [pharmacy buyer / distributor GM / retail category manager / end consumer / B2B investor / etc.]
Country: [country code or name]
Context: [optional — what copy will be generated after this profile]
```

### What this mode returns
Full psychographic brief (via Steps 1–5 below) — mirror anchor language, hidden objections, mind-map structure. Used by das-presenter, sales-hunter, productcardmaker, blog-writer, ugc-master to write resonant copy.

### Return signal
- ✅ `BENEFIT GATE: PROFILE READY` — brief delivered, calling skill may now generate copy

---

## MODE B — CONVERSION CHECK (hard stop)

Called **after** copy is drafted but **before** it is sent — to verify the draft actually increases probability of the desired action. This is a binary pass/fail gate that blocks weak outputs from shipping.

### Invocation
```
[[GATE: benefit-gate]]
Check type: CONVERSION
Draft: [the message / offer / pitch text to check]
Offer type: [price / MOQ / payment terms / meeting request / sample send / PO close / next-step proposal]
Audience: [who this is aimed at — if PROFILE was run earlier, pass the audience_type]
Desired action: [the single outcome this draft must drive]
```

### When conversion check is mandatory (hard trigger)

Callers MUST run Mode B before output when the draft contains any of:
- An offer — price, MOQ, payment terms, shipment proposal, delivery date
- A product / SKU suggestion — "this product fits your category", "we recommend X for Y market"
- A next-step proposal — meeting request, call invitation, presentation offer, sample send
- A partnership or listing application — shelf space, distributor agreement, online platform listing
- A pitch follow-up — referencing a sent presentation, catalog, or commercial proposal
- A close attempt — asking for decision, PO, signature, or first order

At these moments Mode B is **not optional — it is a hard stop**. Draft does not proceed to output until conversion check confirms it passes all 5 questions below.

### The 5 Conversion Questions (run internally, in order)

1. Does the message make the offer feel relevant to THIS contact's world?
2. Is the benefit stated from their perspective, not ours?
3. Is there one clear call to action — not two, not zero?
4. Does it remove friction rather than add it?
5. Would a skeptical reader feel pulled toward yes?

Each question = one binary answer (YES / NO). All five must be YES to pass.

### Output format

```
🎯 BENEFIT GATE — CONVERSION CHECK RESULT
Offer type: [value]
Audience: [value]
Desired action: [value]

Q1 Relevance to their world: [YES / NO — one-line reason if NO]
Q2 Benefit from their POV: [YES / NO — one-line reason if NO]
Q3 One clear CTA: [YES / NO — one-line reason if NO]
Q4 Friction removed: [YES / NO — one-line reason if NO]
Q5 Skeptic pulled to yes: [YES / NO — one-line reason if NO]

Verdict: [see return signals below]
Top rewrite: [if not passing — one concrete suggested edit, paste-ready]

↩️ Returning to [calling skill] — conversion check complete.
```

### Return signals (binary branching for callers)

- ✅ `BENEFIT GATE: CONVERSION PASS` — all 5 questions YES, draft may ship as-is
- ⚠️ `BENEFIT GATE: CONVERSION WEAK` — 1 question NO, rewrite suggested but draft may ship with the top rewrite applied
- 🔴 `BENEFIT GATE: CONVERSION FAIL` — 2 or more questions NO, **draft must not be sent**; calling skill regenerates and re-runs the check

### Rules (Mode B specifics)

- Maximum output: 12 lines — verdict block only, no psychographic essays (those belong to Mode A)
- Never invent audience data — if `Audience` is missing in input, return `⚠️ AUDIENCE MISSING — run PROFILE mode first`
- CTA check is strict: two CTAs = Q3 fails; zero CTAs = Q3 fails; exactly one decision-forcing CTA = Q3 passes
- Friction check is strict: any ambiguity in next step, timing, or price = Q4 fails
- After returning result, calling skill either ships (PASS / WEAK with edit) or regenerates (FAIL) and re-submits

---

## Legacy invocation (backward compatibility)

For skills still using the old form:
```
→ [[GATE: benefit-gate → Audience Psychographic Profiling]]
  INPUT: audience_type, country
  AWAIT: BENEFIT_GATE_RESULT
```
This is automatically interpreted as Mode A (PROFILE). All new calls should use the explicit `Check type:` parameter above.

This gate runs **silently**. No widget. No user-facing output. It returns an internal brief or verdict used by the calling skill.


---

## STEP 0 — Net Parse Protocol ⛔ RUNS BEFORE STEP 1 WHENEVER A URL OR HANDLE IS AVAILABLE

**Purpose:** Auto-populate the Reader Mind Map from public data instead of manual input. If the calling skill provides a URL, handle, or company name — run this step first. The parsed signals feed directly into Step 1, replacing assumptions with facts.

Run only sources that are available and relevant to the prospect type. Never fabricate data. If a source returns nothing — mark as `[not found]` and proceed with available signals.

---

### SOURCE 1 — LinkedIn (Person Profile)

**What to parse:**

| Field | Psychographic signal unlocked |
|---|---|
| Job title + seniority level | Authority vs. recommender gap — VP decides alone; manager pitches upward → changes mirror anchor |
| Years in current role | 0–18 months = proving themselves = loss-framed, urgency-responsive · 3+ years = established = gain-framed |
| Career trajectory (previous roles) | Rising fast = ambitious, first-mover · Lateral moves = stability-seeking = validator |
| Previous employer brands | Worked at major FMCG/pharma = high reference standards, will compare to known brands |
| About / summary section text | Their own words = exact mirror anchor language — use it verbatim |
| Skills listed | Technical depth indicator — do they speak ingredient science or just category claims |
| Group memberships | Professional identity — pharmacy association, retail buyer group, oral care network = category is core |

---

### SOURCE 2 — LinkedIn (Company Page)

**What to parse:**

| Field | Psychographic signal unlocked |
|---|---|
| Employee count | 1–10 = founder decides alone · 50–200 = small management team · 500+ = procurement committee + long cycle |
| Follower count + growth trend | Growing fast = open to risk, first-mover appetite · Flat/declining = defensive, need proven performers |
| Founded date | <5 years = builders, experimental · 10+ years = protectors, process-driven |
| Specialties listed | Their own positioning language — tells you their identity narrative and what they protect |
| Industry classification | Is oral care their core category or peripheral — peripheral = wants safe/easy; core = wants differentiation |
| Recent company posts topics | Live mirror anchor — what are they publicly talking about right now |
| Job postings active | Hiring in buying/category = expanding → higher risk appetite · Hiring in finance/ops = consolidating → conservative |

---

### SOURCE 3 — Instagram (Business / Influencer Profile)

**What to parse:**

| Field | Psychographic signal unlocked |
|---|---|
| Follower count | Scale of audience trust they are managing — higher = more protective of credibility |
| Engagement rate (likes+comments / followers) | <1% = audience is passive, they can take more risks · 3–8% = tight community = credibility-first, very selective |
| Posting frequency | High frequency = content-machine mode, transactional · Low + high engagement = selective, values-driven |
| Bio text | Identity statement — their exact self-narrative → use as mirror anchor |
| Business category tag | Niche positioning — health/wellness = science angle works · Lifestyle = transformation story works |
| Sponsored post frequency | Many brand deals = transactional partner · Rare = selective, credibility is the price of entry |
| Comment sentiment on sponsored posts | Positive = audience accepts brand content · Negative/sarcastic = they are taking real risk by partnering |
| Caption language and tone | Technical/educational = sophistication-oriented · Emotional/personal = identity-oriented |
| Hashtags used consistently | Community identity signals — which tribes they belong to |
| External link in bio | Product/shop = commerce-oriented · Linktree with causes = values-driven |

**Engagement rate benchmarks:**
- Nano (<10K followers): healthy ≥ 5%
- Micro (10K–100K): healthy ≥ 3%
- Macro (100K–1M): healthy ≥ 1.5%
- Mega (1M+): healthy ≥ 1%

Below benchmark = inflated following or disengaged audience = lower credibility risk for them, higher content risk for Das Experten

---

### SOURCE 4 — Facebook (Business Page)

**What to parse:**

| Field | Psychographic signal unlocked |
|---|---|
| Page likes + followers | Audience size and community scale |
| Post engagement rate | Same logic as Instagram — low = passive audience = lower risk tolerance · high = community = credibility-protective |
| About section / page description | Self-narrative and positioning language → mirror anchor |
| Post content topics | What they are publicly talking about → live pain/desire signal |
| Review score + review text | Customer feedback they receive → tells you what their buyers actually value → tells you what they fear losing |
| Event listings | Active in trade shows, community events = relationship-oriented buyer |
| Response rate to messages | High = attentive, relationship-driven · Low = transactional, prefers structured proposals |
| Ad activity (visible boosted posts) | Running ads = growth-mode, commercially aggressive = gain-framed |
| Groups they manage or participate in | Professional community membership = category identity signal |

---

### SOURCE 5 — VK (ВКонтакте) — Russia/CIS prospects only

VK has an open structure that allows access to public posts, groups, and profiles — particularly valuable for Russia/CIS market intelligence.

**What to parse:**

| Field | Psychographic signal unlocked |
|---|---|
| Community/group name + description | Self-positioning and identity narrative for Russian-market buyers |
| Member count | Scale of their community = influence level in market |
| Post frequency + engagement (likes, reposts, views) | Activity level → business momentum signal |
| Post content and language | Detailed post data including publication date, images, likes, views → live topic signal — what are they talking about right now |
| Product listings in VK Market | VK marketplace listings including prices, descriptions and seller details → what they currently sell = category overlap check |
| Group membership categories | Professional identity in Russian-market context — pharmacy groups, retail chains, distributor networks |
| Location data | City/region → logistics complexity signal for CIS distribution |
| Profile keywords (keyword scrape by category) | Filter by gender, retrieve profile names, location, and education → demographic layer for B2C audiences |

---

### SOURCE 6 — Company Website

**What to parse:**

| Field | Psychographic signal unlocked |
|---|---|
| "About us" / mission text | Values and self-narrative in their own words → exact mirror anchor |
| Product categories listed | Do they carry oral care already? Which brands? → switching cost + competitor angle |
| Brand partners / supplier logos | Existing relationships → what standard they're measuring you against |
| Press / news section | Recent expansions, new store openings, awards → business is growing → higher risk appetite |
| Active job postings | Category/buyer hiring = expanding · Finance/operations hiring = consolidating |
| Website language | Formal/corporate = committee decision · Casual/personal = founder-led |
| Contact page structure | Named person with direct email = relationship-oriented · Generic form only = process-oriented |

---

### PARSE OUTPUT FORMAT

After running all available sources, produce this internal enrichment block:

```
NET_PARSE_RESULT:
  sources_checked: [list of sources run]
  sources_returned_data: [list of sources with data]

  # PERSON signals
  seniority_level: [title + inferred authority level]
  years_in_role: [X years → risk orientation: loss-framed / gain-framed]
  career_trajectory: [rising / lateral / established]
  about_text_extract: [key phrases from their own words]
  professional_groups: [list]

  # COMPANY signals
  employee_count: [X → decision complexity: solo / small team / committee]
  company_age: [X years → builder / protector]
  growth_signal: [hiring / expanding / consolidating / unknown]
  oral_care_centrality: [core category / peripheral / not present]
  identity_language: [their own positioning words]

  # SOCIAL signals (Instagram / Facebook / VK)
  follower_count: [X]
  engagement_rate: [X% → audience trust level: tight / moderate / passive]
  sponsored_post_frequency: [high / moderate / rare]
  bio_extract: [key phrases]
  content_themes: [list of recurring topics]
  brand_deal_sentiment: [positive / neutral / negative from comment analysis]

  # SYNTHESIZED PSYCHOGRAPHIC INPUTS FOR STEP 1
  primary_audience_type: [confirmed or refined from parse]
  risk_orientation: [first-mover / validator / unknown]
  loss_vs_gain_frame: [loss / gain / unknown]
  identity_narrative: [1-sentence summary of who they think they are]
  live_mirror_anchor: [the exact topic or phrase they are publicly focused on right now]
  decision_authority: [solo / recommender / committee]
```

Feed `NET_PARSE_RESULT` directly into Step 1 as the data layer under the Reader Mind Map. Where parsed signals confirm or sharpen the audience-type defaults — use the parsed version. Where parsed data conflicts with defaults — always trust parsed data over assumptions.

⛔ Never invent signals not present in the data. Mark missing fields as `[not found]` and fall back to audience-type defaults from Step 1.

---

## STEP 1 — Build the READER MIND MAP

Based on `audience_type` and `country`, silently construct the full psychological profile below. This is **never shown to the user**. It is the invisible layer beneath every word of every output.

---

### → DISTRIBUTOR / IMPORTER

**Hidden fears** (what they will never say out loud):
- "What if I commit to a new brand and it doesn't sell — my capital is stuck, my boss blames me"
- "What if the brand disappears, gets blocked, or loses supply — I'm left with unsellable inventory"
- "What if I miss this and a competitor takes the territory first — I lose the exclusive window forever"
- "Is this brand real or is it another OEM repack with a German name stuck on it"

**Visible complaints** (what they will say):
- "The market is saturated — how is this different?"
- "What's the sell-through velocity? Do you have proof?" — answer: 67% reorder rate, 500k+ reviews avg 4.87 stars on European marketplaces
- "Who else is distributing this in neighbouring markets?"

**Status anxiety:**
- They want to bring in a winner before their competitor does
- They need ammunition to justify the decision to internal stakeholders
- They are measured by sell-through, not just by margin — dead stock terrifies them

**Decision blockers:**
- No local proof of demand (they've been burned by "German quality" claims before)
- No clarity on what happens when they can't sell — return policy, brand support, exit terms
- Uncertainty about the brand's staying power and supply reliability

**Hidden desire:**
- To be the distributor who "discovered" a rising brand before it was obvious
- First-mover advantage as a professional achievement, not just a commercial one

---

### → RETAIL CHAIN

**Hidden fears:**
- "If I give this shelf space and it doesn't move, I'm explaining it to category management next quarter"
- "Colgate reps are in this office every week — can Das Experten actually compete for attention at the shelf?"
- "Is the packaging strong enough to sell itself? Our customers don't ask — they grab"
- "Do they have enough supply consistency to stay in stock? A gap on shelf costs me more than the margin"

**Visible complaints:**
- "What's the category margin uplift?"
- "What's the planned rotation — how fast does it turn?"
- "Do you have in-store support — POS, promoters, endcap budget?"

**Status anxiety:**
- Category managers are judged on shelf productivity (sales per linear metre) — anything that underperforms gets delisted within 2 quarters
- They need the decision to look smart internally — a brand that fails is their failure too

**Decision blockers:**
- Unproven sell-through at physical retail (WB ratings are not retail proof)
- Uncertain replenishment — small brands going out of stock mid-season is a recurring pain
- Packaging not shelf-tested — will it survive facing, handling, competitor proximity

**Hidden desire:**
- To find the one premium SKU that captures the growing "conscious consumer" budget before their competitor chain does
- A brand with built-in consumer pull so the sell-in doesn't require heavy push

---

### → DENTIST / DENTAL PROFESSIONAL

**Hidden fears:**
- "If I recommend this and a patient has a bad experience, my reputation is at stake — not the brand's"
- "Is there real clinical evidence or is this marketing dressed as science?"
- "Will my patients actually use it consistently? Most recommendations don't survive the first week"
- "Is the brand here to stay or will I be recommending something that's discontinued next year"

**Visible complaints:**
- "What are the RDA and RDA/whitening index values?"
- "Is there any peer-reviewed data or just internal studies?"
- "What's the fluoride position — many of my patients ask about fluoride-free"

**Status anxiety:**
- They are accustomed to being sold to — deeply skeptical of reps and decks
- Their currency is clinical credibility; anything that sounds like marketing undermines trust immediately
- They want to be ahead of patient questions, not caught unprepared

**Decision blockers:**
- Insufficient clinical depth (ingredient mechanisms, not just outcome claims)
- No professional sampling program — they won't recommend without trying
- Uncertainty about whether the product hierarchy matches patient segments they actually see

**Hidden desire:**
- To have a patient-compliance tool they can genuinely believe in — not just a brand arrangement
- Professional-grade differentiation from what the pharmacy shelf already offers
- To be the dentist who introduces patients to something they couldn't find themselves

---

### → BLOGGER / INFLUENCER

**Hidden fears:**
- "If I post about this and my audience hates it, I lose credibility — that's my only real asset"
- "Is the brand paying me to lie or is there actually something real here?"
- "Will they disappear or ghost me after I post? I've been burned before"
- "Is this going to be the same unboxing everyone else does, or is there actually a unique angle?"

**Visible complaints:**
- "What makes this content-worthy? My audience has seen a hundred toothpaste sponsors"
- "What kind of creative freedom do I have? I don't want a script"
- "What's the affiliate structure — is the commission actually worth my shelf space?"

**Status anxiety:**
- They are selling their audience trust, not their follower count — acutely sensitive to authenticity
- They want a story to tell, not a product to display
- The fear of being seen as a sellout is greater than the fear of missing the deal

**Decision blockers:**
- Product story not differentiated enough to protect their credibility with their audience
- No clarity on what they can and cannot say — vague brand guidelines feel like a trap
- Uncertainty about whether the brand actually delivers on its claims (they test everything)

**Hidden desire:**
- Content that makes them look smart and ahead of the trend — not another FMCG sponsorship
- A scientific angle simple enough to explain in 30 seconds that makes their audience feel educated
- A brand relationship that grows with them — not a one-post transaction

---

### → CONSUMER / DTC

**Hidden fears:**
- "Will this actually work or is it just another 'natural' product that does nothing?"
- "Is it safe for my children / daily use / sensitive gums?"
- "What if I pay premium and notice no difference — I'll feel foolish"

**Visible complaints:**
- "There are too many options — what makes this actually different?"
- "I've tried 'probiotic' products before and didn't feel anything"

**Status anxiety:**
- Health-conscious consumers are building an identity around their choices — buying this is a self-statement
- Premium price must feel justified; doubt about efficacy creates post-purchase regret

**Decision blockers:**
- No visible social proof (reviews, before/after, influencer validation) — counter: 500,000+ verified WB reviews, avg 4.87 stars — 67% reorder rate
- Ingredient names they can't pronounce create distrust rather than confidence

**Hidden desire:**
- To find the product that finally works — and to tell others about it
- To feel like they know something most people don't (insider knowledge effect)

---

### → B2B EMAIL RECIPIENT (cold outreach / sales-hunter)

**Hidden fears:**
- "Another vendor trying to get into my inbox — why should I read this?"
- "If I respond, I'm committing to a conversation I may not want"
- "Is this even relevant to what we actually carry?"

**Visible complaints:**
- "We already have suppliers for this category"
- "Send me a catalogue and I'll look when I have time"

**Status anxiety:**
- Procurement professionals are judged on portfolio performance, not vendor volume
- Responding to cold outreach feels like losing control of the conversation

**Decision blockers:**
- No immediate proof of relevance to their specific market or category
- No signal that the sender understands their business model

**Hidden desire:**
- To find a differentiated product before a competitor does — without admitting they were looking

---

## STEP 2 — Apply the PERSONALIZATION INJECTOR

⛔ **This rule applies to EVERY unit of copy generated after this gate fires. No element is exempt. No slide, email, card, or headline is written without passing through these three rules.**

For every headline, slide body, email paragraph, product description, or CTA — apply the following three rules in sequence:

---

### Rule 1 — Mirror First

Identify which hidden fear, visible complaint, or status anxiety from the Reader Mind Map is most relevant to this specific content unit. The opening line or headline must reflect that inner dialogue — not the product.

The reader must feel: *"This is written for me. They understand my situation."* — before they feel anything about the product.

- ❌ Wrong: "Das Experten SYMBIOS contains 4×10¹⁰ CFU live cultures per dose"
- ✅ Right: "Your customers are asking for probiotic oral care. Most brands have the claim. Only SYMBIOS has the count — and it pioneered the category. Still #1 on European marketplaces."

---

### Rule 2 — Reveal the Gap

Show the reader something they suspected but couldn't articulate. Make them feel their existing understanding was incomplete. Do not tell them they were wrong — show them what they were missing.

The reader must feel: *"I already knew this was true — I just didn't have the words for it."*

- ❌ Wrong: "The market for probiotic toothpaste is growing"
- ✅ Right: "The shelf slot for this category is still empty in 80% of pharmacy chains in your market. That slot has a buyer — question is who gets there first."

---

### Rule 3 — Let the Solution Arrive

The Das Experten product or proposition must feel like the reader's own conclusion — not something being sold to them. It arrives as the only logical answer to the gap revealed in Rule 2. The reader must reach it themselves. Never announce it. Never pitch it. Lead the reader to the edge — the product is what they see when they look over.

The reader must feel: *"I would have come to this conclusion on my own eventually — they just got me there faster."*

- ❌ Wrong: "That's why Das Experten is the right choice for your portfolio"
- ✅ Right: "One SKU. Probiotic — clinically verified. No competitor has it on your shelf yet."
  *(reader concludes: I should carry this — without being told to)*

⛔ **If the copy announces the product as the answer — rewrite. The product must be discovered, not presented.**

---

### PERSONALIZATION INJECTOR — Slide-Level Application Rule

⛔ **Applies to EVERY slide with body copy, headlines, or CTA elements. No slide is exempt.**

For each slide:

1. Before writing any copy — identify which specific hidden fear or hidden desire from the Reader Mind Map is most active for this slide's subject matter
2. Apply Rule 1 to the opening line or headline of that slide
3. Apply Rule 2 to the body — the insight or data point that makes the reader feel the gap
4. Apply Rule 3 to the closing line, CTA, or transition — the moment the product or proposition lands as the reader's own conclusion

This is not a checklist to tick. It is the invisible architecture beneath every word.

---

## GATE OUTPUT FORMAT

After completing Steps 1 and 2, produce this internal result block (not shown to user):

```
BENEFIT_GATE_RESULT:
  audience_type: [type]
  country: [country]
  primary_fear: [single most relevant hidden fear for this specific output context]
  primary_desire: [single most relevant hidden desire]
  key_blocker: [most critical decision blocker to address in this output]
  mirror_anchor: [the exact inner dialogue line to mirror in the opening of the output]
  gap_angle: [the specific gap or missing insight to reveal]
  arrival_framing: [how the product/proposition should land as the reader's own conclusion]
  status: PASS
```

The calling skill uses `BENEFIT_GATE_RESULT` to color all copy in every subsequent step.

---

## Integration Map — Which Skills Call This Gate

| Skill | Trigger point | Input |
|---|---|---|
| das-presenter | After Step 1C — before any slide copy (Step 1D) | audience_type + country |
| sales-hunter | After prospect profile is built — before email draft | audience_type + country |
| productcardmaker | Before card copy — when audience/marketplace is known | audience_type + marketplace |
| blog-writer | Before body copy — when target reader is defined | audience_type + country |
| review-master | Before response draft — consumer always | consumer + country |
| bannerizer | Before headline generation — when audience is known | audience_type |

---

## Integration Map — Which Skills Call This Gate

| Skill | Trigger point | Input |
|---|---|---|
| das-presenter | After Step 1C — before any slide copy (Step 1D) | audience_type + country |
| sales-hunter | After prospect profile is built — before email draft | audience_type + country |
| productcardmaker | Before card copy — when audience/marketplace is known | audience_type + marketplace |
| blog-writer | Before body copy — when target reader is defined | audience_type + country |
| review-master | Before response draft — consumer always | consumer + country |
| bannerizer | Before headline generation — when audience is known | audience_type |

---


---

## STEP 0B — Decision Maker Intelligence (DMI) ⛔ RUNS WHEN DIRECT CONTACT IS HIDDEN OR UNCONFIRMED

**Trigger:** Fire this step whenever STEP 0 returns `decision_authority: unknown` or the direct contact person cannot be confirmed from public sources. This is not a fallback — it is a mandatory parallel track. Even when a direct contact IS found, run Plan B to verify they are actually the decision maker and not a gatekeeper.

**Core principle:** Job title alone is not enough. Look for signals of budget ownership, strategic accountability, or responsibility for business performance in a specific area. When these signals are hidden — read the room through indirect signs.

---

### PLAN A — Direct Identification (standard)

Try in this order. Stop at first confirmed hit.

| Source | Query | What confirms DM status |
|---|---|---|
| LinkedIn | `[Company name] + [category manager / purchasing director / head of buying]` | Title + P&L language in About section |
| Company website | `/about`, `/team`, `/management` pages | Named person with buying-adjacent role |
| Google | `"[company name]" + "director" OR "head" OR "закупки" OR "категорийный"` | Press mentions, interview quotes, event speaker bios |
| Facebook / VK page | Tagged posts, event check-ins, admin comments | Person posting as the brand = often the owner or senior manager |
| Trade show / event listings | Past exhibitor profiles, speaker lists | Named representative = face of the company externally |
| Press releases | New partnership announcements, quotes | Quoted person = decision maker who approved the deal |

---

### PLAN B — Indirect Signal Reading (when direct is closed)

When the company is opaque — no named contacts, private ownership, no LinkedIn presence, generic website — read these indirect signals to **infer** who decides and how they decide.

#### B1 — Company size → decision structure inference

The decision-making process varies significantly depending on the size of the company.

| Employee count | Inferred structure | Who likely decides | Outreach implication |
|---|---|---|---|
| 1–5 | Founder-only | The person who answers the phone / replies to email IS the decision maker | Skip formality — write directly, personally, briefly |
| 6–20 | Founder + 1–2 ops managers | Founder decides, ops manager recommends | Write to founder; acknowledge ops role |
| 21–100 | Department heads with budget | Category / purchasing head — not CEO | Find the department, not the top |
| 101–500 | Buying committee | 3–6 people including finance, category, operations | Need internal champion — find the researcher, not the approver |
| 500+ | Procurement process | Formal vendor registration required | Entry via category manager; approve via procurement |

#### B2 — Job posting analysis (what they're hiring = what they're building)

Review job postings for specific roles to understand departmental focus and responsibilities.

| Active job posting | Signal | Copy implication |
|---|---|---|
| "Category Manager – FMCG / oral care" | They are expanding the category — someone is accountable for performance | Pitch to the gap: "your new category manager will need wins fast" |
| "Head of Purchasing" or "Закупщик" | Buying function is growing — they are adding volume | Frame as: low-risk volume addition, not a disruption |
| "Marketing Manager" | Brand is investing in visibility | Co-marketing angle — position Das Experten as a brand that brings pull, not just product |
| "Store Manager × 5 locations" | Rapid physical expansion | Supply reliability and in-store support are the decision blockers |
| No open roles | Stable / not growing | Conservative buyer — need proven performers, not new bets |

#### B3 — Social posting behavior (who posts = who leads)

| Signal | Inference |
|---|---|
| One person consistently posts on company FB/VK/IG | That person is the owner or senior manager — likely the decision maker in small companies |
| Posts are product-focused with prices | Commercial/sales orientation — respond to margin and velocity arguments |
| Posts are brand/values-focused | Identity-driven owner — respond to brand fit and positioning arguments |
| Posts reference staff, team, "our team" | Culture-conscious leader — relationship and trust are the real purchase criteria |
| Posts are irregular, low quality | The business runs on word-of-mouth and relationships — warm intro beats any cold email |
| No posts in 3+ months | Company may be dormant, struggling, or founder-absent — qualify before investing time |

#### B4 — Review text mining (customers reveal the real priorities)

What customers write about a company tells you what the owner optimizes for — which tells you what they fear losing.

| Customer review pattern | Owner priority | Hidden fear | Mirror anchor |
|---|---|---|---|
| "Always fresh products, great rotation" | Inventory management | Dead stock / gaps on shelf | "Never a gap. Rotation guaranteed." |
| "Great staff, very helpful" | Service quality | Reputation with customers | "Products your staff can recommend confidently" |
| "Best prices in the area" | Price competition | Margin pressure | "Higher margin category, not another price war" |
| "Wide variety, always something new" | Assortment depth | Missing a trend | "The category your shelf doesn't have yet" |
| "Waited too long for delivery" | Logistics reliability | Supply failure | "Lead time guaranteed in writing" |
| Mostly 4–5 stars, few complaints | Stable, satisfied customer base | Disrupting what works | "Zero risk to your existing assortment — additive, not replacement" |

#### B5 — Gatekeeper as intelligence source

A gatekeeper in business is the initial barrier between an SDR and a decision-maker. Treat gatekeepers as information sources, not obstacles.

When reaching a receptionist, assistant, or junior staff member:

- Ask: "Who usually handles new supplier proposals?" → gets you the role
- Ask: "Is that something [name] looks after, or is there a purchasing team?" → confirms or corrects your assumption
- Ask: "When is the best time to reach them?" → reveals their schedule and communication style
- Never pitch to the gatekeeper — use the interaction purely to map the org

#### B6 — Email domain pattern → org size signal

| Email format | Inference |
|---|---|
| `info@company.com` or `office@` | No named contact publicly available — small/closed company — owner reads this |
| `firstname.lastname@company.com` | Corporate structure — a real person, likely reachable |
| `purchasing@` or `zakupki@` | Dedicated buying function — mid-to-large, go department-first |
| Gmail / Yandex / Mail.ru domain | Micro-business — owner is the company — write as human to human, not B2B formal |
| No website email, only contact form | High friction — they are not actively seeking suppliers — need warm intro or patience |

#### B7 — Industry-specific decision maker mapping

For Das Experten's specific buyer types when contact is unknown:

| Company type | Most likely decision maker | Second-most likely | Worst mistake |
|---|---|---|---|
| Independent pharmacy (1–3 locations) | Owner / director | Pharmacist-in-charge | Emailing "info@" and waiting |
| Pharmacy chain (10+ locations) | Category manager – health & beauty | Head of purchasing | Going straight to CEO |
| Supermarket chain | Category buyer – household / personal care | Commercial director | Going to store manager |
| Online marketplace seller (WB/Ozon) | The account itself = 1 person usually | — | Formal multi-page proposals |
| Distributor / importer | Commercial director or owner | Sales manager | Sending to logistics |
| Dental clinic / chain | Owner / chief dentist | Office manager | Sending to reception without follow-up |
| Blogger / influencer | DM on Instagram / Telegram | Manager (if 500K+ followers) | Emailing a generic press address |

---

### DMI OUTPUT FORMAT

```
DMI_RESULT:
  plan_a_status: [found / not found / unconfirmed]
  confirmed_contact: [name + title + channel] OR [not found]

  plan_b_signals:
    company_size_inference: [employee count → decision structure]
    posting_behavior: [who posts + what it reveals]
    job_postings: [active roles + implication]
    review_pattern: [dominant review theme + owner priority]
    email_domain_type: [format → org size signal]
    gatekeeper_intel: [any info gathered]
    industry_dm_map: [most likely DM role for this company type]

  recommended_entry_point: [specific person / role / channel to target first]
  recommended_backup: [second entry point if first fails]
  outreach_tone: [formal proposal / direct personal / warm intro required / relationship-first]
  confidence_level: [HIGH — direct contact confirmed / MEDIUM — inferred from signals / LOW — blind outreach]
```

Feed `DMI_RESULT` into the calling skill's outreach or copy generation step. Confidence level determines how personalized and assumption-light the copy must be:

- **HIGH** — write directly to the confirmed person, reference their specific context
- **MEDIUM** — write to the inferred role, acknowledge you may be reaching the wrong person gracefully
- **LOW** — write to the company as an entity, make it easy to forward internally, ask explicitly who to speak with
