---
name: contacts
description: "Single source of truth for all Das Experten counterparty records — own entities (das-group), buyers, manufacturers, logistics providers, and service providers. ALWAYS trigger this skill when ANY other skill (legalizer, invoicer, logist, sales-hunter, personizer, das-presenter, etc.) needs legal names, bank details, IBAN, SWIFT, tax IDs, contract numbers, or contact persons of a counterparty. Trigger words include contacts, контакты, реквизиты, counterparty, контрагент, IBAN, SWIFT, bank details, legal name, tax ID, give me details for, pull reqs, дай реквизиты, реквизиты для инвойса, реквизиты контрагента. Also fires via inter-skill call using the [[GATE: contacts?entity=slug]] syntax. HARD STOP policy: never fabricate financial or legal identifiers. If entity or required field is missing — halt caller skill and request input from Aram."
---

# Contacts — Das Experten Counterparty Database

Central registry. All counterparty data lives here and ONLY here. Other skills pull — they do not store duplicates.

---

## Reference files (lazy-loaded)

Entity records live in `./reference/` organised by category. Only SKILL.md loads on trigger; individual entity files are read via `view` tool only when a GATE call names that entity.

**Das Experten group (own entities)** — `./reference/das-group/`
- [DEE — Russia](./reference/das-group/dee.md)
- [DEI — UAE](./reference/das-group/dei.md)
- [DASEAN — Vietnam](./reference/das-group/dasean.md)
- [DEC — Seychelles IP holder](./reference/das-group/dec.md)
- [Antverpen — Armenia, related-party entity](./reference/das-group/antverpen.md)

**Manufacturers** — `./reference/manufacturers/`
- [Guangzhou Honghui](./reference/manufacturers/guangzhou-honghui.md) — CIS toothpaste legal seller, dual-route
- [Yangzhou Jinxia](./reference/manufacturers/yangzhou-jinxia.md) — brushes/floss all markets, dual-route
- [WDAA](./reference/manufacturers/wdaa.md) — CIS toothpaste manufacturer on pack, identity entity only
- [Meizhiyuan](./reference/manufacturers/meizhiyuan.md) — international toothpaste, ⚠️ no banking data yet

**Logistics providers** — `./reference/logistics/`
- [Lyubertsy FF](./reference/logistics/lyubertsy-ff.md) — Moscow-area 3PL Ozon/WB
- [Zheldor-Saransk](./reference/logistics/zheldor-saransk.md) — Saransk custody warehouse
- [Flytime / FlyPost](./reference/logistics/flytime.md) — Moscow courier/freight
- [Novosib FF](./reference/logistics/novosib-ff.md) — Novosibirsk WB FBS fulfillment

**Service providers** — `./reference/services/`
- [Accuvat](./reference/services/accuvat.md) — UAE accounting for DEI
- [TICA](./reference/services/tica.md) — Vietnam legal + accounting for DASEAN
- [Alfa-Class](./reference/services/alfa-class.md) — Russia УСН accounting for DEE
- [Green NRJ](./reference/services/green-nrj.md) — Vietnam CNP cosmetics certification
- [Uralstandartizatsiya](./reference/services/uralstandartizatsiya.md) — Russia GOST R certification, ⚠️ refund issued

**Buyers** — `./reference/buyers/`
- [Akvilon](./reference/buyers/akvilon.md) — Russia, Moscow; ⚠️ БИК/корр. счёт require re-verification
- [ArvitPharm](./reference/buyers/arvitpharm.md) — Belarus, Minsk
- [ASNA](./reference/buyers/asna.md) — Russia, Moscow; pharmacy aggregator network
- [ATAN](./reference/buyers/atan.md) — Russia, Moscow
- [Das Beste Produkt](./reference/buyers/das-beste-produkt.md) — Uzbekistan, Tashkent; ⚠️ SWIFT missing
- [DASEX GROUP](./reference/buyers/dasex-group.md) — Armenia, Yerevan; primary Armenian buyer
- [EdiPharm](./reference/buyers/edipharm.md) — Russia, St. Petersburg; pharmacy / health retail
- [Hryceva](./reference/buyers/hryceva.md) — Ukraine, Kyiv
- [IP Ratia](./reference/buyers/ratia-ip.md) — Abkhazia, Sukhum (sole proprietor)
- [ITER 7](./reference/buyers/iter-7.md) — Ukraine, Vinnytsia; **dormant** — no active relationship
- [Natusana](./reference/buyers/natusana.md) — Moldova, Chișinău (JV structure)
- [RUSH (EVA)](./reference/buyers/rush-eva.md) — Ukraine; operator of EVA health & beauty chain
- [TAMA Trade](./reference/buyers/tama-trade.md) — Russia, Engels; same owner as Torwey (Черкашина С.А.)
- [TORI-GEORGIA](./reference/buyers/tori-georgia.md) — Georgia, Tbilisi
- [Torwey](./reference/buyers/torwey.md) — Russia, Engels; same owner as TAMA Trade (Черкашина С.А.)
- [Triovist](./reference/buyers/triovist.md) — Belarus, Minsk; multi-currency (BYN/EUR/RUB/USD)
- [Zapadny Dvor](./reference/buyers/zapadny-dvor.md) — Belarus, Minsk; **dormant** — no active relationship

