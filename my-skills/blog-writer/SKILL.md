---
name: blog-writer
description: >
  Full-service SEO blog post generator for Das Experten (and any brand). Use this skill whenever the user asks to write, create, generate, or draft a blog post, article, or long-form content — in any language. MANDATORY: before writing a single word of the post, this skill requires collecting three parameters: author style number, blog length (A/B/C), and exact topic. Trigger also when the user says "напиши статью", "сделай пост", "write me an article", "create content", or any similar request. Always use this skill — do not write blog posts without it.
---

# Blog Writer Skill

## Purpose
Generate polished, SEO-optimized long-form blog posts following a strict narrative structure with author voice, structured formatting, and brand integration (optional).

---

## MANDATORY PRE-FLIGHT: Collect All 3 Parameters First

**Do NOT write a single word of the blog post until all three are confirmed.**

Display the following selection menu to the user:

---

**Пожалуйста, выберите параметры перед созданием статьи:**
*(If the user's message is in English, translate this menu to English.)*

**Стиль автора / Author Style:**

*Для русскоязычных статей:*
1. Варламов
2. Дубинин (Послезавтра)
3. Пивоваров (Редакция)
4. Максим Кац
5. Александр Файб
6. Евгений Киселев
7. Леонид Парфёнов
8. Стас Белковский
9. Соколовский
10. Доктор Комаровский

*For English articles:*
1. Giulia Enders (The Gut)
2. Alex Hormozi
3. Sabry Suby
4. Robert Kiyosaki
5. Malcolm Gladwell (Genies and Outsiders)
6. Michael Greger
7. Nassim Nicholas Taleb
8. Simon Whistler (VisualPolitics)

**Длина статьи / Blog Length:**
- A — Краткая / Brief (3,500–4,200 characters)
- B — Оптимальная / Optimal (4,800–5,500 characters) — best SEO balance ✓
- C — Глубокая / Deep (5,800–6,800 characters) — maximum expertise

**Тема / Topic:** *(confirm exact wording)*

---

Wait for the user's response before proceeding.

---

## PRODUCT KNOWLEDGE GATE

**Trigger condition:** The confirmed topic mentions Das Experten, any specific SKU (SYMBIOS, SCHWARZ, DETOX, INNOWEISS, THERMO 39°, GINGER FORCE, COCOCANNABIS, EVOLUTION, BUDDY MICROBIES, or any brush/floss product), oral care ingredients, or brand claims.

**If triggered:**
Before writing a single word of the post body, load the `product` skill and extract:
- All relevant SKU names, article numbers, and active ingredients for the topic
- Applicable clinical numbers and data points
- Correct brand voice rules (what is and is not permitted)
- Any product ranking constraints (toothpaste hierarchy: SYMBIOS → INNOWEISS → DETOX → THERMO 39° → GINGER FORCE → SCHWARZ)

**Hard rules when gate is active:**
- Never invent or infer ingredients — use only verified data from `product`
- Never cross-contaminate: do not assign ingredient X from one SKU to another SKU
- Do not describe SCHWARZ as "detox" — it is "delicate charcoal care"
- Do not position brand as "European brand" or reference WIPO as a primary brand claim
- All clinical numbers used in the post must match the exact figures in the product knowledge base

**If gate is NOT triggered** (topic is general, non-brand, no Das Experten content):
Skip this section entirely. Proceed directly to Content Architecture.

---

## Content Architecture

Once all 3 parameters are confirmed, generate the post following this exact structure:

### Required Output Sections (in order):
1. **Search Title** (50–70 chars) — includes primary keyword
2. **Meta Description** (120–160 chars) — compelling, keyword-rich
3. **Blog Post Body** (see format below)
4. **Speech-Optimized Version** — same content rewritten for audio/voice (short sentences, natural rhythm, no links, conversational tone)

---

## HERO INTRIGUE LOCK — MARKETOLOG GATE

**This gate governs the Search Title and the opening line of the Meta Description.**
**Activate the `marketolog` skill before generating any title or subtitle. Do not write them without it.**

### Execution sequence:

**Step 1 — Generate 3 Hero variants**
Using `marketolog` principles (Ries-Trout-Ogilvy-Saatchi), produce exactly 3 candidate titles for the Search Title. Each variant must use a different hook type:
- 🤯 **Knowledge Gap** — reveal something the reader needs but doesn't know
- ⚡ **Bold Statement** — an undeniable claim that establishes authority
- 🔪 **Uncomfortable Truth** — expose a hard reality the industry ignores

**Step 2 — Score and select**
Select the variant that scores highest on intrigue. Never default to the first idea.

**Step 3 — Apply the Hero test**

A title FAILS if it:
- Describes the topic neutrally ("How Probiotics Help Oral Health")
- Names the category without tension ("Premium Oral Care")
- Answers the question before the reader clicks
- Uses flat language that could appear on any competitor's shelf

A title PASSES if it:
- Creates a curiosity gap or knowledge tension
- Makes the reader feel slightly behind or missing something
- Triggers mild discomfort or a hidden-discovery signal
- Forces the question: "Wait — why is that?"

**Self-test:** Would a distracted person scrolling past this stop immediately? If not — rewrite. No exceptions.

**Step 4 — Apply to Meta Description opening line**
The first sentence of the Meta Description must carry the same tension as the title — it amplifies, not repeats.

**Step 5 — Apply to all subheadings in the post body**
Each bold subheading inside the article must also pass the Hero test. No neutral section labels. Every subheading is a mini-hook that pulls the reader into the next block.

Do not proceed to post body generation until title, meta opening, and subheadings are confirmed against this gate.

---

## Narrative Formula

Every post must follow this arc — **do not label these sections in the text**:

**HOOK → QUESTION → JOURNEY → STORY+INSIGHT BALANCE → CURIOSITY GAP → BIG REVEAL → RESONANT ENDING**

### Hook (opening paragraph)
- Open with an anecdote, paradox, or surprising fact
- First 2–3 sentences feel like the start of a story, not a lecture
- Make the reader ask: "Wait… why is that?"

### Burning Question
- Frame the article around a core mystery, conflict, or "why/how" question
- Set up the "puzzle" that drives engagement

### Journey (main body)
Structure as: Setup → Conflict → Exploration → Resolution
- Alternate between narrative (mini-story, vivid scene) and insight (fact, expert reference, big idea)
- End paragraphs or sections with curiosity gaps: unanswered questions that pull the reader forward

### Big Reveal (final third)
- Deliver a surprising insight, counterintuitive conclusion, or "what this means for us"
- Reader should feel: "I'm glad I stayed until the end"

### Resonant Ending
- End with the **main statement in bold** — the single most important takeaway
- No flat summaries. No "in conclusion." Give a final spark.

---

## Formatting Rules

- **No bullet points or numbered lists** — continuous paragraphs only
- Each paragraph: 4–8 sentences
- Bold subheadings between paragraphs only when needed for clarity (no numeration)
- No emojis
- Active verbs, vivid imagery
- Vary sentence rhythm: short punchy lines + longer flowing ones
- Bold headers and subheaders where used

---

## SEO Requirements

- Semantically rich keywords woven naturally throughout
- Long-tail phrases relevant to the topic
- Structured headers for both human and AI indexing (Google + ChatGPT/Bard)
- Primary keyword in title, first paragraph, at least 2 subheadings, and conclusion
- No keyword stuffing — reads like editorial journalism

---

## Psychological Triggers

- FOMO to create urgency
- Questions to encourage discussion
- Power words: proven, hidden, exclusive, breakthrough, revealed, surprising

---

## YOU-ATTITUDE LAYER (Additive Amplifier)

This is not a replacement for the narrative formula or author voice. It is an additive layer that ensures the message lands **on** the reader — not just in front of them.

**Core principle:** At every major content turn, the reader should feel: *"This is about me. This affects me right now."*

### 5 Execution Rules

**1. Personal Framing**
Where possible, shift statements toward reader relevance. Use "you," "your," and implied personal situations. Replace third-person observation with second-person implication where the author voice allows it.
- ✗ "Most people ignore this stage"
- ✓ "You've probably skipped this stage without realizing it"

**2. Outcome Translation**
When presenting features, facts, or benefits — follow this structure:
*Feature → Outcome → Personal impact on the reader's actual life*
Do not stop at the feature. Always carry it one step further into the reader's experience.

**3. Mirror Moment (minimum 1 per post)**
Include at least one relatable situation, behavior, or frustration the reader has almost certainly experienced themselves.
Purpose: increase identification, reduce resistance, deepen engagement.
This can appear in the Hook, Journey body, or Big Reveal — but must appear somewhere.

**4. Decision Awareness**
At key turning points in the article, frame the insight as a decision the reader is actively making — even subconsciously.
This reinforces personal responsibility and raises the stakes of continuing to read.
- ✗ "Many people choose the wrong product"
- ✓ "Right now, based on what you believe about this, you're making a choice — even if you haven't thought of it that way"

**5. CTA Personalization (final line)**
The closing line of the post (the bold resonant ending) should reflect back on the reader's own current behavior, standard, or belief — not just deliver a general conclusion.
The reader should finish and think: *"That's actually about me."*

### Voice Calibration

You-Attitude intensity must match the author's register:

| Voice type | You-Attitude approach |
|---|---|
| High-authority / analytical (Taleb, Belkovsky, Kiselev) | Implied — situational recognition, not direct address |
| Journalistic / narrative (Parfonov, Varlamov, Gladwell) | Woven into storytelling; reader appears in the scene |
| Direct / motivational (Hormozi, Suby, Kiyosaki) | Explicit — direct "you" language throughout |
| Educational / warm (Komarovsky, Enders, Greger) | Empathetic — speak as if addressing the reader personally |

### Validation Before Finalizing (Optional but Recommended)

Before completing the post, check:
- [ ] Does the reader feel *included* — not just an observer?
- [ ] Is there at least one Mirror Moment of personal recognition?
- [ ] Are outcomes connected to the reader's real-life experience, not abstract benefits?
- [ ] Does the closing line land on the reader's current reality?

If any box is unchecked — revise before output.

---

## Brand Integration (Optional)

See: `references/brand-rules.md`

If a brand is specified by the user:
- Insert one natural link to the brand's official website using the correct language domain
- Do not mention the brand's product as a solution in the first half of the article
- Immerse the reader in the problem before introducing the brand
- **All product claims, ingredient names, and clinical data must be verified against `product` before use — no exceptions. If the Product Knowledge Gate was not already activated, activate it now.**

If no brand is specified: omit website link entirely.

---

## Language Rules

- **Default language: Russian** unless the user writes in another language
- Match the output language to the user's message language
- For non-English text (except Russian): keep all bracketed explanations or translations in English only

---

## Author Voice Reference

See: `references/author-voices.md`

Apply the chosen author's narrative style, sentence rhythm, vocabulary register, and structural habits throughout the entire post. The voice must be consistent and recognizable — not just a label.

---

## After the Post

When the blog post is complete, automatically prompt:

> "Статья готова. Хотите создать визуальный промпт для изображения к этой статье? (Do you want to generate an image prompt for this post?)"

If yes → hand off to the **image-prompt-generator** skill.