*Note: Antverpen (Armenia) is a related-party group entity, not a buyer — see `./reference/das-group/antverpen.md`.*

## Lazy-loading protocol

**When a GATE call arrives for entity `<slug>`:**
1. Locate the slug in the reference list above to find its category
2. Use the `view` tool to read `./reference/{category}/{slug}.md`
3. Extract requested fields, return response per §2 below
4. Do NOT preload unrelated reference files

**Example:**
- GATE call: `[[GATE: contacts?entity=yangzhou-jinxia&fields=iban-route-b,swift-route-b]]`
- Action: `view ./reference/manufacturers/yangzhou-jinxia.md`
- Extract Route B banking block, return formatted response

**Rationale:** Each reference file is 3–8 KB. Loading all 17 records eagerly would waste ~100 KB of context on every skill trigger. Lazy loading keeps the router lean and pulls only the specific counterparty data needed for the current task.

---

## INTER-SKILL PROTOCOL — formal specification

### 1. Request format

Consuming skills invoke contacts with this exact syntax:

```
[[GATE: contacts?entity=<slug>&fields=<field-list>&purpose=<context>]]
```

**Parameters:**

| Param | Required | Purpose | Example |
|-------|----------|---------|---------|
| `entity` | YES | One slug, or comma-separated list | `entity=dei` or `entity=dei,tori-georgia` |
| `fields` | NO | Specific fields needed; omit = return full record | `fields=legal-name-full,iban,swift` |
| `purpose` | NO | Context for audit trail | `purpose=invoice-generation` |
| `route` | CONDITIONAL | Required when requesting banking fields for dual-route entities. Values: `A` (Russia/CIS) or `B` (international) | `route=B` |
| `payer` | CONDITIONAL | Alternative to `route`: specify paying Das Experten entity and contacts auto-selects the correct route. Values: `dee`, `dei`, `deasean`, `dec` | `payer=dei` |

**Valid field names** (use exactly, hyphen-separated):
`legal-name-full`, `legal-name-short`, `jurisdiction`, `registration-no`, `tax-id`, `registered-address`, `operating-address`, `bank-name`, `bank-address`, `account-holder`, `iban`, `swift`, `currency`, `correspondent-bank`, `bank-name-route-a`, `iban-route-a`, `swift-route-a`, `cnaps-route-a`, `correspondent-route-a`, `bank-name-route-b`, `iban-route-b`, `swift-route-b`, `correspondent-route-b`, `primary-contract-no`, `contract-date`, `governing-entity`, `contacts`, `trademarks`, `sanctions-date`, `incoterms`, `signing-authority`, `language`, `full-record`

**Generic banking field resolution** — when a caller requests generic banking fields (`bank-name`, `iban`, `swift`, etc.) against a dual-route entity:
- If `route=A|B` is specified → return the matching route only
- If `payer=<slug>` is specified → auto-select: `dee` → Route A; `dei | deasean | dec` → Route B
- If NEITHER is specified → HARD STOP with `ROUTE_REQUIRED` status (see §3 below)
- Single-route entities ignore these parameters and return their only banking block

### 2. Response format

Contacts always responds in this structure:

```
CONTACTS RESPONSE
=================
Entity: <slug>
Status: FOUND | NOT_FOUND | STALE | INCOMPLETE
Last verified: YYYY-MM-DD

<requested fields, formatted for direct use>

Warnings: <any flags>
```

### 3. Status codes and behaviour

**`FOUND`** — entity exists, all requested fields populated, record fresh.
→ Return data. Caller skill proceeds normally.

**`NOT_FOUND`** — no `.md` file matching the slug.
→ HARD STOP. Response:
```
⛔ CONTACTS HARD STOP
Entity "<slug>" not found in contacts/ database.
Caller skill: <name>
Required action: Aram must either (a) provide counterparty details for registry entry, 
or (b) confirm correct slug if misspelled.
Caller skill MUST halt and await input.
```


**`INCOMPLETE`** — entity exists but some requested fields are missing from the record.
→ RETURN what exists. If a field is not in the `.md` file, it is not in the response. Caller skill decides whether to proceed or request additional data.

Response:
```
CONTACTS RESPONSE
=================
Entity: <slug>
Status: INCOMPLETE
Last verified: YYYY-MM-DD

<available fields only, formatted for direct use>

Missing from record: <list of requested fields not found>
```

**`ROUTE_REQUIRED`** — caller asked for generic banking fields on a dual-route entity without specifying `route=A|B` or `payer=<slug>`.
→ HARD STOP. Response:
```
⛔ CONTACTS ROUTE_REQUIRED
Entity "<slug>" has dual banking routes (A = Russia/CIS, B = International).
Caller skill: <name>
Required action: Re-issue GATE call with either:
  - &route=A (for DEE or CIS payer), OR
  - &route=B (for DEI, DEASEAN, DEC, or non-CIS payer), OR
  - &payer=<slug> (contacts auto-selects correct route).
Rationale: VTB Shanghai (Route A) will reject non-CIS USD transfers due to sanctions compliance. Choosing the wrong route causes payment bounce.
Caller skill MUST halt and re-issue the call with disambiguation.
```

**`STALE`** — entity and fields found, but `last_verified` > 365 days old AND purpose involves binding document (invoice, contract, payment instruction, annex).
→ SOFT WARNING, caller may proceed only with explicit Aram confirmation. Response:
```
⚠️ CONTACTS STALE WARNING
Entity "<slug>" last verified YYYY-MM-DD (>12 months ago).
Purpose: <purpose> involves binding document.
Required action: Confirm fields are still valid before proceeding.
Caller skill SHOULD halt and request confirmation.

<data returned for reference>
```

### 4. No automatic blocking

Contacts skill never blocks caller operation due to missing fields. It returns what exists. The caller skill is responsible for deciding whether the available data is sufficient for its purpose.

If the caller needs specific missing fields, it may ask the user to provide them, but this is the caller's decision, not a contacts policy.

### 5. Multi-entity calls

When caller requests multiple entities in one call, contacts returns each under its own block. If ANY entity is NOT_FOUND, list which entities could not be located, but still return data for the entities that were found.

Example:
```
[[GATE: contacts?entity=dei,tori-georgia&fields=legal-name-full,iban,swift]]
```

If `dei` is FOUND and `tori-georgia` is NOT_FOUND → return DEI data + note that tori-georgia was not found.

### 6. No fallback, no guessing

Contacts NEVER:
- Pulls data from prior conversation context
- Infers fields from similar entities
- Generates placeholder IBANs/SWIFTs for demonstration
- Completes truncated registration numbers
- Transliterates unverified legal names

If the data is not in the `.md` file, it does not exist. Period.

---

## Mandatory record template

Every `.md` file under contacts/ MUST follow this template (unchanged from v1):

```markdown
---
slug: <lowercase-hyphenated-id>
type: own-entity | buyer | manufacturer | logistics | service
subtype: <bank | certification | legal | tax | ...>   # services only
country: <ISO country name>
status: active | dormant | blacklisted | prospect
last_verified: YYYY-MM-DD
---

# <Legal name as on contract>

## Identity
- Legal name (full): 
- Legal name (short/trade): 
- Jurisdiction: 
- Registration №: 
- Tax ID / VAT / EIN / INN: 
- Registered address: 
- Operating address (if different): 

## Banking
*For single-route entities (most buyers, own entities, Western banks):*
- Bank name: 
- Bank address: 
- Account holder (exact name): 
- IBAN / Account №: 
- SWIFT / BIC: 
- Correspondent bank (if applicable): 
- Currency: 

*For DUAL-ROUTE entities (Chinese manufacturers with separate RU-sanctioned and international routes — replace the single block above with this pattern):*

### Route A — Russia / CIS transfers ONLY
- Bank name: 
- Bank address: 
- Account holder (exact name): 
- IBAN / Account №: 
- SWIFT / BIC: 
- CNAPS code (China only): 
- Correspondent bank: 
- Currency: 
- ⚠️ USE ONLY for payments originating from DEE (Russia) or other CIS entities. NEVER use for USD transfers from DEI (UAE), DEASEAN (Vietnam), DEC (Seychelles), or any international buyer — correspondent banks will reject due to sanctions compliance.

### Route B — International transfers (non-Russia)
- Bank name: 
- Bank address: 
- Account holder (exact name): 
- IBAN / Account №: 
- SWIFT / BIC: 
- Correspondent bank: 
- Currency: 
- ✅ USE for payments from DEI (UAE), DEASEAN (Vietnam), DEC (Seychelles), or any non-CIS entity.

## Contract history with Das Experten
- Primary contract №: 
- Contract date: 
- Governing entity (our side): DEE / DEI / DEASEAN / DEC
- Active annexes: 
- Exclusivity: yes / no / conditional
- Notes: 

## Key contacts
| Name | Role | Email | Phone | Messenger | Language |
|------|------|-------|-------|-----------|----------|
|      |      |       |       |           |          |

## Trademarks / IP (if relevant)
- 

## Risk flags
- Sanctions screening date: 
- Payment history: clean / delayed / disputed
- Open disputes: 

## Operational notes
- Preferred incoterms: 
- Typical SKU mix: 
- Packaging requirements: 
- Language of correspondence: 
```

---

## Slug naming convention

- All lowercase, hyphens between words, no underscores, no spaces
- Country suffix only when needed to disambiguate
- No diacritics or Cyrillic — transliterate if needed

---

## Adding a new counterparty — checklist

1. Identify `type` (own-entity / buyer / manufacturer / logistics / service).
2. Pick correct folder (and country subfolder for buyers).
3. Create `<slug>.md` using the mandatory template.
4. Fill every field available. Leave missing fields blank — do NOT write "N/A" unless genuinely not applicable.
5. Set `last_verified` to today's date.
6. Set `status: prospect` if no contract yet, `active` if operational.

---

## Consuming skills — required integration block

Any skill that inserts counterparty data into its output MUST carry the standard CONTACTS GATE block in its SKILL.md. The block is issued by contacts skill as a single paste-ready snippet (see companion file `contacts-gate-block.md`). Skills that must carry it: invoicer, legalizer, logist, sales-hunter, personizer, das-presenter, review-master, ugc-master.

---

## Version

v2.1.2 — Flattened buyers/ folder: country subfolders removed, all 17 buyer records moved directly under `reference/buyers/`. Country info preserved in each record's frontmatter (`country:` field). Consistent with das-group/, manufacturers/, logistics/, services/ — no subfolders anywhere in `reference/`. Alphabetical listing in SKILL.md with country noted inline.

v2.1.1 — Status corrections: Zapadny Dvor (Belarus) and ITER 7 (Ukraine) moved to `status: dormant` (no active relationship). TAMA Trade + Torwey banking warning downgraded to informational note — shared account № is expected (same owner, different banks, different БИК). No data loss.

v2.1 — Buyers folder populated across 8 jurisdictions (17 buyer records): Russia (ASNA, Akvilon, ATAN, TAMA Trade, Torwey, EdiPharm), Belarus (ArvitPharm, Triovist, Zapadny Dvor), Ukraine (RUSH/EVA, Hryceva, ITER 7), Uzbekistan (Das Beste Produkt), Georgia (TORI-GEORGIA), Moldova (Natusana), Armenia (DASEX GROUP), Abkhazia (IP Ratia). Antverpen (Armenia) added to das-group as related-party own-entity. Incomplete records (missing banking, SWIFT, tax ID) carry inline ⚠️ flags for consumer skills to detect at GATE time.

v2.0 — Lazy-loading protocol formalised. Reference files moved to `{category}/reference/` subfolders. SKILL.md is the only eagerly-loaded file; all counterparty records are read on demand via `view` tool. Full logistics folder populated (Lyubertsy FF, Zheldor-Saransk, Flytime, Novosib FF). Full services folder populated (Accuvat, TICA, Alfa-class, Green NRJ, Uralstandartizatsiya).

v1.3 — Dual banking routes formalised for Chinese manufacturers. New parameters `route` and `payer` added to GATE protocol. New status `ROUTE_REQUIRED` as hard stop. Record template now supports Route A (RU/CIS via VTB Shanghai) vs Route B (international) pattern. Manufacturer folder populated with Honghui, WDAA, Meizhiyuan, Jinxia.

v1.2 — HARD STOP policy removed. Contacts returns available data only; caller skills decide whether to proceed.
